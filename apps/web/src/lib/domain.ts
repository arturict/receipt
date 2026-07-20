import type {
  AnalysisItem,
  EventKind,
  ReceiptState,
  RequestRow,
  ScopeAnalysis,
  ScopeCategory,
} from './types'

export const emptyState: ReceiptState = {
  projects: [],
  scopes: [],
  requests: [],
  events: [],
  eventsTruncated: false,
}

export const categoryOrder: ScopeCategory[] = ['included', 'additional', 'unclear']
export const MAX_ANALYSIS_ITEMS = 24
export const ANALYSIS_LEASE_MS = 45_000

export const categoryCopy: Record<
  ScopeCategory,
  { label: string; short: string; description: string }
> = {
  included: {
    label: 'Already included',
    short: 'Included',
    description: 'The accepted baseline already covers this request.',
  },
  additional: {
    label: 'Additional work',
    short: 'Additional',
    description: 'This changes or exceeds the accepted baseline.',
  },
  unclear: {
    label: 'Needs a decision',
    short: 'Unclear',
    description: 'A person needs to clarify the boundary before committing.',
  },
}

export function readAnalysis(request: RequestRow | undefined): ScopeAnalysis | null {
  if (!request?.analysisJson) return null

  try {
    const value = JSON.parse(request.analysisJson) as Partial<ScopeAnalysis>
    if (typeof value.summary !== 'string' || !Array.isArray(value.items)) return null
    return value as ScopeAnalysis
  } catch {
    return null
  }
}

export function groupAnalysis(items: AnalysisItem[]): Record<ScopeCategory, AnalysisItem[]> {
  return items.reduce<Record<ScopeCategory, AnalysisItem[]>>(
    (groups, item) => {
      groups[item.category].push(item)
      return groups
    },
    { included: [], additional: [], unclear: [] },
  )
}

export function nextHumanItemId(items: Pick<AnalysisItem, 'id'>[]): string {
  const ids = new Set(items.map((item) => item.id))
  let sequence = 1
  while (ids.has(`human-${sequence}`)) sequence += 1
  return `human-${sequence}`
}

export function canMutateAnalysis(status: RequestRow['status']): boolean {
  return status === 'ready' || status === 'review' || status === 'error'
}

export function analysisLeaseExpired(
  updatedAt: string,
  now = new Date(),
  leaseMs = ANALYSIS_LEASE_MS,
): boolean {
  const startedAt = new Date(updatedAt).getTime()
  return !Number.isFinite(startedAt) || now.getTime() - startedAt >= leaseMs
}

export function getSelectedRequest(
  state: ReceiptState,
  selectedRequestId: string | null,
): RequestRow | undefined {
  return (
    state.requests.find((request) => request.$id === selectedRequestId) ??
    state.requests[0]
  )
}

export function formatMoney(amountCents?: number | null, currency = 'EUR'): string {
  if (typeof amountCents !== 'number') return '—'
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amountCents / 100)
}

export function formatDate(value?: string | null, withTime = false): string {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

export function formatDateOnly(value?: string | null): string {
  const datePart = value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]
  if (!datePart) return '—'
  const date = new Date(`${datePart}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== datePart) return '—'
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function getShareToken(search: string, hash = ''): string | null {
  const fragmentToken = new URLSearchParams(hash.replace(/^#/, '')).get('share')
  const token = fragmentToken || new URLSearchParams(search).get('share')
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null
}

export function getShareLink(token: string, location: Pick<Location, 'origin' | 'pathname'>): string {
  const url = new URL(location.pathname, location.origin)
  url.hash = new URLSearchParams({ share: token }).toString()
  return url.toString()
}

export function scrubbedSharePath(pathname: string, search: string, token: string | null): string {
  const queryValues = new URLSearchParams(search)
  queryValues.delete('share')
  const query = queryValues.toString()
  const fragment = token ? `#${new URLSearchParams({ share: token })}` : ''
  return `${pathname}${query ? `?${query}` : ''}${fragment}`
}

export function toProposalIso(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a valid delivery date.')
  const parsed = new Date(`${date}T23:59:59.999Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Choose a valid delivery date.')
  }
  return parsed.toISOString()
}

export function priceToCents(value: string): number {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error('Enter a price with at most two decimal places.')
  }
  const cents = Math.round(Number(normalized) * 100)
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100_000_000) {
    throw new Error('Enter a price between 0 and 1,000,000.')
  }
  return cents
}

export const eventLabels: Record<EventKind, string> = {
  scope_accepted: 'Baseline recorded',
  request_created: 'Request recorded',
  analysis_requested: 'Comparison started',
  analysis_ready: 'Comparison ready',
  analysis_failed: 'Manual review required',
  analysis_reviewed: 'Review saved',
  proposal_created: 'Proposal created',
  client_accepted: 'Accepted via capability link',
  client_rejected: 'Rejected via capability link',
}

export function requestStatusLabel(status: RequestRow['status']): string {
  const labels: Record<RequestRow['status'], string> = {
    draft: 'Draft',
    ready: 'Ready to compare',
    analyzing: 'Comparing',
    review: 'Human review',
    proposed: 'Link active',
    accepted: 'Accepted',
    rejected: 'Rejected',
    error: 'Needs attention',
  }
  return labels[status]
}
