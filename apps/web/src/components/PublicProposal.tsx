import { useEffect, useState, type FormEvent } from 'react'
import { categoryCopy, categoryOrder, formatDate, formatDateOnly, formatMoney, groupAnalysis } from '../lib/domain'
import { receiptGateway } from '../lib/appwrite'
import type { PublicProposal as PublicProposalData } from '../lib/types'
import { Icon } from './Icon'

interface PublicProposalProps {
  token: string | null
}

export function PublicProposal({ token }: PublicProposalProps) {
  const [proposal, setProposal] = useState<PublicProposalData | null>(null)
  const [decision, setDecision] = useState<'accepted' | 'rejected' | null>(null)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(Boolean(token))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(
    token ? null : 'This decision link is incomplete or invalid.',
  )

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    receiptGateway
      .getPublic(token)
      .then((response) => {
        if (active) setProposal(response.proposal)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'This proposal is unavailable.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  async function handleRespond(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !decision) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await receiptGateway.respond(token, decision, comment)
      setProposal(response.proposal)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your response could not be recorded.')
    } finally {
      setSubmitting(false)
    }
  }

  const studioUrl = window.location.pathname

  if (loading) {
    return (
      <main className="public-shell public-shell--loading">
        <div className="public-brand"><span>R/</span> Receipt</div>
        <div className="loading-line" />
        <p>Opening the decision record…</p>
      </main>
    )
  }

  if (!proposal) {
    return (
      <main className="public-shell public-shell--error">
        <a className="public-brand" href={studioUrl}><span>R/</span> Receipt</a>
        <div className="error-stamp">Link unavailable</div>
        <h1>There is nothing to sign here.</h1>
        <p>{error}</p>
        <p className="muted">Ask the agency for a fresh Receipt link. No project details were exposed.</p>
      </main>
    )
  }

  const analysis = proposal.request.analysis
  const groups = analysis ? groupAnalysis(analysis.items) : null
  const finalDecision =
    proposal.request.decision === 'accepted' || proposal.request.decision === 'rejected'
      ? proposal.request.decision
      : null

  return (
    <main className="public-shell">
      <header className="public-topbar">
        <a className="public-brand" href={studioUrl}><span>R/</span> Receipt</a>
        <span className="secure-label"><span aria-hidden="true">●</span> Capability-gated decision record</span>
      </header>

      <section className="proposal-hero">
        <div>
          <p className="eyebrow">Change proposal · Scope v{proposal.scope.version}</p>
          <h1>{proposal.request.title}</h1>
          <p>
            Prepared for <strong>{proposal.project.clientName}</strong> · {proposal.project.name}
          </p>
        </div>
        <div className="proposal-price">
          <span>Change fee</span>
          <strong>{formatMoney(proposal.request.amountCents, proposal.request.currency || 'EUR')}</strong>
          <small>Delivery {formatDateOnly(proposal.request.dueDate)}</small>
        </div>
      </section>

      {finalDecision ? (
        <section className={`public-decision public-decision--${finalDecision}`} role="status">
          <span><Icon name={finalDecision === 'accepted' ? 'check' : 'x'} size={24} /></span>
          <div>
            <p className="eyebrow">Decision recorded</p>
            <h2>This proposal was {finalDecision} via its capability link.</h2>
            {proposal.request.comment ? <blockquote>“{proposal.request.comment}”</blockquote> : null}
            <small>{formatDate(proposal.request.respondedAt, true)}</small>
          </div>
        </section>
      ) : null}

      <div className="public-layout">
        <div className="public-main">
          <section className="public-section">
            <header className="section-header">
              <div>
                <p className="eyebrow">The request, compared</p>
                <h2>Here is what changes.</h2>
              </div>
              <span className="human-checked"><Icon name="check" /> Human checked</span>
            </header>
            {analysis && groups ? (
              <>
                <p className="analysis-summary">{analysis.summary}</p>
                <div className="public-comparison">
                  {categoryOrder.map((category) => (
                    <section className={`public-category public-category--${category}`} key={category}>
                      <header>
                        <span className="category-mark" aria-hidden="true" />
                        <h3>{categoryCopy[category].label}</h3>
                        <strong>{groups[category].length}</strong>
                      </header>
                      {groups[category].map((item) => (
                        <article key={item.id}>
                          <div className="evidence evidence--request">
                            <span>You asked</span>
                            <blockquote>“{item.requestQuote}”</blockquote>
                          </div>
                          <div className="evidence evidence--baseline">
                            <span>The accepted scope says</span>
                            <blockquote>
                              {item.sourceExcerpt ? `“${item.sourceExcerpt}”` : 'No exact baseline excerpt applies.'}
                            </blockquote>
                          </div>
                          <p>{item.rationale}</p>
                          {item.clarificationQuestion ? (
                            <div className="clarification"><strong>Open question</strong>{item.clarificationQuestion}</div>
                          ) : null}
                        </article>
                      ))}
                    </section>
                  ))}
                </div>
              </>
            ) : (
              <div className="notice">The agency has not attached a reviewed comparison.</div>
            )}
          </section>

          <details className="baseline-details">
            <summary>
              <span><strong>{proposal.scope.title}</strong><small>Recorded in Receipt {formatDate(proposal.scope.acceptedAt)}</small></span>
              <span>Read exact baseline</span>
            </summary>
            <pre>{proposal.scope.content}</pre>
          </details>
        </div>

        <aside className="decision-panel">
          <p className="eyebrow">Proposal note</p>
          <p className="proposal-note">{proposal.request.note || 'No additional note was added.'}</p>
          <dl>
            <div><dt>Fee</dt><dd>{formatMoney(proposal.request.amountCents, proposal.request.currency || 'EUR')}</dd></div>
            <div><dt>Delivery</dt><dd>{formatDateOnly(proposal.request.dueDate)}</dd></div>
            <div><dt>Link expires</dt><dd>{formatDate(proposal.request.expiresAt, true)}</dd></div>
          </dl>

          {!finalDecision ? (
            <form onSubmit={handleRespond}>
              <fieldset>
                <legend>Your decision</legend>
                <div className="decision-options">
                  <button
                    aria-pressed={decision === 'accepted'}
                    className="decision-option decision-option--accept"
                    type="button"
                    onClick={() => setDecision('accepted')}
                  >
                    <Icon name="check" /> Accept proposal
                  </button>
                  <button
                    aria-pressed={decision === 'rejected'}
                    className="decision-option decision-option--reject"
                    type="button"
                    onClick={() => setDecision('rejected')}
                  >
                    <Icon name="x" /> Decline
                  </button>
                </div>
              </fieldset>
              <label>
                <span>Comment <em>optional</em></span>
                <textarea
                  maxLength={1_000}
                  placeholder="Add a condition or a reason."
                  rows={4}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
              </label>
              {error ? <p className="field-error">{error}</p> : null}
              <button className="button button--accent button--full" disabled={!decision || submitting} type="submit">
                {submitting ? 'Recording…' : 'Record final decision'} <Icon name="arrow" />
              </button>
              <small className="final-warning">Anyone holding this bearer link can submit this final choice. Confirm you are the intended reviewer before continuing.</small>
            </form>
          ) : (
            <p className="final-warning">This capability link is now read-only.</p>
          )}
        </aside>
      </div>

      <footer className="public-footer">
        <span>Receipt keeps scope conversations factual.</span>
        <span>Exact excerpts · Human-reviewed · Time-stamped</span>
      </footer>
    </main>
  )
}
