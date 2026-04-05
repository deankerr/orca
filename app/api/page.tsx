import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { ClientApiPreview } from './client-api-preview'

export const metadata: Metadata = {
  title: 'ORCA API',
  description:
    'OpenRouter model and endpoint data with provider-level pricing, context lengths, and capabilities.',
}

const API_PATH = '/api/preview/v2/models'

async function getApiUrl() {
  const requestHeaders = await headers()
  const host =
    requestHeaders.get('x-forwarded-host') ??
    requestHeaders.get('host') ??
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
  const protocol =
    requestHeaders.get('x-forwarded-proto') ??
    (host === process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ? 'https' : 'http')

  if (host === undefined || host === '') {
    return API_PATH
  }

  return new URL(API_PATH, `${protocol}://${host}`).toString()
}

export default async function Page() {
  const apiUrl = await getApiUrl()

  return (
    <div className="flex flex-1 flex-col px-4 lg:flex-row lg:justify-center lg:overflow-hidden">
      {/* * Left Column - Documentation */}
      <div className="typography w-full max-w-2xl overflow-y-auto p-6">
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
      <ClientApiPreview apiUrl={apiUrl} />
    </div>
  )
}
