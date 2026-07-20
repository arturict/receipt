import { describe, expect, it } from 'vitest'
import {
  analysisLeaseExpired,
  canMutateAnalysis,
  formatDateOnly,
  formatMoney,
  getShareLink,
  getShareToken,
  groupAnalysis,
  nextHumanItemId,
  priceToCents,
  readAnalysis,
  scrubbedSharePath,
  toProposalIso,
} from './domain'
import { defaultDueDate, sampleCase } from './sample'
import type { AnalysisItem, RequestRow } from './types'

const items: AnalysisItem[] = [
  {
    id: 'one',
    category: 'additional',
    requestQuote: 'Add booking.',
    sourceExcerpt: 'No booking system.',
    rationale: 'Explicit exclusion.',
    confidence: 'high',
    clarificationQuestion: null,
  },
  {
    id: 'two',
    category: 'included',
    requestQuote: 'Keep Friday.',
    sourceExcerpt: 'Launch Friday.',
    rationale: 'Same date.',
    confidence: 'medium',
    clarificationQuestion: null,
  },
]

describe('scope presentation helpers', () => {
  it('groups analysis without losing item identity', () => {
    const grouped = groupAnalysis(items)
    expect(grouped.additional.map((item) => item.id)).toEqual(['one'])
    expect(grouped.included.map((item) => item.id)).toEqual(['two'])
    expect(grouped.unclear).toEqual([])
  })

  it('rejects malformed or partial analysis JSON', () => {
    expect(readAnalysis({ analysisJson: '{' } as RequestRow)).toBeNull()
    expect(readAnalysis({ analysisJson: '{"summary":"x"}' } as RequestRow)).toBeNull()
  })

  it('accepts a complete analysis payload', () => {
    const request = {
      analysisJson: JSON.stringify({ summary: 'Reviewed.', items }),
    } as RequestRow
    expect(readAnalysis(request)?.items).toHaveLength(2)
  })

  it('returns the first stable unused human evidence ID', () => {
    expect(nextHumanItemId([{ id: 'human-1' }, { id: 'model-item' }, { id: 'human-3' }])).toBe(
      'human-2',
    )
    expect(nextHumanItemId([])).toBe('human-1')
  })

  it('keeps analysis controls aligned with the server state machine', () => {
    expect(['ready', 'review', 'error'].every((status) => canMutateAnalysis(status as RequestRow['status']))).toBe(true)
    expect(['analyzing', 'proposed', 'accepted', 'rejected'].some((status) => canMutateAnalysis(status as RequestRow['status']))).toBe(false)
  })

  it('exposes recovery only after the 45 second lease', () => {
    const now = new Date('2026-07-20T12:01:00.000Z')
    expect(analysisLeaseExpired('2026-07-20T12:00:16.000Z', now)).toBe(false)
    expect(analysisLeaseExpired('2026-07-20T12:00:15.000Z', now)).toBe(true)
  })
})

describe('proposal boundaries', () => {
  it.each([
    ['1850', 185_000],
    ['1850.5', 185_050],
    ['1850,50', 185_050],
    ['0', 0],
  ])('converts %s to integer cents', (input, expected) => {
    expect(priceToCents(input)).toBe(expected)
  })

  it.each(['1.999', '-1', 'free', '', '1000000.01'])(
    'rejects unsafe price %s',
    (input) => expect(() => priceToCents(input)).toThrow(),
  )

  it('turns a calendar day into an ISO instant', () => {
    expect(toProposalIso('2030-04-20')).toBe('2030-04-20T23:59:59.999Z')
    expect(formatDateOnly('2030-04-20T23:30:00.000Z')).toBe('Apr 20, 2030')
    expect(new Date(toProposalIso('2030-07-21')).getTime()).toBeGreaterThan(
      new Date('2030-07-21T01:00:00.000Z').getTime(),
    )
    expect(() => toProposalIso('2030-02-30')).toThrow()
  })

  it('builds default delivery dates from local calendar parts', () => {
    expect(defaultDueDate(new Date(2030, 0, 30, 0, 30), 10)).toBe('2030-02-09')
  })

  it('formats minor currency units as money', () => {
    expect(formatMoney(185_000, 'EUR')).toMatch(/1[,.]850/)
  })
})

describe('capability links', () => {
  const token = 'a'.repeat(64)

  it('accepts only exact lowercase 64-character tokens', () => {
    expect(getShareToken('', `#share=${token}`)).toBe(token)
    expect(getShareToken(`?share=${token}`)).toBe(token)
    expect(getShareToken(`?share=${'a'.repeat(63)}`)).toBeNull()
    expect(getShareToken(`?share=${'A'.repeat(64)}`)).toBeNull()
    expect(getShareToken('?share=javascript:alert(1)')).toBeNull()
  })

  it('creates a same-origin link without carrying unrelated query values', () => {
    expect(getShareLink(token, { origin: 'https://receipt.test', pathname: '/app/' })).toBe(
      `https://receipt.test/app/#share=${token}`,
    )
  })

  it('scrubs legacy tokens while preserving unrelated query values', () => {
    expect(scrubbedSharePath('/app/', `?utm=demo&share=${token}`, token)).toBe(
      `/app/?utm=demo#share=${token}`,
    )
    expect(scrubbedSharePath('/app/', '?share=invalid', null)).toBe('/app/')
  })
})

describe('deterministic sample', () => {
  it('contains the exact baseline exclusions used by the backend demo', () => {
    expect(sampleCase.scopeContent).toContain('No booking, checkout, membership, or customer account system.')
    expect(sampleCase.requestContent).toContain('Can you add table bookings with confirmation emails?')
  })
})
