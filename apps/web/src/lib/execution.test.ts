import { describe, expect, it } from 'vitest'
import { parseExecution, ReceiptApiError } from './execution'

describe('Appwrite execution responses', () => {
  it('returns a completed 2xx Receipt payload', () => {
    const response = parseExecution<{ ok: true; requestId: string }>({
      status: 'completed',
      responseStatusCode: 200,
      responseBody: JSON.stringify({ ok: true, requestId: 'request-1' }),
    })
    expect(response.requestId).toBe('request-1')
  })

  it('surfaces the safe function error and status', () => {
    expect.assertions(2)
    try {
      parseExecution({
        status: 'completed',
        responseStatusCode: 409,
        responseBody: JSON.stringify({ ok: false, error: 'Review the comparison first.' }),
      })
    } catch (cause) {
      expect(cause).toBeInstanceOf(ReceiptApiError)
      expect(cause).toMatchObject({ message: 'Review the comparison first.', status: 409 })
    }
  })

  it('does not trust an ok body from a failed execution', () => {
    expect(() =>
      parseExecution({
        status: 'failed',
        responseStatusCode: 200,
        responseBody: JSON.stringify({ ok: true }),
        errors: 'Runtime failed.',
      }),
    ).toThrow('Receipt could not reach the scope service.')
  })

  it('handles a non-JSON gateway response without leaking it', () => {
    expect(() =>
      parseExecution({
        status: 'completed',
        responseStatusCode: 502,
        responseBody: '<html>bad gateway</html>',
      }),
    ).toThrow('Receipt could not reach the scope service.')
  })
})
