import {
  AppwriteException,
  Client,
  ID,
  Models,
  Permission,
  Query,
  Role,
  TablesDB,
} from 'node-appwrite';
import { createHash } from 'node:crypto';
import {
  analysisLeaseExpired,
  canMutateAnalysis,
  canPublishProposal,
  type ScopeAnalysis,
} from './domain.js';

type Row = Models.Row & Record<string, unknown>;

export interface CaseInput {
  projectName: string;
  clientName: string;
  scopeTitle: string;
  scopeContent: string;
  requestTitle: string;
  requestContent: string;
  analysis?: ScopeAnalysis;
  analysisSource?: 'pending' | 'demo';
}

export interface ProposalInput {
  amountCents: number;
  currency: string;
  dueDate: string;
  note: string;
  tokenHash: string;
  expiresAt: string;
}

const table = {
  projects: 'projects',
  scopes: 'scope_versions',
  requests: 'requests',
  events: 'events',
  aiRuns: 'ai_runs',
  aiBudgets: 'ai_budgets',
} as const;

export class AiBudgetExceededError extends Error {
  constructor(readonly scope: 'user' | 'project' | 'global') {
    super(`${scope} AI request limit reached.`);
    this.name = 'AiBudgetExceededError';
  }
}

export class StateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateConflictError';
  }
}

export function budgetWindows(now = new Date()): { hour: string; month: string } {
  const iso = now.toISOString();
  return { hour: iso.slice(0, 13), month: iso.slice(0, 7) };
}

export function budgetRowId(scope: string, windowKey: string): string {
  return createHash('sha256').update(`${scope}:${windowKey}`, 'utf8').digest('hex').slice(0, 32);
}

export function budgetRetryDelayMs(attempt: number, random = Math.random()): number {
  return Math.min(800, 75 * 2 ** Math.max(0, attempt)) + Math.floor(random * 75);
}

export function isCounterLimit(cause: unknown): boolean {
  return cause instanceof AppwriteException &&
    cause.code === 400 &&
    (cause.type === 'column_limit_exceeded' || cause.type === 'column_value_invalid');
}

function readPermission(ownerUserId: string): string[] {
  return [Permission.read(Role.user(ownerUserId))];
}

function withoutSecrets(row: Row): Record<string, unknown> {
  const { shareTokenHash: _shareTokenHash, ownerUserId: _ownerUserId, ...safe } = row;
  return safe;
}

export class ReceiptStore {
  readonly db: TablesDB;
  readonly databaseId: string;

  constructor(apiKey: string) {
    const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT?.trim() ||
      'https://fra.cloud.appwrite.io/v1';
    const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID?.trim() || 'receipt-buildweek';
    if (!apiKey) throw new Error('The Appwrite execution key is missing.');

    const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
    this.db = new TablesDB(client);
    this.databaseId = process.env.APPWRITE_DATABASE_ID?.trim() || 'receipt';
  }

  async withTransaction<T>(work: (transactionId: string) => Promise<T>): Promise<T> {
    const transaction = await this.db.createTransaction({ ttl: 60 });
    try {
      const result = await work(transaction.$id);
      await this.db.updateTransaction({ transactionId: transaction.$id, commit: true });
      return result;
    } catch (cause) {
      await this.db
        .updateTransaction({ transactionId: transaction.$id, rollback: true })
        .catch(() => undefined);
      throw cause;
    }
  }

  async createCase(ownerUserId: string, input: CaseInput): Promise<{ requestId: string }> {
    const projectId = ID.unique();
    const scopeVersionId = ID.unique();
    const requestId = ID.unique();
    const permissions = readPermission(ownerUserId);
    const now = new Date().toISOString();

    await this.withTransaction(async (transactionId) => {
      await this.db.createRow({
        databaseId: this.databaseId,
        tableId: table.projects,
        rowId: projectId,
        data: {
          ownerUserId,
          name: input.projectName,
          clientName: input.clientName,
          status: 'active',
        },
        permissions,
        transactionId,
      });
      await this.db.createRow({
        databaseId: this.databaseId,
        tableId: table.scopes,
        rowId: scopeVersionId,
        data: {
          ownerUserId,
          projectId,
          version: 1,
          title: input.scopeTitle,
          content: input.scopeContent,
          acceptedAt: now,
        },
        permissions,
        transactionId,
      });
      await this.db.createRow({
        databaseId: this.databaseId,
        tableId: table.requests,
        rowId: requestId,
        data: {
          ownerUserId,
          projectId,
          scopeVersionId,
          title: input.requestTitle,
          content: input.requestContent,
          status: input.analysis ? 'review' : 'ready',
          analysisJson: input.analysis ? JSON.stringify(input.analysis) : null,
          analysisSource: input.analysisSource || 'pending',
          analyzedAt: input.analysis ? now : null,
        },
        permissions,
        transactionId,
      });
      await this.createEvent(
        ownerUserId,
        projectId,
        undefined,
        'scope_accepted',
        'operator',
        'Accepted baseline recorded in Receipt.',
        transactionId,
      );
      await this.createEvent(
        ownerUserId,
        projectId,
        requestId,
        'request_created',
        'operator',
        'Client request recorded against scope version 1.',
        transactionId,
      );
      if (input.analysis) {
        await this.createEvent(
          ownerUserId,
          projectId,
          requestId,
          'analysis_ready',
          'system',
          'Grounded demo comparison prepared for review.',
          transactionId,
        );
      }
    });

    return { requestId };
  }

  async getState(ownerUserId: string): Promise<Record<string, unknown>> {
    const ownerQuery = [
      Query.equal('ownerUserId', ownerUserId),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ];
    const [projects, scopes, requests, events] = await Promise.all([
      this.db.listRows<Row>({
        databaseId: this.databaseId,
        tableId: table.projects,
        queries: ownerQuery,
      }),
      this.db.listRows<Row>({
        databaseId: this.databaseId,
        tableId: table.scopes,
        queries: [Query.equal('ownerUserId', ownerUserId), Query.limit(100)],
      }),
      this.db.listRows<Row>({
        databaseId: this.databaseId,
        tableId: table.requests,
        queries: ownerQuery,
      }),
      this.db.listRows<Row>({
        databaseId: this.databaseId,
        tableId: table.events,
        queries: [
          Query.equal('ownerUserId', ownerUserId),
          Query.orderDesc('$createdAt'),
          Query.limit(500),
        ],
      }),
    ]);

    return {
      projects: projects.rows.map(withoutSecrets),
      scopes: scopes.rows.map(withoutSecrets),
      requests: requests.rows.map(withoutSecrets),
      events: events.rows.map(withoutSecrets),
      eventsTruncated: events.total > events.rows.length,
    };
  }

  async getOwnedRequest(ownerUserId: string, requestId: string): Promise<Row> {
    const request = (await this.db.getRow({
      databaseId: this.databaseId,
      tableId: table.requests,
      rowId: requestId,
    })) as Row;
    if (request.ownerUserId !== ownerUserId) throw new Error('Request not found.');
    return request;
  }

  async getScope(scopeVersionId: string): Promise<Row> {
    return (await this.db.getRow({
      databaseId: this.databaseId,
      tableId: table.scopes,
      rowId: scopeVersionId,
    })) as Row;
  }

  async startAnalysis(ownerUserId: string, requestId: string): Promise<Row> {
    return this.withTransaction(async (transactionId) => {
      const current = (await this.db.getRow({
        databaseId: this.databaseId,
        tableId: table.requests,
        rowId: requestId,
        transactionId,
      })) as Row;
      if (current.ownerUserId !== ownerUserId) throw new Error('Request not found.');
      if (!canMutateAnalysis(current.status)) {
        throw new StateConflictError('This comparison is locked by its current proposal state.');
      }
      const updated = (await this.db.updateRow({
        databaseId: this.databaseId,
        tableId: table.requests,
        rowId: requestId,
        data: { status: 'analyzing', reviewedAt: null },
        transactionId,
      })) as Row;
      await this.createEvent(
        ownerUserId,
        String(current.projectId),
        requestId,
        'analysis_requested',
        'operator',
        'Scope comparison requested.',
        transactionId,
      );
      return updated;
    });
  }

  async prepareManualReview(
    ownerUserId: string,
    requestId: string,
    analysis: ScopeAnalysis,
  ): Promise<void> {
    const analyzedAt = new Date().toISOString();
    await this.withTransaction(async (transactionId) => {
      const current = (await this.db.getRow({
        databaseId: this.databaseId,
        tableId: table.requests,
        rowId: requestId,
        transactionId,
      })) as Row;
      if (current.ownerUserId !== ownerUserId) throw new Error('Request not found.');
      const canRecover = current.status === 'analyzing' && analysisLeaseExpired(current.$updatedAt);
      if (!canMutateAnalysis(current.status) && !canRecover) {
        throw new StateConflictError('This comparison is locked or still running.');
      }
      await this.db.updateRow({
        databaseId: this.databaseId,
        tableId: table.requests,
        rowId: requestId,
        data: {
          status: 'review',
          analysisJson: JSON.stringify(analysis),
          analysisSource: 'manual',
          analysisModel: null,
          analyzedAt,
          reviewedAt: null,
        },
        transactionId,
      });
      await this.createEvent(
        ownerUserId,
        String(current.projectId),
        requestId,
        'analysis_ready',
        'operator',
        canRecover
          ? 'Expired automatic comparison recovered into manual review.'
          : 'Manual evidence review started without an AI request.',
        transactionId,
      );
    });
  }

  async markAnalysisError(ownerUserId: string, requestId: string): Promise<void> {
    await this.withTransaction(async (transactionId) => {
      const current = (await this.db.getRow({
        databaseId: this.databaseId,
        tableId: table.requests,
        rowId: requestId,
        transactionId,
      })) as Row;
      if (current.ownerUserId !== ownerUserId || current.status !== 'analyzing') return;
      await this.db.updateRow({
        databaseId: this.databaseId,
        tableId: table.requests,
        rowId: requestId,
        data: { status: 'error' },
        transactionId,
      });
      await this.createEvent(
        ownerUserId,
        String(current.projectId),
        requestId,
        'analysis_failed',
        'system',
        'Comparison could not be saved; retry when the service is available.',
        transactionId,
      );
    });
  }

  async saveAnalysis(
    ownerUserId: string,
    request: Row,
    analysis: ScopeAnalysis,
    source: 'azure' | 'manual',
    model: string | undefined,
    eventMode: 'azure' | 'operator' | 'failure',
    aiRun?: {
      status: 'success' | 'fallback' | 'failed';
      model: string;
      latencyMs: number;
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    },
  ): Promise<void> {
    const analyzedAt = new Date().toISOString();
    await this.withTransaction(async (transactionId) => {
      const current = (await this.db.getRow({
        databaseId: this.databaseId,
        tableId: table.requests,
        rowId: request.$id,
        transactionId,
      })) as Row;
      if (current.ownerUserId !== ownerUserId) throw new Error('Request not found.');
      const stateIsValid =
        eventMode === 'operator' ? canMutateAnalysis(current.status) : current.status === 'analyzing';
      if (!stateIsValid) {
        throw new StateConflictError('The request changed while this comparison was being saved.');
      }
      await this.db.updateRow({
        databaseId: this.databaseId,
        tableId: table.requests,
        rowId: request.$id,
        data: {
          status: 'review',
          analysisJson: JSON.stringify(analysis),
          analysisSource: source,
          analysisModel: model || null,
          analyzedAt,
          reviewedAt: eventMode === 'operator' ? analyzedAt : null,
        },
        transactionId,
      });
      const event =
        eventMode === 'azure'
          ? {
              kind: 'analysis_ready' as const,
              actor: 'system' as const,
              summary: 'Grounded scope comparison prepared for human review.',
            }
          : eventMode === 'operator'
            ? {
                kind: 'analysis_reviewed' as const,
                actor: 'operator' as const,
                summary: 'Comparison edited and accepted by the operator.',
              }
            : {
                kind: 'analysis_failed' as const,
                actor: 'system' as const,
                summary: 'Automatic comparison unavailable; request kept for manual review.',
              };
      await this.createEvent(
        ownerUserId,
        String(current.projectId),
        request.$id,
        event.kind,
        event.actor,
        event.summary,
        transactionId,
      );
      if (aiRun) {
        await this.recordAiRun(
          {
            ownerUserId,
            requestId: request.$id,
            ...aiRun,
          },
          transactionId,
        );
      }
    });
  }

  async createProposal(
    ownerUserId: string,
    request: Row,
    input: ProposalInput,
  ): Promise<void> {
    await this.withTransaction(async (transactionId) => {
      const current = (await this.db.getRow({
        databaseId: this.databaseId,
        tableId: table.requests,
        rowId: request.$id,
        transactionId,
      })) as Row;
      if (current.ownerUserId !== ownerUserId) throw new Error('Request not found.');
      if (!canPublishProposal(current.status)) {
        throw new StateConflictError('This request cannot publish a proposal in its current state.');
      }
      if (!current.analysisJson || !current.reviewedAt) {
        throw new StateConflictError('Save the human review before publishing a client proposal.');
      }
      await this.db.updateRow({
        databaseId: this.databaseId,
        tableId: table.requests,
        rowId: request.$id,
        data: {
          status: 'proposed',
          proposalAmountCents: input.amountCents,
          proposalCurrency: input.currency,
          proposalDueDate: input.dueDate,
          proposalNote: input.note || null,
          shareTokenHash: input.tokenHash,
          shareExpiresAt: input.expiresAt,
          clientDecision: 'pending',
          clientComment: null,
          respondedAt: null,
        },
        transactionId,
      });
      await this.createEvent(
        ownerUserId,
        String(current.projectId),
        request.$id,
        'proposal_created',
        'operator',
        `Change proposal created in ${input.currency}.`,
        transactionId,
      );
    });
  }

  async findByTokenHash(tokenHash: string): Promise<Row | null> {
    const result = await this.db.listRows<Row>({
      databaseId: this.databaseId,
      tableId: table.requests,
      queries: [Query.equal('shareTokenHash', tokenHash), Query.limit(2)],
    });
    if (result.rows.length > 1) throw new Error('Ambiguous share token.');
    return result.rows[0] || null;
  }

  async getPublicProjection(request: Row): Promise<Record<string, unknown>> {
    const [project, scope] = (await Promise.all([
      this.db.getRow({
        databaseId: this.databaseId,
        tableId: table.projects,
        rowId: String(request.projectId),
      }),
      this.db.getRow({
        databaseId: this.databaseId,
        tableId: table.scopes,
        rowId: String(request.scopeVersionId),
      }),
    ])) as [Row, Row];

    return {
      project: {
        name: project.name,
        clientName: project.clientName,
      },
      scope: {
        version: scope.version,
        title: scope.title,
        content: scope.content,
        acceptedAt: scope.acceptedAt,
      },
      request: {
        id: request.$id,
        title: request.title,
        content: request.content,
        status: request.status,
        analysis: request.analysisJson ? JSON.parse(String(request.analysisJson)) : null,
        reviewedAt: request.reviewedAt,
        amountCents: request.proposalAmountCents,
        currency: request.proposalCurrency,
        dueDate: request.proposalDueDate,
        note: request.proposalNote,
        expiresAt: request.shareExpiresAt,
        decision: request.clientDecision,
        comment: request.clientComment,
        respondedAt: request.respondedAt,
      },
    };
  }

  async respond(
    request: Row,
    tokenHash: string,
    decision: 'accepted' | 'rejected',
    comment: string,
  ): Promise<'created' | 'existing'> {
    const respondedAt = new Date().toISOString();

    try {
      return await this.withTransaction(async (transactionId) => {
        const current = (await this.db.getRow({
          databaseId: this.databaseId,
          tableId: table.requests,
          rowId: request.$id,
          transactionId,
        })) as Row;
        if (current.shareTokenHash !== tokenHash) {
          throw new StateConflictError('This proposal link has been replaced.');
        }
        const expiresAt = new Date(String(current.shareExpiresAt || ''));
        if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
          throw new StateConflictError('This proposal link has expired.');
        }
        if (current.clientDecision === 'accepted' || current.clientDecision === 'rejected') {
          if (current.clientDecision === decision) return 'existing' as const;
          throw new StateConflictError('This proposal already has a different final decision.');
        }
        if (current.status !== 'proposed') {
          throw new StateConflictError('This proposal is not awaiting a client decision.');
        }
        await this.db.updateRow({
          databaseId: this.databaseId,
          tableId: table.requests,
          rowId: request.$id,
          data: {
            status: decision,
            clientDecision: decision,
            clientComment: comment || null,
            respondedAt,
          },
          transactionId,
        });
        await this.createEvent(
          String(current.ownerUserId),
          String(current.projectId),
          request.$id,
          decision === 'accepted' ? 'client_accepted' : 'client_rejected',
          'system',
          decision === 'accepted'
            ? 'Proposal accepted through its capability link.'
            : 'Proposal rejected through its capability link.',
          transactionId,
        );
        return 'created' as const;
      });
    } catch (cause) {
      if (cause instanceof AppwriteException && cause.code === 409) {
        const latest = (await this.db.getRow({
          databaseId: this.databaseId,
          tableId: table.requests,
          rowId: request.$id,
        })) as Row;
        if (
          latest.shareTokenHash === tokenHash &&
          latest.clientDecision === decision
        ) {
          return 'existing';
        }
        if (
          latest.shareTokenHash === tokenHash &&
          (latest.clientDecision === 'accepted' || latest.clientDecision === 'rejected')
        ) {
          throw new StateConflictError('This proposal already has a different final decision.');
        }
      }
      throw cause;
    }
  }

  async createEvent(
    ownerUserId: string,
    projectId: string,
    requestId: string | undefined,
    kind:
      | 'scope_accepted'
      | 'request_created'
      | 'analysis_requested'
      | 'analysis_ready'
      | 'analysis_failed'
      | 'analysis_reviewed'
      | 'proposal_created'
      | 'client_accepted'
      | 'client_rejected',
    actor: 'operator' | 'client' | 'system',
    summary: string,
    transactionId?: string,
  ): Promise<void> {
    await this.db.createRow({
      databaseId: this.databaseId,
      tableId: table.events,
      rowId: ID.unique(),
      data: {
        ownerUserId,
        projectId,
        requestId: requestId || null,
        kind,
        actor,
        summary,
      },
      permissions: readPermission(ownerUserId),
      ...(transactionId ? { transactionId } : {}),
    });
  }

  async recordAiRun(input: {
    ownerUserId: string;
    requestId: string;
    status: 'success' | 'fallback' | 'failed';
    model: string;
    latencyMs: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }, transactionId?: string): Promise<void> {
    await this.db.createRow({
      databaseId: this.databaseId,
      tableId: table.aiRuns,
      rowId: ID.unique(),
      data: {
        ownerUserId: input.ownerUserId,
        requestId: input.requestId,
        status: input.status,
        model: input.model,
        category: 'scope-comparison',
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
        totalTokens: input.totalTokens ?? null,
        latencyMs: Math.max(0, Math.min(120_000, input.latencyMs)),
      },
      permissions: readPermission(input.ownerUserId),
      ...(transactionId ? { transactionId } : {}),
    });
  }

  private async consumeBudgetCounter(
    scope: 'user_hour' | 'project_month' | 'global_month',
    windowKey: string,
    max: number,
    transactionId: string,
    exists: boolean,
  ): Promise<void> {
    const rowId = budgetRowId(scope, windowKey);
    if (!exists) {
      await this.db.createRow({
        databaseId: this.databaseId,
        tableId: table.aiBudgets,
        rowId,
        data: { scope, windowKey, count: 1 },
        permissions: [],
        transactionId,
      });
      return;
    }

    await this.db.incrementRowColumn({
      databaseId: this.databaseId,
      tableId: table.aiBudgets,
      rowId,
      column: 'count',
      value: 1,
      max,
      transactionId,
    });
  }

  private async budgetCounterExists(
    scope: 'user_hour' | 'project_month' | 'global_month',
    windowKey: string,
  ): Promise<boolean> {
    try {
      await this.db.getRow({
        databaseId: this.databaseId,
        tableId: table.aiBudgets,
        rowId: budgetRowId(scope, windowKey),
      });
      return true;
    } catch (cause) {
      if (cause instanceof AppwriteException && cause.code === 404) return false;
      throw cause;
    }
  }

  async consumeAiBudget(ownerUserId: string, projectId: string): Promise<void> {
    const windows = budgetWindows();
    const userLimit = Number.parseInt(process.env.AZURE_AI_USER_HOURLY_LIMIT || '3', 10);
    const projectLimit = Number.parseInt(process.env.AZURE_AI_PROJECT_MONTHLY_LIMIT || '20', 10);
    const monthlyLimit = Number.parseInt(process.env.AZURE_AI_MONTHLY_REQUEST_LIMIT || '100', 10);
    const safeUserLimit = Number.isFinite(userLimit) && userLimit > 0 ? userLimit : 3;
    const safeProjectLimit = Number.isFinite(projectLimit) && projectLimit > 0 ? projectLimit : 20;
    const safeMonthlyLimit = Number.isFinite(monthlyLimit) && monthlyLimit > 0 ? monthlyLimit : 100;

    const counters = [
      {
        scope: 'user_hour' as const,
        key: `${ownerUserId}:${windows.hour}`,
        max: safeUserLimit,
        errorScope: 'user' as const,
      },
      {
        scope: 'project_month' as const,
        key: `${projectId}:${windows.month}`,
        max: safeProjectLimit,
        errorScope: 'project' as const,
      },
      {
        scope: 'global_month' as const,
        key: windows.month,
        max: safeMonthlyLimit,
        errorScope: 'global' as const,
      },
    ];

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        // A failed write remains part of an Appwrite transaction even when its
        // exception is caught. Resolve create-vs-increment before opening the
        // transaction; a concurrent create becomes a retryable 409 at commit.
        const existing = await Promise.all(
          counters.map((counter) => this.budgetCounterExists(counter.scope, counter.key)),
        );
        await this.withTransaction(async (transactionId) => {
          for (const [index, counter] of counters.entries()) {
            try {
              await this.consumeBudgetCounter(
                counter.scope,
                counter.key,
                counter.max,
                transactionId,
                existing[index] ?? false,
              );
            } catch (cause) {
              if (isCounterLimit(cause)) throw new AiBudgetExceededError(counter.errorScope);
              throw cause;
            }
          }
        });
        return;
      } catch (cause) {
        if (cause instanceof AppwriteException && cause.code === 409 && attempt < 4) {
          await new Promise((resolve) => setTimeout(resolve, budgetRetryDelayMs(attempt)));
          continue;
        }
        throw cause;
      }
    }
  }
}
