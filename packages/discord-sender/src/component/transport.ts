import { isNonNullish, pickBy } from 'remeda'
import { up } from 'up-fetch'
import { z } from 'zod'

import type { ResponseSnapshot } from './protocol'

export type { ResponseSnapshot } from './protocol'

type Fetcher = (input: RequestInfo | URL, options?: RequestInit) => Promise<Response>

const zMessageBody = z.object({ components: z.unknown().optional() })

const zReceipt = z.object({
  channel_id: z.string().nullish().catch(null),
  id: z.string().nullish().catch(null),
})

/** One HTTP request. Scheduling and persistence belong to the caller. */
export async function executeWebhook(
  request: { payload: string; url: string },
  fetcher: Fetcher = fetch,
): Promise<ResponseSnapshot> {
  const url = new URL(request.url)
  const payload = zMessageBody.parse(JSON.parse(request.payload))
  url.searchParams.set('wait', 'true')

  if (payload.components !== undefined) {
    url.searchParams.set('with_components', 'true')
  }

  const send = up(fetcher)

  try {
    return await send(url, {
      body: request.payload,
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      parseResponse: readResponse,
      redirect: 'error',
      // Keep rejected HTTP responses intact. Protocol classification decides which
      // responses are terminal and which require another attempt.
      reject: () => false,
      retry: { attempts: 0 },
      timeout: 20_000,
    })
  } catch (error: unknown) {
    return {
      body: '',
      error: error instanceof Error ? error.message : String(error),
      headers: {},
      status: null,
    }
  }
}

async function readResponse(response: Response): Promise<ResponseSnapshot> {
  let body = ''
  let bodyError: string | undefined
  try {
    body = await response.text()
  } catch (error: unknown) {
    // Keep the known HTTP result even when the response body cannot be read.
    bodyError = `Response body unavailable: ${error instanceof Error ? error.message : String(error)}`
  }
  const receipt = readReceipt(body)

  return pickBy(
    {
      body,
      channelId: receipt.channel_id,
      error: bodyError,
      headers: Object.fromEntries(response.headers),
      messageId: receipt.id,
      status: response.status,
    },
    isNonNullish,
  )
}

function readReceipt(body: string): z.infer<typeof zReceipt> {
  try {
    return zReceipt.parse(JSON.parse(body))
  } catch {
    return {}
  }
}
