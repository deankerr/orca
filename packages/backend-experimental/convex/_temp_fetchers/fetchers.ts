// oxlint-disable no-unused-vars temp
import { up } from 'up-fetch'
import { z } from 'zod'

const orFetch = up(fetch, () => ({
  baseUrl: 'https://openrouter.ai',
  retry: {
    attempts: 3,
    delay: (ctx) => ctx.attempt ** 2 * 1000,
  },
}))

const DataRecordArray = z
  .object({ data: z.record(z.string(), z.unknown()).array() })
  .transform((value) => value.data)

async function fetchProviders() {
  return orFetch('/api/frontend/all-providers', {
    schema: DataRecordArray,
  })
}

async function fetchModels() {
  return orFetch('/api/frontend/models', { schema: DataRecordArray })
}

async function fetchEndpoints(params: { permaslug: string; variant: string }) {
  return orFetch('/api/frontend/stats/endpoint', {
    params,
    schema: DataRecordArray,
  })
}
