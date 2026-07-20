import { useState, type FormEvent } from 'react'
import { sampleCase } from '../lib/sample'
import type { CaseDraft } from '../lib/types'
import { Icon } from './Icon'

interface NewCaseFormProps {
  busy: boolean
  onCancel?: () => void
  onCreate: (draft: CaseDraft) => Promise<void>
}

const blankCase: CaseDraft = {
  projectName: '',
  clientName: '',
  scopeTitle: '',
  scopeContent: '',
  requestTitle: '',
  requestContent: '',
}

export function NewCaseForm({ busy, onCancel, onCreate }: NewCaseFormProps) {
  const [draft, setDraft] = useState<CaseDraft>(sampleCase)

  function update<Key extends keyof CaseDraft>(key: Key, value: CaseDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onCreate(draft)
  }

  return (
    <section className="new-case" aria-labelledby="new-case-title">
      <header className="new-case__header">
        <div>
          <p className="eyebrow">Open a scope room</p>
          <h1 id="new-case-title">Put the promise next to the ask.</h1>
          <p className="lede">
            Receipt anchors every change request to the baseline your client already accepted.
          </p>
        </div>
        <div className="sample-controls" aria-label="Case template">
          <button className="text-button" disabled={busy} type="button" onClick={() => setDraft(blankCase)}>
            Clear
          </button>
          <button className="text-button" disabled={busy} type="button" onClick={() => setDraft(sampleCase)}>
            Restore sample
          </button>
        </div>
      </header>

      <form onSubmit={handleSubmit}>
        <div className="case-meta-grid">
          <label>
            <span>Project</span>
            <input
              autoComplete="off"
              disabled={busy}
              maxLength={120}
              required
              value={draft.projectName}
              onChange={(event) => update('projectName', event.target.value)}
            />
          </label>
          <label>
            <span>Client</span>
            <input
              autoComplete="organization"
              disabled={busy}
              maxLength={120}
              required
              value={draft.clientName}
              onChange={(event) => update('clientName', event.target.value)}
            />
          </label>
        </div>

        <div className="case-documents">
          <fieldset className="document-field document-field--baseline">
            <legend><span className="step-number">01</span> Accepted baseline</legend>
            <label>
              <span>Document title</span>
              <input
                maxLength={120}
                disabled={busy}
                required
                value={draft.scopeTitle}
                onChange={(event) => update('scopeTitle', event.target.value)}
              />
            </label>
            <label>
              <span>Exact accepted scope</span>
              <textarea
                maxLength={12_000}
                disabled={busy}
                required
                rows={15}
                value={draft.scopeContent}
                onChange={(event) => update('scopeContent', event.target.value)}
              />
            </label>
            <small>{draft.scopeContent.length.toLocaleString()} / 12,000</small>
          </fieldset>

          <fieldset className="document-field document-field--request">
            <legend><span className="step-number">02</span> Incoming request</legend>
            <label>
              <span>Request title</span>
              <input
                maxLength={160}
                disabled={busy}
                required
                value={draft.requestTitle}
                onChange={(event) => update('requestTitle', event.target.value)}
              />
            </label>
            <label>
              <span>Client's exact words</span>
              <textarea
                maxLength={4_000}
                disabled={busy}
                required
                rows={15}
                value={draft.requestContent}
                onChange={(event) => update('requestContent', event.target.value)}
              />
            </label>
            <small>{draft.requestContent.length.toLocaleString()} / 4,000</small>
          </fieldset>
        </div>

        <footer className="form-footer">
          <p>
            Use fictional data only. This public demo writes to an isolated anonymous Appwrite workspace that cannot be recovered if browser data is cleared.
          </p>
          <div className="form-actions">
            {onCancel ? (
              <button className="button button--quiet" disabled={busy} type="button" onClick={onCancel}>
                Cancel
              </button>
            ) : null}
            <button className="button button--ink" disabled={busy} type="submit">
              {busy ? 'Opening room…' : 'Open scope room'} <Icon name="arrow" />
            </button>
          </div>
        </footer>
      </form>
    </section>
  )
}
