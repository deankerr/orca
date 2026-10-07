import type { Infer } from 'convex/values'
import { isNonNullish, pickBy } from 'remeda'
import { up } from 'up-fetch'
import { z } from 'zod'

import type { vResponse } from './schema'

export type ResponseSnapshot = Infer<typeof vResponse>

type Fetcher = (input: RequestInfo | URL, options?: RequestInit) => Promise<Response>

const zMessageBody = z.object({ components: z.unknown().optional() })

const zReceipt = z.object({
  channel_id: z.string().nullish().catch(null),
  id: z.string().nullish().catch(null),
})

/** One request; Workpool and the delivery ledger own execution and persistence. */
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
      // Every HTTP result belongs in the ledger; the worker decides its outcome.
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
