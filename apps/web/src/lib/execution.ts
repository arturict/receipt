interface ExecutionLike {
  status: string
  responseStatusCode: number
  responseBody: string
  errors?: string
}

interface ErrorBody {
  ok?: false
  error?: string
}

export class ReceiptApiError extends Error {
  readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.name = 'ReceiptApiError'
    this.status = status
  }
}

export function parseExecution<T extends { ok: true }>(execution: ExecutionLike): T {
  let value: T | ErrorBody | null = null
  try {
    value = JSON.parse(execution.responseBody) as T | ErrorBody
  } catch {
    // A non-JSON response is handled by the generic error below.
  }

  const success =
    execution.status === 'completed' &&
    execution.responseStatusCode >= 200 &&
    execution.responseStatusCode < 300 &&
    value?.ok === true

  if (success) return value as T

  const message =
    value && 'error' in value && typeof value.error === 'string'
      ? value.error
      : 'Receipt could not reach the scope service.'
  throw new ReceiptApiError(message, execution.responseStatusCode || 500)
}
