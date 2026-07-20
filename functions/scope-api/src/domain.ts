import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const citationText = (max: number) => z.string().trim().min(3).max(max);
export const MAX_ANALYSIS_ITEMS = 24;
export const ANALYSIS_LEASE_MS = 45_000;

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainValidationError';
  }
}

export const analysisItemSchema = z.object({
  id: z.string().trim().min(1).max(48),
  category: z.enum(['included', 'additional', 'unclear']),
  requestQuote: boundedText(600),
  sourceExcerpt: citationText(900).nullable(),
  rationale: boundedText(600),
  confidence: z.enum(['high', 'medium', 'low']),
  clarificationQuestion: z.string().trim().max(500).nullable(),
});

export const analysisSchema = z
  .object({
    summary: boundedText(700),
    items: z.array(analysisItemSchema).min(1).max(MAX_ANALYSIS_ITEMS),
  })
  .superRefine(({ items }, context) => {
    const ids = new Set<string>();
    items.forEach((item, index) => {
      if (ids.has(item.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Analysis item IDs must be unique.',
          path: ['items', index, 'id'],
        });
      }
      ids.add(item.id);
    });
  });

export type ScopeAnalysis = z.infer<typeof analysisSchema>;

export function canMutateAnalysis(status: unknown): boolean {
  return status === 'ready' || status === 'review' || status === 'error';
}

export function canPublishProposal(status: unknown): boolean {
  return status === 'review' || status === 'proposed';
}

export const createCaseSchema = z.object({
  action: z.literal('createCase'),
  projectName: boundedText(120),
  clientName: boundedText(120),
  scopeTitle: boundedText(120),
  scopeContent: boundedText(12_000),
  requestTitle: boundedText(160),
  requestContent: boundedText(4_000),
});

export const analyzeSchema = z.object({
  action: z.literal('analyze'),
  requestId: boundedText(36),
});

export const startManualReviewSchema = z.object({
  action: z.literal('startManualReview'),
  requestId: boundedText(36),
});

export const stateSchema = z.object({
  action: z.literal('state'),
});

export const saveAnalysisSchema = z.object({
  action: z.literal('saveAnalysis'),
  requestId: boundedText(36),
  analysis: analysisSchema,
});

export const createProposalSchema = z.object({
  action: z.literal('createProposal'),
  requestId: boundedText(36),
  amountCents: z.number().int().min(0).max(100_000_000),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  dueDate: z.string().datetime(),
  note: z.string().trim().max(4_000),
  expiresInHours: z.number().int().min(1).max(168).default(72),
});

export const publicSchema = z.object({
  action: z.literal('getPublic'),
  token: z.string().regex(/^[a-f0-9]{64}$/),
});

export const respondSchema = z.object({
  action: z.literal('respond'),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(['accepted', 'rejected']),
  comment: z.string().trim().max(1_000),
});

export const requestBodySchema = z.discriminatedUnion('action', [
  createCaseSchema,
  analyzeSchema,
  startManualReviewSchema,
  stateSchema,
  saveAnalysisSchema,
  createProposalSchema,
  publicSchema,
  respondSchema,
]);

export type RequestBody = z.infer<typeof requestBodySchema>;

function normalizeForMatch(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
}

export function validateGroundedAnalysis(
  value: unknown,
  baseline: string,
  request: string,
): ScopeAnalysis {
  const analysis = analysisSchema.parse(value);
  const normalizedBaseline = normalizeForMatch(baseline);
  const normalizedRequest = normalizeForMatch(request);

  for (const item of analysis.items) {
    if (!normalizedRequest.includes(normalizeForMatch(item.requestQuote))) {
      throw new DomainValidationError(
        `Evidence item ${item.id} must use an exact excerpt from the client request.`,
      );
    }
    if (
      item.sourceExcerpt !== null &&
      !normalizedBaseline.includes(normalizeForMatch(item.sourceExcerpt))
    ) {
      throw new DomainValidationError(
        `Evidence item ${item.id} must use an exact excerpt from the accepted baseline.`,
      );
    }
    if (item.category === 'included' && item.sourceExcerpt === null) {
      throw new DomainValidationError(
        `Included evidence item ${item.id} requires an accepted-baseline excerpt.`,
      );
    }
  }

  return analysis;
}

export function manualReviewAnalysis(request: string): ScopeAnalysis {
  let parts = request
    .split(/(?:\r?\n|(?<=[.!?])\s+)/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > MAX_ANALYSIS_ITEMS || parts.some((part) => part.length > 600)) {
    parts = [];
    let remaining = request.trim();
    while (remaining) {
      if (remaining.length <= 600) {
        parts.push(remaining);
        break;
      }
      const window = remaining.slice(0, 601);
      const breakAt = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
      const end = breakAt >= 360 ? breakAt : 600;
      parts.push(remaining.slice(0, end).trim());
      remaining = remaining.slice(end).trimStart();
    }
  }

  const items = (parts.length > 0 ? parts : [request.trim()]).map((part, index) => ({
    id: `manual-${index + 1}`,
    category: 'unclear' as const,
    requestQuote: part.slice(0, 600),
    sourceExcerpt: null,
    rationale: 'The automated comparison was unavailable. A person must compare this complete request segment with the accepted scope.',
    confidence: 'low' as const,
    clarificationQuestion: 'Which accepted deliverable, exclusion, or limit should this request be compared with?',
  }));

  return analysisSchema.parse({
    summary: 'Automatic analysis was unavailable. The complete request was segmented for explicit human review.',
    items,
  });
}

export function hashShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createShareToken(): string {
  return randomBytes(32).toString('hex');
}

export function assertFutureDate(value: string, now = new Date()): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= now.getTime()) {
    throw new DomainValidationError('The proposed delivery date must be in the future.');
  }
  return parsed.toISOString();
}

export function analysisLeaseExpired(
  updatedAt: unknown,
  now = new Date(),
  leaseMs = ANALYSIS_LEASE_MS,
): boolean {
  const startedAt = new Date(String(updatedAt || '')).getTime();
  return !Number.isFinite(startedAt) || now.getTime() - startedAt >= leaseMs;
}

export const demoCase = {
  projectName: 'Northstar launch site',
  clientName: 'Northstar Coffee',
  scopeTitle: 'Accepted website scope — version 1',
  scopeContent: [
    'Deliverables',
    '- Five responsive pages: Home, Story, Menu, Locations, Contact.',
    '- One content revision round after the first complete draft.',
    '- Contact form delivery to hello@northstar.example.',
    '- Launch target: Friday, 31 July 2026.',
    '',
    'Explicit exclusions',
    '- No booking, checkout, membership, or customer account system.',
    '- Additional content rounds require a written change proposal.',
    '- Client supplies final photography before 24 July 2026.',
  ].join('\n'),
  requestTitle: 'Quick additions before Friday',
  requestContent: [
    'Can you add table bookings with confirmation emails?',
    'We also need two more content revision rounds.',
    'The Friday launch date should stay the same.',
  ].join('\n'),
} as const;

export const demoAnalysis: ScopeAnalysis = {
  summary: 'The fixed launch date remains in scope, while booking and extra revision rounds change the accepted work. Delivery impact still needs a human decision.',
  items: [
    {
      id: 'booking',
      category: 'additional',
      requestQuote: 'Can you add table bookings with confirmation emails?',
      sourceExcerpt: 'No booking, checkout, membership, or customer account system.',
      rationale: 'The accepted scope explicitly excludes booking systems.',
      confidence: 'high',
      clarificationQuestion: 'What booking rules, availability source, and cancellation flow are required?',
    },
    {
      id: 'revisions',
      category: 'additional',
      requestQuote: 'We also need two more content revision rounds.',
      sourceExcerpt: 'One content revision round after the first complete draft.',
      rationale: 'Two additional rounds exceed the single accepted revision round.',
      confidence: 'high',
      clarificationQuestion: null,
    },
    {
      id: 'date',
      category: 'included',
      requestQuote: 'The Friday launch date should stay the same.',
      sourceExcerpt: 'Launch target: Friday, 31 July 2026.',
      rationale: 'The requested date matches the accepted launch target, but added work may require a schedule change.',
      confidence: 'medium',
      clarificationQuestion: 'Should the original scope launch first if the booking flow cannot be completed safely by Friday?',
    },
  ],
};
