import { useState, type FormEvent } from 'react'
import {
  categoryCopy,
  categoryOrder,
  groupAnalysis,
  MAX_ANALYSIS_ITEMS,
  nextHumanItemId,
} from '../lib/domain'
import type { AnalysisItem, RequestRow, ScopeAnalysis, ScopeCategory } from '../lib/types'
import { Icon } from './Icon'

interface ScopeReviewProps {
  analysis: ScopeAnalysis
  busy: boolean
  disabled: boolean
  readOnly: boolean
  reviewed: boolean
  source: RequestRow['analysisSource']
  onSave: (analysis: ScopeAnalysis) => Promise<void>
}

export function ScopeReview({ analysis, busy, disabled, readOnly, reviewed, source, onSave }: ScopeReviewProps) {
  const [draft, setDraft] = useState<ScopeAnalysis>(analysis)
  const groups = groupAnalysis(draft.items)

  function updateItem(id: string, patch: Partial<AnalysisItem>) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }

  function addItem(category: ScopeCategory) {
    setDraft((current) => {
      if (current.items.length >= MAX_ANALYSIS_ITEMS) return current
      return {
        ...current,
        items: [
          ...current.items,
          {
            id: nextHumanItemId(current.items),
            category,
            requestQuote: '',
            sourceExcerpt: null,
            rationale: '',
            confidence: 'low',
            clarificationQuestion: null,
          },
        ],
      }
    })
  }

  function removeItem(id: string) {
    setDraft((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== id),
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (readOnly) return
    await onSave(draft)
  }

  return (
    <form className="review" onSubmit={handleSubmit}>
      <header className="section-header">
        <div>
          <p className="eyebrow">Grounded comparison</p>
          <h2>AI compares. You decide.</h2>
        </div>
        <span className={`source-badge source-badge--${source}`}>
          {source === 'azure'
            ? 'Azure AI draft'
            : source === 'demo'
              ? reviewed ? 'Human reviewed sample' : 'Verified sample draft'
              : reviewed ? 'Human reviewed' : 'Manual-review draft'}
        </span>
      </header>

      <label className="summary-field">
        <span>Decision summary</span>
        <textarea
          maxLength={700}
          readOnly={readOnly}
          required
          rows={3}
          value={draft.summary}
          onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
        />
      </label>

      <div className="comparison-grid">
        {categoryOrder.map((category) => (
          <section className={`comparison-column comparison-column--${category}`} key={category}>
            <header>
              <span className="category-mark" aria-hidden="true" />
              <div>
                <h3>{categoryCopy[category].label}</h3>
                <p>{categoryCopy[category].description}</p>
              </div>
              <strong>{groups[category].length}</strong>
            </header>

            {!readOnly ? (
              <button
                className="add-evidence"
                disabled={draft.items.length >= MAX_ANALYSIS_ITEMS}
                type="button"
                onClick={() => addItem(category)}
              >
                <Icon name="plus" /> Add evidence
              </button>
            ) : null}

            <div className="comparison-column__items">
              {groups[category].length === 0 ? (
                <p className="empty-column">Nothing classified here.</p>
              ) : (
                groups[category].map((item) => (
                  <article className="comparison-card" key={item.id}>
                    {!readOnly ? (
                      <button
                        aria-label={`Remove evidence item ${item.id}`}
                        className="remove-evidence"
                        disabled={draft.items.length <= 1}
                        title={draft.items.length <= 1 ? 'A review needs at least one evidence item.' : undefined}
                        type="button"
                        onClick={() => removeItem(item.id)}
                      >
                        <Icon name="x" /> Remove
                      </button>
                    ) : null}
                    <div className="classification-control" aria-label="Classification">
                      {categoryOrder.map((option) => {
                        const includedWithoutCitation = option === 'included' && !item.sourceExcerpt
                        return (
                          <button
                            aria-pressed={item.category === option}
                            className={`classification-control__option classification-control__option--${option}`}
                            disabled={readOnly || includedWithoutCitation}
                            key={option}
                            title={includedWithoutCitation ? 'Included items need a baseline citation.' : undefined}
                            type="button"
                            onClick={() => updateItem(item.id, { category: option as ScopeCategory })}
                          >
                            {categoryCopy[option].short}
                          </button>
                        )
                      })}
                    </div>

                    <div className="evidence evidence--request">
                      <label>
                        <span>Exact client request excerpt</span>
                        <textarea
                          maxLength={600}
                          readOnly={readOnly}
                          required
                          rows={3}
                          value={item.requestQuote}
                          onChange={(event) => updateItem(item.id, { requestQuote: event.target.value })}
                        />
                      </label>
                    </div>
                    <div className="evidence evidence--baseline">
                      <label>
                        <span>
                          Exact accepted baseline excerpt{' '}
                          <em>{item.category === 'included' ? 'required' : 'optional'}</em>
                        </span>
                        <textarea
                          maxLength={900}
                          minLength={3}
                          required={item.category === 'included'}
                          readOnly={readOnly}
                          rows={3}
                          value={item.sourceExcerpt ?? ''}
                          onChange={(event) =>
                            updateItem(item.id, { sourceExcerpt: event.target.value || null })
                          }
                        />
                      </label>
                    </div>

                    <label className="compact-field">
                      <span>Why</span>
                      <textarea
                        maxLength={600}
                        readOnly={readOnly}
                        required
                        rows={3}
                        value={item.rationale}
                        onChange={(event) => updateItem(item.id, { rationale: event.target.value })}
                      />
                    </label>
                    <label className="compact-field">
                      <span>Question for the client <em>optional</em></span>
                      <textarea
                        maxLength={500}
                        readOnly={readOnly}
                        rows={2}
                        value={item.clarificationQuestion ?? ''}
                        onChange={(event) =>
                          updateItem(item.id, { clarificationQuestion: event.target.value || null })
                        }
                      />
                    </label>
                    <footer>
                      <span>Confidence</span>
                      <select
                        aria-label="Confidence"
                        disabled={readOnly}
                        value={item.confidence}
                        onChange={(event) =>
                          updateItem(item.id, {
                            confidence: event.target.value as AnalysisItem['confidence'],
                          })
                        }
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </footer>
                  </article>
                ))
              )}
            </div>
          </section>
        ))}
      </div>

      <footer className="review-footer">
        {readOnly ? (
          <p>This reviewed evidence is locked because the proposal has been shared or decided.</p>
        ) : (
          <>
            <p>Saving turns this machine draft into the operator's reviewed record.</p>
            <button className="button button--ink" disabled={disabled} type="submit">
              <Icon name="check" /> {busy ? 'Saving review…' : 'Save human review'}
            </button>
          </>
        )}
      </footer>
    </form>
  )
}
