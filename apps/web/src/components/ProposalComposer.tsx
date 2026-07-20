import { useState, type FormEvent } from 'react'
import { formatDate, formatMoney, priceToCents, toProposalIso } from '../lib/domain'
import { defaultDueDate } from '../lib/sample'
import type { ProposalDraft, RequestRow } from '../lib/types'
import { Icon } from './Icon'

interface ProposalComposerProps {
  busy: boolean
  disabled: boolean
  request: RequestRow
  shareLink: string | null
  shareExpiresAt: string | null
  onCreate: (draft: ProposalDraft) => Promise<void>
}

export function ProposalComposer({
  busy,
  disabled,
  request,
  shareLink,
  shareExpiresAt,
  onCreate,
}: ProposalComposerProps) {
  const [price, setPrice] = useState(
    typeof request.proposalAmountCents === 'number'
      ? (request.proposalAmountCents / 100).toFixed(2)
      : '',
  )
  const [currency, setCurrency] = useState(request.proposalCurrency || 'EUR')
  const [dueDate, setDueDate] = useState(
    request.proposalDueDate?.slice(0, 10) || defaultDueDate(),
  )
  const [note, setNote] = useState(request.proposalNote || '')
  const [expiresInHours, setExpiresInHours] = useState(72)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const decided = request.status === 'accepted' || request.status === 'rejected'
  const reviewed = Boolean(request.reviewedAt)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldError(null)
    try {
      await onCreate({
        amountCents: priceToCents(price),
        currency,
        dueDate: toProposalIso(dueDate),
        note,
        expiresInHours,
      })
    } catch (cause) {
      setFieldError(cause instanceof Error ? cause.message : 'Check the proposal details.')
    }
  }

  async function copyLink() {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
    } catch {
      setFieldError('Copy was blocked. Select the capability link and copy it manually.')
    }
  }

  if (decided) {
    return (
      <section className={`decision-receipt decision-receipt--${request.status}`}>
        <span className="decision-receipt__mark"><Icon name={request.status === 'accepted' ? 'check' : 'x'} size={22} /></span>
        <div>
          <p className="eyebrow">Capability-link decision</p>
          <h2>Proposal {request.status}</h2>
          <p>{request.clientComment || 'No additional comment was recorded.'}</p>
          <small>Recorded {formatDate(request.respondedAt, true)}</small>
        </div>
      </section>
    )
  }

  return (
    <section className="proposal-composer" aria-labelledby="proposal-title">
      <header className="section-header">
        <div>
          <p className="eyebrow">Human proposal</p>
          <h2 id="proposal-title">Price the change, not the relationship.</h2>
        </div>
        {request.status === 'proposed' ? <span className="status-pill">Link active</span> : null}
      </header>

      {shareLink ? (
        <div className="share-receipt" role="status">
          <div className="share-receipt__icon"><Icon name="link" size={22} /></div>
          <div>
            <strong>Client capability link ready</strong>
            <p>Expires {formatDate(shareExpiresAt, true)}. Anyone who receives this bearer link can view and respond, so share it only with the intended reviewer.</p>
          </div>
          <div className="share-link-row">
            <input aria-label="Capability decision link" readOnly value={shareLink} />
            <button className="button button--ink" type="button" onClick={copyLink}>
              <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : null}

      {request.status === 'proposed' && !shareLink ? (
        <div className="notice notice--warm">
          This proposal already has a capability link. Receipt never stores the raw token, so create a new proposal below only if you need to rotate it.
        </div>
      ) : null}

      {!reviewed ? (
        <div className="notice notice--warm">
          Save the human review above before publishing terms to the client.
        </div>
      ) : null}

      <form className="proposal-form" onSubmit={handleSubmit}>
        <div className="proposal-terms">
          <label className="price-field">
            <span>Change fee</span>
            <div className="money-input">
              <input
                aria-describedby={fieldError ? 'proposal-error' : undefined}
                inputMode="decimal"
                placeholder="1850.00"
                required
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
              <select aria-label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                <option>EUR</option>
                <option>CHF</option>
                <option>USD</option>
                <option>GBP</option>
              </select>
            </div>
          </label>
          <label>
            <span>Delivery date</span>
            <input min={defaultDueDate(new Date(), 1)} required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <label>
            <span>Link lifetime</span>
            <select value={expiresInHours} onChange={(event) => setExpiresInHours(Number(event.target.value))}>
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days</option>
            </select>
          </label>
        </div>

        <label>
          <span>Proposal note</span>
          <textarea
            maxLength={4_000}
            placeholder="What changes, what stays fixed, and what this date depends on."
            rows={5}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        {fieldError ? <p className="field-error" id="proposal-error">{fieldError}</p> : null}
        <footer>
          <p>
            {typeof request.proposalAmountCents === 'number'
              ? `Current proposal: ${formatMoney(request.proposalAmountCents, request.proposalCurrency || currency)}`
              : 'A new link is generated only after you publish.'}
          </p>
          <button className="button button--accent" disabled={disabled || !reviewed} type="submit">
            {busy ? 'Publishing…' : request.status === 'proposed' ? 'Rotate proposal link' : 'Publish proposal'}
            <Icon name="arrow" />
          </button>
        </footer>
      </form>
    </section>
  )
}
