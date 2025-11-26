import type { Metadata } from 'next'

import { CopyToClipboardButton } from '@/components/shared/copy-to-clipboard-button'
import { Item, ItemActions, ItemContent, ItemTitle } from '@/components/ui/item'

import { ApiResponseViewer } from './api-response-viewer'

export const metadata: Metadata = {
  title: 'ORCA API',
  description:
    'OpenRouter model and endpoint data with provider-level pricing, context lengths, and capabilities.',
}

const API_PATH = '/api/preview/v2/models'

function getBaseUrl() {
  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) {
    return `https://${vercelUrl}`
  }
  return 'https://orca.example.com'
}

export default function Page() {
  const baseUrl = getBaseUrl()
  const apiUrl = `${baseUrl}${API_PATH}`

  return (
    <div className="flex flex-1 flex-col px-4 lg:flex-row lg:justify-center lg:overflow-hidden">
      {/* * Left Column - Documentation */}
      <div className="typography w-full max-w-2xl overflow-y-auto p-6">
        <h3>ORCA API</h3>

        <p>
          ORCA API returns all OpenRouter models with their available endpoints. Pricing, context
          length, and capabilities are exposed at the endpoint level. The same model can vary
          significantly depending on which provider serves your request.
        </p>

        <p>
          Includes data not available in the standard OpenRouter API: long context pricing tiers,
          data retention policies, hidden usage limits, moderation requirements, completions vs chat
          completions support, provider ids with variant tags, and configuration details for
          reasoning, caching, and web search.
        </p>

        <p>
          The schema is versioned and the preview versions will be maintained for an extended
          period, so you can confidently use it in your projects.
        </p>
      </div>

      {/* * Right Column - Live API Response */}
      <div className="flex w-full max-w-2xl flex-col gap-4 overflow-hidden p-6">
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>Preview V2</ItemTitle>
            <code className="font-mono text-sm">{apiUrl}</code>
          </ItemContent>
          <ItemActions>
            <CopyToClipboardButton value={apiUrl} size="sm" variant="secondary">
              Copy
            </CopyToClipboardButton>
          </ItemActions>
        </Item>

        <ApiResponseViewer />
      </div>
    </div>
  )
}
