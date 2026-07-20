export type ScopeCategory = 'included' | 'additional' | 'unclear'
export type Confidence = 'high' | 'medium' | 'low'

export interface AnalysisItem {
  id: string
  category: ScopeCategory
  requestQuote: string
  sourceExcerpt: string | null
  rationale: string
  confidence: Confidence
  clarificationQuestion: string | null
}

export interface ScopeAnalysis {
  summary: string
  items: AnalysisItem[]
}

interface AppwriteRow {
  $id: string
  $createdAt: string
  $updatedAt: string
}

export interface ProjectRow extends AppwriteRow {
  name: string
  clientName: string
  status: 'active' | 'archived'
}

export interface ScopeRow extends AppwriteRow {
  projectId: string
  version: number
  title: string
  content: string
  acceptedAt: string
}

export type RequestStatus =
  | 'draft'
  | 'ready'
  | 'analyzing'
  | 'review'
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'error'

export interface RequestRow extends AppwriteRow {
  projectId: string
  scopeVersionId: string
  title: string
  content: string
  status: RequestStatus
  analysisJson?: string | null
  analysisSource: 'pending' | 'azure' | 'manual' | 'demo'
  analysisModel?: string | null
  analyzedAt?: string | null
  reviewedAt?: string | null
  proposalAmountCents?: number | null
  proposalCurrency?: string | null
  proposalDueDate?: string | null
  proposalNote?: string | null
  shareExpiresAt?: string | null
  clientDecision?: 'pending' | 'accepted' | 'rejected' | null
  clientComment?: string | null
  respondedAt?: string | null
}

export type EventKind =
  | 'scope_accepted'
  | 'request_created'
  | 'analysis_requested'
  | 'analysis_ready'
  | 'analysis_failed'
  | 'analysis_reviewed'
  | 'proposal_created'
  | 'client_accepted'
  | 'client_rejected'

export interface EventRow extends AppwriteRow {
  projectId: string
  requestId?: string | null
  kind: EventKind
  actor: 'operator' | 'client' | 'system'
  summary: string
}

export interface ReceiptState {
  projects: ProjectRow[]
  scopes: ScopeRow[]
  requests: RequestRow[]
  events: EventRow[]
  eventsTruncated: boolean
}

export interface CaseDraft {
  projectName: string
  clientName: string
  scopeTitle: string
  scopeContent: string
  requestTitle: string
  requestContent: string
}

export interface ProposalDraft {
  amountCents: number
  currency: string
  dueDate: string
  note: string
  expiresInHours: number
}

export type FunctionAction =
  | ({ action: 'createCase' } & CaseDraft)
  | { action: 'state' }
  | { action: 'analyze'; requestId: string }
  | { action: 'startManualReview'; requestId: string }
  | { action: 'saveAnalysis'; requestId: string; analysis: ScopeAnalysis }
  | ({ action: 'createProposal'; requestId: string } & ProposalDraft)
  | { action: 'getPublic'; token: string }
  | { action: 'respond'; token: string; decision: 'accepted' | 'rejected'; comment: string }

export interface PublicProposal {
  project: {
    name: string
    clientName: string
  }
  scope: {
    version: number
    title: string
    content: string
    acceptedAt: string
  }
  request: {
    id: string
    title: string
    content: string
    status: RequestStatus
    analysis: ScopeAnalysis | null
    reviewedAt?: string | null
    amountCents?: number | null
    currency?: string | null
    dueDate?: string | null
    note?: string | null
    expiresAt?: string | null
    decision?: 'pending' | 'accepted' | 'rejected' | null
    comment?: string | null
    respondedAt?: string | null
  }
}

export interface StateResponse {
  ok: true
  state: ReceiptState
}

export interface CreateCaseResponse extends StateResponse {
  requestId: string
}

export interface AnalyzeResponse extends StateResponse {
  fallback: boolean
  message?: string
}

export interface ProposalResponse extends StateResponse {
  token: string
  expiresAt: string
}

export interface PublicResponse {
  ok: true
  proposal: PublicProposal
  disposition?: 'created' | 'existing'
}
