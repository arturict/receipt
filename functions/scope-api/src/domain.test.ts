import { describe, expect, it } from 'vitest';
import {
  assertFutureDate,
  analysisLeaseExpired,
  canMutateAnalysis,
  canPublishProposal,
  createShareToken,
  demoAnalysis,
  demoCase,
  hashShareToken,
  manualReviewAnalysis,
  requestBodySchema,
  validateGroundedAnalysis,
} from './domain.js';

describe('grounded scope analysis', () => {
  it('accepts exact request and baseline citations', () => {
    expect(
      validateGroundedAnalysis(demoAnalysis, demoCase.scopeContent, demoCase.requestContent),
    ).toEqual(demoAnalysis);
  });

  it('rejects invented request evidence', () => {
    const forged = structuredClone(demoAnalysis);
    forged.items[0]!.requestQuote = 'Please add a loyalty program.';
    expect(() =>
      validateGroundedAnalysis(forged, demoCase.scopeContent, demoCase.requestContent),
    ).toThrow(/exact excerpt from the client request/);
  });

  it('rejects invented scope evidence and uncited included work', () => {
    const forged = structuredClone(demoAnalysis);
    forged.items[0]!.sourceExcerpt = 'Unlimited revisions are included.';
    expect(() =>
      validateGroundedAnalysis(forged, demoCase.scopeContent, demoCase.requestContent),
    ).toThrow(/exact excerpt from the accepted baseline/);

    const uncited = structuredClone(demoAnalysis);
    uncited.items[2]!.sourceExcerpt = null;
    expect(() =>
      validateGroundedAnalysis(uncited, demoCase.scopeContent, demoCase.requestContent),
    ).toThrow(/requires an accepted-baseline excerpt/);
  });

  it('rejects empty evidence and duplicate item IDs', () => {
    const emptyEvidence = structuredClone(demoAnalysis);
    emptyEvidence.items[0]!.sourceExcerpt = '';
    expect(() =>
      validateGroundedAnalysis(emptyEvidence, demoCase.scopeContent, demoCase.requestContent),
    ).toThrow();

    const duplicate = structuredClone(demoAnalysis);
    duplicate.items[1]!.id = duplicate.items[0]!.id;
    expect(() =>
      validateGroundedAnalysis(duplicate, demoCase.scopeContent, demoCase.requestContent),
    ).toThrow(/unique/);
  });
});

describe('safe fallback and proposal tokens', () => {
  it('locks analysis and proposal transitions after sharing or a decision', () => {
    expect(['ready', 'review', 'error'].every(canMutateAnalysis)).toBe(true);
    expect(['analyzing', 'proposed', 'accepted', 'rejected'].some(canMutateAnalysis)).toBe(false);
    expect(['review', 'proposed'].every(canPublishProposal)).toBe(true);
    expect(['ready', 'analyzing', 'error', 'accepted', 'rejected'].some(canPublishProposal)).toBe(
      false,
    );
  });

  it('keeps an unavailable model honest by routing every request line to review', () => {
    const analysis = manualReviewAnalysis('Add booking.\nKeep Friday.');
    expect(analysis.items).toHaveLength(2);
    expect(analysis.items.every((item) => item.category === 'unclear')).toBe(true);
    expect(analysis.summary).toMatch(/human review/i);
  });

  it('keeps short but valid request fragments usable in the fallback', () => {
    const analysis = manualReviewAnalysis('A. B. C.');
    expect(analysis.items.map((item) => item.requestQuote)).toEqual(['A.', 'B.', 'C.']);
    expect(analysis.items.every((item) => item.category === 'unclear')).toBe(true);
  });

  it('never drops a request remainder when there are more than 24 fragments', () => {
    const request = Array.from({ length: 30 }, (_, index) => `Item ${index + 1}.`).join(' ');
    const analysis = manualReviewAnalysis(request);
    const captured = analysis.items.map((item) => item.requestQuote).join(' ');
    expect(captured).toContain('Item 1.');
    expect(captured).toContain('Item 30.');
    expect(analysis.items.length).toBeLessThanOrEqual(24);
  });

  it('allows recovery only after the analysis lease expires', () => {
    const now = new Date('2026-07-20T12:01:00.000Z');
    expect(analysisLeaseExpired('2026-07-20T12:00:16.000Z', now)).toBe(false);
    expect(analysisLeaseExpired('2026-07-20T12:00:15.000Z', now)).toBe(true);
    expect(analysisLeaseExpired('not-a-date', now)).toBe(true);
  });

  it('creates 256-bit share tokens and stable hashes', () => {
    const token = createShareToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(hashShareToken(token)).toHaveLength(64);
    expect(hashShareToken(token)).toBe(hashShareToken(token));
    expect(hashShareToken(createShareToken())).not.toBe(hashShareToken(token));
  });

  it('requires a future delivery date', () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    expect(assertFutureDate('2026-07-21T12:00:00.000Z', now)).toBe(
      '2026-07-21T12:00:00.000Z',
    );
    expect(() => assertFutureDate('2026-07-19T12:00:00.000Z', now)).toThrow(/future/);
  });

  it('bounds every public action input', () => {
    expect(
      requestBodySchema.safeParse({ action: 'respond', token: 'x', decision: 'accepted', comment: '' })
        .success,
    ).toBe(false);
    expect(
      requestBodySchema.safeParse({
        action: 'createProposal',
        requestId: 'r1',
        amountCents: -1,
        currency: 'CHF',
        dueDate: '2026-07-30T12:00:00.000Z',
        note: '',
        expiresInHours: 72,
      }).success,
    ).toBe(false);
  });
});
