/**
 * Validates a public API response against the full ORCA preview v2 schema.
 *
 * Usage:
 *   bun scripts/validate-public-api.ts <url>
 */

import { OrcaPublicApiV2Schema } from '@orca/backend/convex/public_api/preview_v2'
import { ZodError } from 'zod'

function getApiUrl() {
  const apiUrl = process.argv.at(2)

  if (apiUrl === undefined || apiUrl === '') {
    throw new Error('Missing API URL argument. Usage: bun scripts/validate-public-api.ts <url>')
  }

  return new URL(apiUrl).toString()
}

async function validatePublicApi(apiUrl: string) {
  console.log(`Fetching data from ${apiUrl}...`)

  const response = await fetch(apiUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch API: ${response.status} ${response.statusText}`)
  }

  const parsed = OrcaPublicApiV2Schema.parse(await response.json())

  const providerCount = parsed.models.reduce((count, model) => count + model.providers.length, 0)

  console.log(`Found ${parsed.models.length} models`)
  console.log(`Validated ${providerCount} providers`)
  console.log(`Updated at ${parsed.updated_at}`)
}

async function main() {
  try {
    await validatePublicApi(getApiUrl())
  } catch (error) {
    console.error('\n❌ Fatal error during validation:')
    if (error instanceof ZodError) {
      console.error(JSON.stringify(error.issues, null, 2))
    } else {
      console.error(error)
    }
    process.exit(1)
  }
}

await main()
