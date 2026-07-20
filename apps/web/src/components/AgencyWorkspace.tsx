import { useCallback, useEffect, useRef, useState } from 'react'
import { receiptGateway } from '../lib/appwrite'
import {
  analysisLeaseExpired,
  canMutateAnalysis,
  emptyState,
  formatDate,
  getSelectedRequest,
  getShareLink,
  readAnalysis,
  requestStatusLabel,
} from '../lib/domain'
import type { CaseDraft, ProposalDraft, ReceiptState, ScopeAnalysis } from '../lib/types'
import { Icon } from './Icon'
import { NewCaseForm } from './NewCaseForm'
import { ProposalComposer } from './ProposalComposer'
import { ScopeReview } from './ScopeReview'
import { Timeline } from './Timeline'
import { WorkspaceSidebar } from './WorkspaceSidebar'

type BusyAction = 'create' | 'analyze' | 'manual' | 'save' | 'proposal' | null

export function AgencyWorkspace() {
  const [state, setState] = useState<ReceiptState>(emptyState)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const [showNewCase, setShowNewCase] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const busyRef = useRef<BusyAction>(null)

  function beginBusy(action: Exclude<BusyAction, null>): boolean {
    if (busyRef.current) return false
    busyRef.current = action
    setBusy(action)
    return true
  }

  function endBusy() {
    busyRef.current = null
    setBusy(null)
  }

  const refresh = useCallback(async () => {
    try {
      const response = await receiptGateway.getState()
      setState(response.state)
      setConnected(true)
      setError(null)
    } catch (cause) {
      setConnected(false)
      setError(cause instanceof Error ? cause.message : 'The scope service is unavailable.')
    } finally {
      setInitializing(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    let refreshTimer = 0

    receiptGateway
      .subscribeToWorkspace(() => {
        window.clearTimeout(refreshTimer)
        refreshTimer = window.setTimeout(() => void refresh(), 180)
      })
      .then((cleanup) => {
        if (disposed) cleanup()
        else unsubscribe = cleanup
      })
      .catch(() => {
        if (!disposed) setConnected(false)
      })

    return () => {
      disposed = true
      window.clearTimeout(refreshTimer)
      unsubscribe?.()
    }
  }, [refresh])

  const request = getSelectedRequest(state, selectedRequestId)
  const selectedId = request?.$id ?? null
  const project = state.projects.find((item) => item.$id === request?.projectId)
  const scope = state.scopes.find((item) => item.$id === request?.scopeVersionId)
  const analysis = readAnalysis(request)
  const analysisMutable = request ? canMutateAnalysis(request.status) : false
  const recoveryAvailable = Boolean(
    request?.status === 'analyzing' && analysisLeaseExpired(request.$updatedAt, new Date(clock)),
  )

  useEffect(() => {
    if (request?.status !== 'analyzing') return
    const startedAt = new Date(request.$updatedAt).getTime()
    const remaining = Number.isFinite(startedAt) ? Math.max(0, startedAt + 45_000 - Date.now()) : 0
    const timer = window.setTimeout(() => setClock(Date.now()), remaining + 50)
    return () => window.clearTimeout(timer)
  }, [request?.$updatedAt, request?.status])

  const events = request
    ? state.events.filter(
        (event) => event.projectId === request.projectId && (!event.requestId || event.requestId === request.$id),
      )
    : []

  async function createCase(draft: CaseDraft) {
    if (!beginBusy('create')) return
    setError(null)
    try {
      const response = await receiptGateway.createCase(draft)
      setState(response.state)
      setSelectedRequestId(response.requestId)
      setShowNewCase(false)
      setNotice('Scope room opened. The accepted baseline is now recorded in Receipt.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The scope room could not be opened.')
    } finally {
      endBusy()
    }
  }

  async function analyze() {
    if (!request || !beginBusy('analyze')) return
    setError(null)
    setNotice(null)
    try {
      const response = await receiptGateway.analyze(request.$id)
      setState(response.state)
      setNotice(
        response.fallback
          ? response.message || 'AI was unavailable. Every item was kept for explicit manual review.'
          : 'Grounded comparison ready. Review every classification before proposing.',
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The comparison could not be completed.')
    } finally {
      endBusy()
    }
  }

  async function saveAnalysis(nextAnalysis: ScopeAnalysis) {
    if (!request || !beginBusy('save')) return
    setError(null)
    try {
      const response = await receiptGateway.saveAnalysis(request.$id, nextAnalysis)
      setState(response.state)
      setNotice('Human review saved to the audit trail.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The review could not be saved.')
    } finally {
      endBusy()
    }
  }

  async function startManualReview() {
    if (!request || !beginBusy('manual')) return
    setError(null)
    setNotice(null)
    try {
      const response = await receiptGateway.startManualReview(request.$id)
      setState(response.state)
      setNotice(response.message || 'The complete request is ready for explicit manual review.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Manual review could not be started.')
    } finally {
      endBusy()
    }
  }

  async function createProposal(draft: ProposalDraft) {
    if (!request || !beginBusy('proposal')) return
    setError(null)
    try {
      const response = await receiptGateway.createProposal(request.$id, draft)
      setState(response.state)
      setShareLink(getShareLink(response.token, window.location))
      setShareExpiresAt(response.expiresAt)
      setNotice('Client capability link created. Copy it once and send it only to the intended reviewer.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The proposal could not be published.')
      throw cause
    } finally {
      endBusy()
    }
  }

  const openNewCase = showNewCase || (!initializing && state.requests.length === 0)

  function selectRequest(requestId: string) {
    if (busyRef.current) return
    setSelectedRequestId(requestId)
    setShowNewCase(false)
    setShareLink(null)
    setShareExpiresAt(null)
  }

  return (
    <div className="app-shell">
      <WorkspaceSidebar
        disabled={busy !== null}
        selectedRequestId={selectedId}
        state={state}
        onNewCase={() => {
          if (!busyRef.current) setShowNewCase(true)
        }}
        onSelect={selectRequest}
      />

      <main className="workspace">
        <header className="workspace-topbar">
          <div className="mobile-brand"><span>R/</span> Receipt</div>
          {state.requests.length > 0 ? (
            <select
              aria-label="Switch scope room"
              className="mobile-room-picker"
              disabled={busy !== null}
              value={selectedId ?? ''}
              onChange={(event) => selectRequest(event.target.value)}
            >
              {state.requests.map((item) => (
                <option key={item.$id} value={item.$id}>{item.title}</option>
              ))}
            </select>
          ) : null}
          <p><span className={connected ? 'connection-dot connection-dot--live' : 'connection-dot'} /> {connected ? 'Appwrite connected' : 'Offline'}</p>
          <button className="mobile-new" disabled={busy !== null} type="button" onClick={() => {
            if (!busyRef.current) setShowNewCase(true)
          }}>
            <Icon name="plus" /> New room
          </button>
          <button aria-label="Refresh workspace" className="icon-button" disabled={busy !== null} type="button" onClick={() => {
            if (!busyRef.current) void refresh()
          }}>
            <Icon name="refresh" />
          </button>
        </header>

        {error ? (
          <div className="notice notice--error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>Dismiss</button>
          </div>
        ) : null}
        {notice ? (
          <div className="notice notice--success" role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        ) : null}

        {initializing ? (
          <section className="workspace-loading" aria-label="Loading workspace">
            <div className="loading-line" /><div className="loading-block" /><div className="loading-block" />
          </section>
        ) : openNewCase ? (
          <NewCaseForm
            busy={busy !== null}
            {...(state.requests.length > 0 ? { onCancel: () => setShowNewCase(false) } : {})}
            onCreate={createCase}
          />
        ) : request && project && scope ? (
          <>
            <header className="room-header">
              <div>
                <p className="breadcrumbs"><span>Rooms</span><span>/</span>{project.name}</p>
                <h1>{request.title}</h1>
                <p>{project.clientName} · Scope version {scope.version}</p>
              </div>
              <div className="room-header__actions">
                <span className={`status-pill status-pill--${request.status}`}>
                  <span /> {requestStatusLabel(request.status)}
                </span>
              </div>
            </header>

            <div className="workbench-grid">
              <div className="workbench-main">
                <section className="source-pair" aria-label="Source documents">
                  <article className="source-document source-document--baseline">
                    <header><span>Accepted baseline</span><time dateTime={scope.acceptedAt}>Recorded {formatDate(scope.acceptedAt)}</time></header>
                    <h2>{scope.title}</h2>
                    <pre>{scope.content}</pre>
                  </article>
                  <article className="source-document source-document--request">
                    <header><span>Incoming request</span><time dateTime={request.$createdAt}>{formatDate(request.$createdAt)}</time></header>
                    <h2>{request.title}</h2>
                    <pre>{request.content}</pre>
                  </article>
                </section>
                <div className="ai-disclosure">
                  <Icon name="spark" />
                  <span>Live comparison sends the accepted baseline and incoming request to the configured Azure AI deployment. The draft may miss details; an operator must check the complete request and save every result before a proposal can be published.</span>
                  {analysis && analysisMutable ? (
                    <button className="button button--quiet" disabled={busy !== null} type="button" onClick={() => void analyze()}>
                      <Icon name="spark" /> {busy === 'analyze' ? 'Comparing…' : 'Compare again'}
                    </button>
                  ) : null}
                </div>

                {request.status === 'analyzing' ? (
                  <section className="analysis-empty analysis-empty--loading">
                    <Icon name="spark" size={28} />
                    <div>
                      <h2>{recoveryAvailable ? 'Comparison did not finish.' : 'Comparing exact words…'}</h2>
                      <p>{recoveryAvailable ? 'The analysis lease expired. Recover the complete request as a manual review without calling AI again.' : 'Receipt checks the request against cited baseline excerpts.'}</p>
                    </div>
                    {recoveryAvailable ? (
                      <button className="button button--accent" disabled={busy !== null} type="button" onClick={() => void startManualReview()}>
                        <Icon name="refresh" /> {busy === 'manual' ? 'Recovering…' : 'Recover manually'}
                      </button>
                    ) : null}
                  </section>
                ) : analysis ? (
                  <ScopeReview
                    analysis={analysis}
                    busy={busy === 'save'}
                    disabled={busy !== null}
                    key={`${request.$id}-${request.analyzedAt || request.$updatedAt}`}
                    readOnly={!analysisMutable}
                    reviewed={Boolean(request.reviewedAt)}
                    source={request.analysisSource}
                    onSave={saveAnalysis}
                  />
                ) : analysisMutable ? (
                  <section className="analysis-empty">
                    <span><Icon name="spark" size={28} /></span>
                    <div><p className="eyebrow">No comparison yet</p><h2>Find the boundary before you quote.</h2><p>Receipt will cite the accepted baseline and leave the final classification to you.</p></div>
                    <div className="analysis-empty__actions">
                      <button className="button button--accent" disabled={busy !== null} type="button" onClick={() => void analyze()}>
                        Compare scope <Icon name="arrow" />
                      </button>
                      <button className="button button--quiet" disabled={busy !== null} type="button" onClick={() => void startManualReview()}>
                        {busy === 'manual' ? 'Opening…' : 'Start manual review'}
                      </button>
                    </div>
                  </section>
                ) : (
                  <section className="analysis-empty">
                    <Icon name="lock" size={28} />
                    <div><p className="eyebrow">Evidence locked</p><h2>This client record can no longer be edited.</h2><p>Rotate the active proposal before a decision, or open a new scope room for later work.</p></div>
                  </section>
                )}

                {analysis ? (
                  <ProposalComposer
                    busy={busy === 'proposal'}
                    disabled={busy !== null}
                    key={`${request.$id}-${request.status}`}
                    request={request}
                    shareExpiresAt={shareExpiresAt}
                    shareLink={shareLink}
                    onCreate={createProposal}
                  />
                ) : null}
              </div>
              <Timeline events={events} truncated={state.eventsTruncated} />
            </div>
          </>
        ) : (
          <div className="notice notice--error">The selected scope room is incomplete. Refresh to reconcile it.</div>
        )}
      </main>
    </div>
  )
}
