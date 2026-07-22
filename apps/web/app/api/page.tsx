import type { Metadata } from 'next'

import { CopyToClipboardButton } from '@/components/shared/copy-to-clipboard-button'
import { Item, ItemActions, ItemContent, ItemTitle } from '@/components/ui/item'

import { ClientApiCodeBlock } from './client-api-preview'

export const metadata: Metadata = {
  title: 'ORCA API',
  description:
    'The curated OpenRouter dataset, as JSON — provider-level pricing, context lengths, and capabilities for every model.',
}

const API_URL = 'https://orca.orb.town/api/preview/v2/models'

export default function Page() {
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
            <code className="font-mono text-xs break-all">{API_URL}</code>
          </ItemContent>
          <ItemActions>
            <CopyToClipboardButton
              value={API_URL}
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
