import type { Metadata } from 'next'

import { CopyToClipboardButton } from '@/components/shared/copy-to-clipboard-button'
import { Item, ItemActions, ItemContent, ItemTitle } from '@/components/ui/item'

import { ApiResponseViewer } from './api-response-viewer'

export const metadata: Metadata = {
  title: 'ORCA API',
  description: 'Public API for programmatic access to ORCA data',
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
          The ORCA API provides programmatic access to curated OpenRouter data. Rather than
          aggregating provider differences into model-level fields, this API highlights the
          variability between providers for the same model. Pricing, context length, and
          capabilities can differ significantly depending on which provider serves the request.
        </p>

        <p>
          This approach means pricing and limits are exposed per-provider rather than as top-level
          model fields. Each model lists its available providers (or endpoints), and each endpoint
          shows its specific pricing structure, context length, quantization, and other
          provider-specific details.
        </p>

        <p>
          Beyond restructuring how provider variability is represented, the API also surfaces data
          that isn&apos;t available in the standard OpenRouter API: long context pricing tiers, data
          retention policies, actual usage limits, moderation requirements, support for completions
          vs chat completions, provider ids with variant tags, and configuration details for
          reasoning, caching, and web search, etc.
        </p>

        <p>
          The schema is still being refined, but will be versioned throughout the preview period.
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
