export type Request = {
  messageId?: string
  operation: 'send' | 'get' | 'edit' | 'delete'
  payload?: string
  url: string
}

export type ResponseSnapshot = {
  body: string
  channelId?: string
  error?: string
  headers: Record<string, string>
  messageId?: string
  retryAfterMs?: number
  status: number | null
}

export type Fetcher = (url: URL, options: RequestInit) => Promise<Response>

export const REQUEST_TIMEOUT_MS = 20_000

/** One HTTP attempt. Scheduling, retries and persistence belong to the worker. */
export async function executeRequest(
  request: Request,
  fetcher: Fetcher = fetch,
): Promise<ResponseSnapshot> {
  const url = requestUrl(request)
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, REQUEST_TIMEOUT_MS)

  try {
    const response = await fetcher(url, {
      body:
        request.operation === 'send' || request.operation === 'edit' ? request.payload : undefined,
      headers: { 'Content-Type': 'application/json' },
      method: requestMethod(request.operation),
      redirect: 'error',
      signal: controller.signal,
    })
    let body = ''
    let bodyError: string | undefined
    try {
      body = await response.text()
    } catch (error: unknown) {
      // Receiving the status confirms the HTTP outcome even if its body is lost.
      // In particular, preserve 2xx acceptance and 429 cooldowns instead of retrying blindly.
      bodyError = `Response body unavailable: ${error instanceof Error ? error.message : String(error)}`
    }
    const data = parseObject(body)
    const retryAfterMs = retryDelay(response.headers, data)
    const channelId = typeof data?.channel_id === 'string' ? data.channel_id : undefined
    const messageId = typeof data?.id === 'string' ? data.id : undefined

    return {
      body,
      headers: Object.fromEntries(response.headers),
      ...(channelId === undefined ? {} : { channelId }),
      ...(bodyError === undefined ? {} : { error: bodyError }),
      ...(messageId === undefined ? {} : { messageId }),
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      status: response.status,
    }
  } catch (error: unknown) {
    return {
      body: '',
      error: error instanceof Error ? error.message : String(error),
      headers: {},
      status: null,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export function requestUrl(request: Request): URL {
  const url = new URL(request.url)

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Webhook destinations must use HTTP or HTTPS.')
  }

  if (request.operation === 'send') {
    url.searchParams.set('wait', 'true')
  } else {
    if (
      request.messageId === undefined ||
      request.messageId === '' ||
      request.messageId === '.' ||
      request.messageId === '..'
    ) {
      throw new Error('A receipt message ID is required for message operations.')
    }

    url.pathname = `${url.pathname.replace(/\/$/, '')}/messages/${encodeURIComponent(request.messageId)}`
    url.searchParams.delete('wait')
  }

  if (request.payload !== undefined && parseObject(request.payload)?.components !== undefined) {
    url.searchParams.set('with_components', 'true')
  }

  return url
}

function requestMethod(operation: Request['operation']): string {
  switch (operation) {
    case 'send': {
      return 'POST'
    }
    case 'edit': {
      return 'PATCH'
    }
    case 'delete': {
      return 'DELETE'
    }
    case 'get': {
      return 'GET'
    }
    default: {
      throw new Error('Unsupported webhook operation.')
    }
  }
}

function parseObject(body: string): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(body)
    return data !== null && typeof data === 'object' && !Array.isArray(data)
      ? Object.fromEntries(Object.entries(data))
      : null
  } catch {
    return null
  }
}

function retryDelay(headers: Headers, data: Record<string, unknown> | null): number | undefined {
  const delays: number[] = []
  const addDelay = (milliseconds: number) => {
    // Validate after conversion: finite seconds can overflow when multiplied by 1,000.
    // A deadline outside JavaScript's timestamp domain cannot be scheduled.
    if (Number.isFinite(milliseconds) && milliseconds <= 8.64e15 - Date.now()) {
      delays.push(Math.max(0, milliseconds))
    }
  }
  const retryAfter = headers.get('retry-after')

  if (retryAfter !== null) {
    const seconds = Number(retryAfter)
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()

    addDelay(delay)
  }

  if (typeof data?.retry_after === 'number' && Number.isFinite(data.retry_after)) {
    addDelay(data.retry_after * 1000)
  }

  if (headers.get('x-ratelimit-remaining') === '0') {
    const reset = headers.get('x-ratelimit-reset-after')

    if (reset !== null && Number.isFinite(Number(reset))) {
      addDelay(Number(reset) * 1000)
    }
  }

  return delays.length === 0 ? undefined : Math.ceil(Math.max(...delays))
}
