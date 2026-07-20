import {
  Account,
  AppwriteException,
  Channel,
  Client,
  Functions,
  Realtime,
  TablesDB,
} from 'appwrite'
import { parseExecution } from './execution'
import type {
  AnalyzeResponse,
  CaseDraft,
  CreateCaseResponse,
  FunctionAction,
  ProposalDraft,
  ProposalResponse,
  PublicResponse,
  ScopeAnalysis,
  StateResponse,
} from './types'

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1'
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || 'receipt-buildweek'
const functionId = import.meta.env.VITE_APPWRITE_FUNCTION_ID || 'scope-api'
const databaseId = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'receipt'

export class ReceiptGateway {
  private readonly client = new Client().setEndpoint(endpoint).setProject(projectId)
  private readonly account = new Account(this.client)
  private readonly functions = new Functions(this.client)
  private readonly realtime = new Realtime(this.client)

  readonly tables = new TablesDB(this.client)
  private sessionPromise: Promise<void> | null = null

  private ensureSession(): Promise<void> {
    if (this.sessionPromise) return this.sessionPromise

    this.sessionPromise = this.account
      .get()
      .then(() => undefined)
      .catch(async (cause: unknown) => {
        if (!(cause instanceof AppwriteException) || cause.code !== 401) throw cause
        await this.account.createAnonymousSession()
      })
      .catch((cause: unknown) => {
        this.sessionPromise = null
        throw cause
      })

    return this.sessionPromise
  }

  private async execute<T extends { ok: true }>(body: FunctionAction): Promise<T> {
    await this.ensureSession()
    const execution = await this.functions.createExecution({
      functionId,
      body: JSON.stringify(body),
      async: false,
    })
    return parseExecution<T>(execution)
  }

  getState(): Promise<StateResponse> {
    return this.execute({ action: 'state' })
  }

  createCase(draft: CaseDraft): Promise<CreateCaseResponse> {
    return this.execute({ action: 'createCase', ...draft })
  }

  analyze(requestId: string): Promise<AnalyzeResponse> {
    return this.execute({ action: 'analyze', requestId })
  }

  startManualReview(requestId: string): Promise<AnalyzeResponse> {
    return this.execute({ action: 'startManualReview', requestId })
  }

  saveAnalysis(requestId: string, analysis: ScopeAnalysis): Promise<StateResponse> {
    return this.execute({ action: 'saveAnalysis', requestId, analysis })
  }

  createProposal(requestId: string, draft: ProposalDraft): Promise<ProposalResponse> {
    return this.execute({ action: 'createProposal', requestId, ...draft })
  }

  getPublic(token: string): Promise<PublicResponse> {
    return this.execute({ action: 'getPublic', token })
  }

  respond(
    token: string,
    decision: 'accepted' | 'rejected',
    comment: string,
  ): Promise<PublicResponse> {
    return this.execute({ action: 'respond', token, decision, comment })
  }

  async subscribeToWorkspace(onChange: () => void): Promise<() => void> {
    await this.ensureSession()
    const channels = ['projects', 'scope_versions', 'requests', 'events'].map((tableId) =>
      Channel.tablesdb(databaseId).table(tableId).row(),
    )
    const subscription = await this.realtime.subscribe(channels, onChange)
    return () => {
      void subscription.unsubscribe()
    }
  }
}

export const receiptGateway = new ReceiptGateway()
