import { createApp } from '@orca/api'
import type { Catalog } from '@orca/api'
import { api } from '@orca/backend/api'
import { fetchQuery } from 'convex/nextjs'

// The ORCA clock advances hourly; one read per instance per minute serves every request between.
const SNAPSHOT_TTL_MS = 60_000
let snapshot: { expires: number; value: Promise<Catalog> } | undefined

async function loadCatalog() {
  if (snapshot === undefined || snapshot.expires < Date.now()) {
    const value = fetchQuery(api.products.v5.catalog.snapshot, {})
    snapshot = { expires: Date.now() + SNAPSHOT_TTL_MS, value }
    // A failed read must not be served from the memo.
    value.catch(() => {
      if (snapshot?.value === value) {
        snapshot = undefined
      }
    })
  }
  return await snapshot.value
}

const app = createApp({ basePath: '/api/v5', loadCatalog })

export const GET = async (request: Request) => await app.fetch(request)
