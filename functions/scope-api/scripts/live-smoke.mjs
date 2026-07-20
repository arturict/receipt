const endpoint = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1'
const projectId = process.env.APPWRITE_PROJECT_ID || 'receipt-buildweek'
const functionId = process.env.APPWRITE_FUNCTION_ID || 'scope-api'
const databaseId = process.env.APPWRITE_DATABASE_ID || 'receipt'

class SmokeHttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function createAnonymousCookie() {
  const response = await fetch(`${endpoint}/account/sessions/anonymous`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-appwrite-project': projectId,
    },
    body: '{}',
  })
  assert(response.ok, 'Anonymous Appwrite session could not be created.')
  const setCookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean)
  const sessionCookie = setCookies.map((value) => value.split(';', 1)[0]).join('; ')
  assert(sessionCookie, 'Anonymous session did not return a cookie.')
  return sessionCookie
}

const cookie = await createAnonymousCookie()
let secondCookie = null

const executions = []

async function call(body, sessionCookie = cookie) {
  const response = await fetch(`${endpoint}/functions/${encodeURIComponent(functionId)}/executions`, {
    method: 'POST',
    headers: {
      cookie: sessionCookie,
      'content-type': 'application/json',
      'x-appwrite-project': projectId,
    },
    body: JSON.stringify({ body: JSON.stringify(body), async: false }),
  })
  const execution = await response.json()
  executions.push(execution.$id)
  let payload = null
  try {
    payload = JSON.parse(execution.responseBody)
  } catch {
    // The bounded error below deliberately avoids platform diagnostics.
  }
  if (
    execution.status !== 'completed' ||
    execution.responseStatusCode < 200 ||
    execution.responseStatusCode >= 300 ||
    payload?.ok !== true
  ) {
    throw new SmokeHttpError(
      execution.responseStatusCode || 500,
      typeof payload?.error === 'string' ? payload.error : 'Live function execution failed.',
    )
  }
  return payload
}

async function expectStatus(status, action) {
  try {
    await action()
  } catch (cause) {
    if (cause instanceof SmokeHttpError && cause.status === status) return
    throw cause
  }
  throw new Error(`Expected HTTP ${status}.`)
}

try {
  const suffix = new Date().toISOString().replaceAll(/[-:.TZ]/g, '').slice(0, 14)
  const created = await call({
    action: 'createCase',
    projectName: `Live smoke ${suffix}`,
    clientName: 'Fictional QA client',
    scopeTitle: 'Accepted launch scope',
    scopeContent: 'Deliver one responsive launch page. Launch Friday. No booking workflow is included.',
    requestTitle: 'Booking addition',
    requestContent: 'Keep the Friday launch. Add table booking confirmation emails.',
  })

  secondCookie = await createAnonymousCookie()
  const isolatedState = await call({ action: 'state' }, secondCookie)
  assert(isolatedState.state.requests.length === 0, 'A second session could see the first session workspace.')
  const rowUrl = `${endpoint}/tablesdb/${encodeURIComponent(databaseId)}/tables/requests/rows/${encodeURIComponent(created.requestId)}`
  const ownerRead = await fetch(rowUrl, {
    headers: { cookie, 'x-appwrite-project': projectId },
  })
  assert(ownerRead.ok, 'The owning session could not read its row permission.')
  const crossTenantRead = await fetch(rowUrl, {
    headers: { cookie: secondCookie, 'x-appwrite-project': projectId },
  })
  assert(
    crossTenantRead.status === 401 || crossTenantRead.status === 404,
    `A second session reached a private row (HTTP ${crossTenantRead.status}).`,
  )

  const analyzed = await call({ action: 'analyze', requestId: created.requestId })
  assert(analyzed.fallback === false, `Azure path fell back: ${analyzed.message || 'unknown reason'}`)
  const analyzedRequest = analyzed.state.requests.find((row) => row.$id === created.requestId)
  assert(analyzedRequest?.analysisSource === 'azure', 'Expected an Azure analysis draft.')
  const analysis = JSON.parse(analyzedRequest.analysisJson)
  assert(analysis.items.length > 0, 'Azure analysis returned no evidence items.')

  const reviewed = await call({ action: 'saveAnalysis', requestId: created.requestId, analysis })
  const reviewedRequest = reviewed.state.requests.find((row) => row.$id === created.requestId)
  assert(reviewedRequest?.reviewedAt, 'Human review timestamp was not persisted.')

  const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10)
  const firstProposal = await call({
    action: 'createProposal',
    requestId: created.requestId,
    amountCents: 0,
    currency: 'EUR',
    dueDate: `${dueDate}T23:59:59.999Z`,
    note: 'Live smoke: zero-fee decision record.',
    expiresInHours: 24,
  })
  const rotatedProposal = await call({
    action: 'createProposal',
    requestId: created.requestId,
    amountCents: 0,
    currency: 'EUR',
    dueDate: `${dueDate}T23:59:59.999Z`,
    note: 'Live smoke: rotated capability.',
    expiresInHours: 24,
  })
  assert(firstProposal.token !== rotatedProposal.token, 'Proposal rotation reused a capability token.')
  await expectStatus(404, () => call({ action: 'getPublic', token: firstProposal.token }))

  const publicRecord = await call({ action: 'getPublic', token: rotatedProposal.token })
  assert(publicRecord.proposal.request.amountCents === 0, 'Zero-fee proposal was not preserved.')
  await expectStatus(409, () => call({ action: 'analyze', requestId: created.requestId }))

  const accepted = await call({
    action: 'respond',
    token: rotatedProposal.token,
    decision: 'accepted',
    comment: 'Capability-holder smoke decision.',
  })
  assert(accepted.disposition === 'created', 'First decision was not recorded.')
  const repeated = await call({
    action: 'respond',
    token: rotatedProposal.token,
    decision: 'accepted',
    comment: 'Capability-holder smoke decision.',
  })
  assert(repeated.disposition === 'existing', 'Same decision was not idempotent.')
  await expectStatus(409, () =>
    call({ action: 'respond', token: rotatedProposal.token, decision: 'rejected', comment: '' }),
  )

  const manualCase = await call({
    action: 'createCase',
    projectName: `Manual smoke ${suffix}`,
    clientName: 'Fictional QA client',
    scopeTitle: 'Accepted manual scope',
    scopeContent: 'Deliver the named landing page only.',
    requestTitle: 'Manual-only addition',
    requestContent: 'Add exports. Add notifications. Keep the landing page.',
  })
  const manual = await call({ action: 'startManualReview', requestId: manualCase.requestId })
  const manualRequest = manual.state.requests.find((row) => row.$id === manualCase.requestId)
  assert(manualRequest?.analysisSource === 'manual', 'Manual path did not persist a manual draft.')
  assert(!manualRequest?.reviewedAt, 'Manual draft was incorrectly marked as human reviewed.')

  const finalState = await call({ action: 'state' })
  const decisionEvent = finalState.state.events.find(
    (event) => event.requestId === created.requestId && event.kind === 'client_accepted',
  )
  assert(decisionEvent?.actor === 'system', 'Capability decision was attributed to an unverified client.')

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      checks: [
        'azure-analysis',
        'tenant-isolation',
        'row-permissions',
        'human-review',
        'zero-fee-proposal',
        'capability-rotation',
        'analysis-lock',
        'idempotent-decision',
        'manual-path',
        'honest-audit-actor',
      ],
      executionCount: executions.length,
    })}\n`,
  )
} finally {
  await Promise.all(
    [cookie, secondCookie].filter(Boolean).map((sessionCookie) =>
      fetch(`${endpoint}/account/sessions/current`, {
        method: 'DELETE',
        headers: { cookie: sessionCookie, 'x-appwrite-project': projectId },
      }).catch(() => undefined),
    ),
  )
}
