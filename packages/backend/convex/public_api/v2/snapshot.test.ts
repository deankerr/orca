import { rejects } from 'node:assert/strict'

/* oxlint-disable typescript/no-unsafe-type-assertion -- Snapshot tests need only the mocked Objects retrieval seam. */
import { vi, test } from 'vitest'

import type { ActionCtx } from '#generated/server'
import * as objects from '#objects'

import { buildSnapshot } from './snapshot'

test('snapshot rejects missing data, unusable endpoint fields and empty snapshots before publication', async () => {
  const scanAt = '2026-10-02T10:40:04.272Z'

  const entry = {
    endpoints: null,
    model: {
      input_modalities: ['text'],
      output_modalities: ['text'],
      permaslug: 'author/model-v1',
      slug: 'author/model',
    },
    model_id: 'author/model',
    scan_at: scanAt,
    variant: 'standard',
  }

  const source = vi.spyOn(objects, 'loadMany').mockResolvedValue([null])
  const ctx = {} as ActionCtx

  try {
    await rejects(buildSnapshot(ctx, scanAt), /Scan not found/u)

    source.mockResolvedValue([
      JSON.stringify({
        ...entry,
        endpoints: [{ id: 'endpoint', model_variant_slug: 'author/model', variant: 'standard' }],
      }),
    ])

    await rejects(buildSnapshot(ctx, scanAt))
    for (const endpoints of [null, []]) {
      source.mockResolvedValue([JSON.stringify({ ...entry, endpoints })])
      await rejects(buildSnapshot(ctx, scanAt), /Public API scan has no usable endpoints/u)
    }
  } finally {
    source.mockRestore()
  }
})
