import { AppwriteException } from 'node-appwrite';
import { ZodError } from 'zod';
import { analyzeWithAzure } from './azure.js';
import {
  assertFutureDate,
  analysisLeaseExpired,
  canMutateAnalysis,
  createShareToken,
  demoAnalysis,
  demoCase,
  hashShareToken,
  manualReviewAnalysis,
  requestBodySchema,
  validateGroundedAnalysis,
  DomainValidationError,
  type RequestBody,
} from './domain.js';
import { AiBudgetExceededError, ReceiptStore, StateConflictError } from './store.js';

interface FunctionRequest {
  method: string;
  bodyJson?: unknown;
  headers: Record<string, string | undefined>;
}

interface FunctionResponse {
  json: (
    body: Record<string, unknown>,
    status?: number,
    headers?: Record<string, string>,
  ) => unknown;
}

interface FunctionContext {
  req: FunctionRequest;
  res: FunctionResponse;
  log: (message: string) => void;
  error: (message: string) => void;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function requireUserId(req: FunctionRequest): string {
  const userId = req.headers['x-appwrite-user-id']?.trim();
  if (!userId) throw new HttpError(401, 'An authenticated Appwrite session is required.');
  return userId;
}

function requireExecutionKey(req: FunctionRequest): string {
  const key = req.headers['x-appwrite-key']?.trim() ||
    process.env.APPWRITE_FUNCTION_API_KEY?.trim();
  if (!key) throw new HttpError(500, 'The function execution key is unavailable.');
  return key;
}

function assertShareIsLive(request: Record<string, unknown>): void {
  const expiresAt = new Date(String(request.shareExpiresAt || ''));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new HttpError(410, 'This proposal link has expired.');
  }
}

function assertAnalysisIsMutable(request: Record<string, unknown>): void {
  if (!canMutateAnalysis(request.status)) {
    throw new HttpError(409, 'This comparison is locked. Rotate or complete the current proposal instead.');
  }
}

async function handleAuthenticated(
  body: Exclude<RequestBody, { action: 'getPublic' } | { action: 'respond' }>,
  req: FunctionRequest,
  store: ReceiptStore,
  log: (message: string) => void,
): Promise<Record<string, unknown>> {
  const ownerUserId = requireUserId(req);

  if (body.action === 'state') {
    return { ok: true, state: await store.getState(ownerUserId) };
  }

  if (body.action === 'createCase') {
    const existing = (await store.getState(ownerUserId)).projects as unknown[];
    if (existing.length >= 20) throw new HttpError(409, 'This demo workspace already has 20 projects.');
    const isExactDemo =
      body.projectName === demoCase.projectName &&
      body.clientName === demoCase.clientName &&
      body.scopeContent === demoCase.scopeContent &&
      body.requestContent === demoCase.requestContent;
    const created = await store.createCase(ownerUserId, {
      projectName: body.projectName,
      clientName: body.clientName,
      scopeTitle: body.scopeTitle,
      scopeContent: body.scopeContent,
      requestTitle: body.requestTitle,
      requestContent: body.requestContent,
      ...(isExactDemo ? { analysis: demoAnalysis, analysisSource: 'demo' } : {}),
    });
    return { ok: true, ...created, state: await store.getState(ownerUserId) };
  }

  const request = await store.getOwnedRequest(ownerUserId, body.requestId);
  const scope = await store.getScope(String(request.scopeVersionId));
  if (scope.ownerUserId !== ownerUserId) throw new HttpError(404, 'Scope version not found.');

  async function saveManualDraft(
    activeRequest: typeof request,
    message: string,
  ): Promise<Record<string, unknown>> {
    const analysis = manualReviewAnalysis(String(request.content));
    await store.saveAnalysis(
      ownerUserId,
      activeRequest,
      analysis,
      'manual',
      undefined,
      'failure',
    );
    return {
      ok: true,
      fallback: true,
      message,
      state: await store.getState(ownerUserId),
    };
  }

  if (body.action === 'startManualReview') {
    if (request.status === 'analyzing') {
      if (!analysisLeaseExpired(request.$updatedAt)) {
        throw new HttpError(409, 'The automatic comparison is still running. Try manual recovery shortly.');
      }
    }
    const analysis = manualReviewAnalysis(String(request.content));
    await store.prepareManualReview(ownerUserId, request.$id, analysis);
    return {
      ok: true,
      fallback: true,
      message: 'The complete request is ready for explicit manual classification.',
      state: await store.getState(ownerUserId),
    };
  }

  if (body.action === 'saveAnalysis') {
    assertAnalysisIsMutable(request);
    const analysis = validateGroundedAnalysis(body.analysis, String(scope.content), String(request.content));
    await store.saveAnalysis(ownerUserId, request, analysis, 'manual', undefined, 'operator');
    return { ok: true, state: await store.getState(ownerUserId) };
  }

  if (body.action === 'createProposal') {
    if (!request.analysisJson) throw new HttpError(409, 'Review the scope comparison first.');
    if (!request.reviewedAt) {
      throw new HttpError(409, 'Save the human review before publishing a client proposal.');
    }
    if (request.status === 'accepted' || request.status === 'rejected') {
      throw new HttpError(409, 'This request already has a final client decision.');
    }
    const dueDate = assertFutureDate(body.dueDate);
    const token = createShareToken();
    const expiresAt = new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000).toISOString();
    await store.createProposal(ownerUserId, request, {
      amountCents: body.amountCents,
      currency: body.currency,
      dueDate,
      note: body.note,
      tokenHash: hashShareToken(token),
      expiresAt,
    });
    return {
      ok: true,
      token,
      expiresAt,
      state: await store.getState(ownerUserId),
    };
  }

  if (body.action !== 'analyze') throw new HttpError(400, 'Unsupported action.');
  assertAnalysisIsMutable(request);

  const activeRequest = await store.startAnalysis(ownerUserId, request.$id);
  try {
    await store.consumeAiBudget(ownerUserId, String(request.projectId));
  } catch (cause) {
    if (cause instanceof AiBudgetExceededError) {
      return saveManualDraft(
        activeRequest,
        `${cause.scope === 'user' ? 'User' : cause.scope === 'project' ? 'Project' : 'Global'} AI limit reached. The complete request was opened for manual review instead.`,
      );
    }
    await store.markAnalysisError(ownerUserId, request.$id).catch(() => undefined);
    throw cause;
  }

  const startedAt = Date.now();
  let result: Awaited<ReturnType<typeof analyzeWithAzure>>;
  try {
    result = await analyzeWithAzure(String(scope.content), String(request.content));
  } catch (cause) {
    const latencyMs = Date.now() - startedAt;
    const analysis = manualReviewAnalysis(String(request.content));
    const model = process.env.AZURE_AI_DEPLOYMENT?.trim() || 'gpt-5.4-mini';
    try {
      await store.saveAnalysis(ownerUserId, activeRequest, analysis, 'manual', undefined, 'failure', {
        status: 'fallback',
        model,
        latencyMs,
      });
    } catch (persistenceCause) {
      await store.markAnalysisError(ownerUserId, request.$id).catch(() => undefined);
      throw persistenceCause;
    }
    log(
      JSON.stringify({
        event: 'scope_analysis',
        status: 'fallback',
        model,
        latencyMs,
        errorType: cause instanceof Error ? cause.name : 'UnknownError',
      }),
    );
    return {
      ok: true,
      fallback: true,
      message: 'Automatic comparison was unavailable. Every item remains in explicit manual review.',
      state: await store.getState(ownerUserId),
    };
  }

  try {
    await store.saveAnalysis(ownerUserId, activeRequest, result.analysis, 'azure', result.model, 'azure', {
      status: 'success',
      model: result.model,
      latencyMs: result.latencyMs,
      ...result.usage,
    });
  } catch (cause) {
    await store.markAnalysisError(ownerUserId, request.$id).catch(() => undefined);
    throw cause;
  }
  log(
    JSON.stringify({
      event: 'scope_analysis',
      status: 'success',
      model: result.model,
      latencyMs: result.latencyMs,
      totalTokens: result.usage.totalTokens,
    }),
  );
  return { ok: true, fallback: false, state: await store.getState(ownerUserId) };
}

async function handlePublic(
  body: Extract<RequestBody, { action: 'getPublic' } | { action: 'respond' }>,
  store: ReceiptStore,
): Promise<Record<string, unknown>> {
  const tokenHash = hashShareToken(body.token);
  let request = await store.findByTokenHash(tokenHash);
  if (!request) throw new HttpError(404, 'Proposal not found.');
  assertShareIsLive(request);

  if (body.action === 'respond') {
    if (request.status !== 'proposed' && request.status !== 'accepted' && request.status !== 'rejected') {
      throw new HttpError(409, 'This proposal is not awaiting a client decision.');
    }
    const disposition = await store.respond(request, tokenHash, body.decision, body.comment);
    request = (await store.findByTokenHash(tokenHash)) || request;
    return {
      ok: true,
      disposition,
      proposal: await store.getPublicProjection(request),
    };
  }

  return { ok: true, proposal: await store.getPublicProjection(request) };
}

function errorResponse(cause: unknown): { status: number; message: string } {
  if (cause instanceof HttpError) return { status: cause.status, message: cause.message };
  if (cause instanceof ZodError) {
    return { status: 400, message: cause.issues[0]?.message || 'Invalid request.' };
  }
  if (cause instanceof DomainValidationError) {
    return { status: 400, message: cause.message };
  }
  if (cause instanceof AiBudgetExceededError) {
    const scopeLabel = cause.scope === 'user' ? 'User' : cause.scope === 'project' ? 'Project' : 'Global';
    return {
      status: 429,
      message: `${scopeLabel} AI limit reached. Continue with manual review.`,
    };
  }
  if (cause instanceof StateConflictError) {
    return { status: 409, message: cause.message };
  }
  if (cause instanceof AppwriteException) {
    if (cause.code === 404) return { status: 404, message: 'Resource not found.' };
    if (cause.code === 409) return { status: 409, message: 'The resource changed. Refresh and try again.' };
  }
  if (cause instanceof SyntaxError) return { status: 400, message: 'Invalid JSON.' };
  if (cause instanceof Error && /not found/i.test(cause.message)) {
    return { status: 404, message: 'Resource not found.' };
  }
  return { status: 500, message: 'Receipt could not complete that action.' };
}

export default async function ({ req, res, log, error }: FunctionContext): Promise<unknown> {
  if (req.method !== 'POST') {
    return res.json({ ok: false, error: 'Use POST.' }, 405, { allow: 'POST' });
  }

  try {
    const body = requestBodySchema.parse(req.bodyJson);
    const store = new ReceiptStore(requireExecutionKey(req));
    const result =
      body.action === 'getPublic' || body.action === 'respond'
        ? await handlePublic(body, store)
        : await handleAuthenticated(body, req, store, log);
    return res.json(result, 200, { 'cache-control': 'no-store' });
  } catch (cause) {
    const response = errorResponse(cause);
    error(
      JSON.stringify({
        event: 'scope_api_error',
        status: response.status,
        errorType: cause instanceof Error ? cause.name : 'UnknownError',
      }),
    );
    return res.json({ ok: false, error: response.message }, response.status, {
      'cache-control': 'no-store',
    });
  }
}
