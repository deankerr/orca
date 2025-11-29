/**
 * Validates the live production API output against EndpointOutputSchema
 *
 * Fetches data from https://orca.orb.town/api/preview/v2/models
 * and validates that all provider objects match the expected schema.
 */

import { EndpointOutputSchema } from '../convex/transforms/endpoint'

const API_URL = 'https://orca.orb.town/api/preview/v2/models'

async function validatePublicApi() {
  console.log(`Fetching data from ${API_URL}...`)

  const response = await fetch(API_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch API: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  if (!data.models || !Array.isArray(data.models)) {
    throw new Error('API response does not contain a valid "models" array')
  }

  console.log(`Found ${data.models.length} models`)

  const validationErrors: Array<{
    modelId: string
    providerId: string
    error: string
    issues?: unknown
  }> = []
  let validatedCount = 0

  for (const model of data.models) {
    if (!model.providers || !Array.isArray(model.providers)) {
      console.warn(`Model "${model.id}" does not have a valid "providers" array. Skipping.`)
      continue
    }

    for (const provider of model.providers) {
      try {
        EndpointOutputSchema.parse(provider)
        validatedCount++
      } catch (error: unknown) {
        const zodError = error && typeof error === 'object' && 'issues' in error ? error : null

        validationErrors.push({
          modelId: model.id,
          providerId: provider.provider_id || 'unknown',
          error: zodError && 'message' in zodError ? String(zodError.message) : String(error),
          issues: zodError?.issues,
        })
      }
    }
  }

  if (validationErrors.length > 0) {
    console.error(
      `\n❌ Validation failed: ${validationErrors.length} provider(s) did not match the schema\n`,
    )

    for (const err of validationErrors) {
      console.error(`Model: ${err.modelId}`)
      console.error(`Provider: ${err.providerId}`)
      console.error(`Error: ${err.error}`)
      if (err.issues) {
        console.error('Issues:', JSON.stringify(err.issues, null, 2))
      }
      console.error('---\n')
    }

    process.exit(1)
  } else {
    console.log(`\n✅ Validation succeeded! All ${validatedCount} provider(s) matched the schema.`)
    process.exit(0)
  }
}

validatePublicApi().catch((error) => {
  console.error('\n❌ Fatal error during validation:')
  console.error(error)
  process.exit(1)
})
