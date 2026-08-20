import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { CopyToClipboardButton } from '@/components/shared/copy-to-clipboard-button'
import { Item, ItemActions, ItemContent, ItemTitle } from '@/components/ui/item'

import { ClientApiCodeBlock } from './client-api-preview'
import { API_PATH } from './public-api'

async function getPublicApiUrl() {
  const requestHeaders = await headers()
  const host = (requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host'))
    ?.split(',')[0]
    ?.trim()

  if (host === undefined || host === '') {
    return API_PATH
  }

  const forwardedProto = requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const protocol =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : host.startsWith('localhost') || host.startsWith('127.0.0.1')
        ? 'http'
        : 'https'

  return `${protocol}://${host}${API_PATH}`
}

export const metadata: Metadata = {
  title: 'ORCA API',
  description:
    'OpenRouter model and endpoint data with provider-level pricing, context lengths, and capabilities.',
}

export default async function Page() {
  const apiUrl = await getPublicApiUrl()

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 lg:flex-row lg:justify-center lg:overflow-hidden lg:overflow-y-hidden">
      {/* * Left Column - Documentation */}
      <div className="typography w-full max-w-2xl p-6 lg:min-h-0 lg:overflow-y-auto">
        <h3>ORCA API</h3>

        <p>
          ORCA API returns all OpenRouter models with their available endpoints. The same model can
          vary significantly depending on which provider serves your request. Pricing, context
          length, and capabilities are exposed at the endpoint level.
        </p>

        <p>
          Data not available in the standard OpenRouter API is included: long context pricing tiers,
          data retention policies, hidden usage limits, moderation requirements, completions vs chat
          completions support, provider ids with variant tags, and configuration details for
          reasoning, caching, and web search.
        </p>

        <p>
          This is a public preview, and the schema will evolve with feedback and feature updates.
          Major changes are versioned, and preview versions will be maintained for an extended
          period of time, so you can confidently use it in your projects.
        </p>
      </div>

      {/* * Right Column - Live API Response */}
      <div className="flex w-full max-w-2xl flex-col gap-4 p-6 lg:min-h-0 lg:overflow-hidden">
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>Preview V2</ItemTitle>
            <code className="font-mono text-xs break-all">{apiUrl}</code>
          </ItemContent>
          <ItemActions>
            <CopyToClipboardButton
              value={apiUrl}
              size="icon"
              variant="secondary"
              aria-label="Copy API URL"
            />
          </ItemActions>
        </Item>

        <ClientApiCodeBlock />
      </div>
    </div>
  )
}
