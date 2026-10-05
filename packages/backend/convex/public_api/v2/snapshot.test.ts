/* oxlint-disable typescript/no-unsafe-type-assertion -- Snapshot tests need only the mocked Objects retrieval seam. */
import { spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import type { ActionCtx } from '#generated/server'

import * as objects from '../../objects'
import { buildSnapshot } from './snapshot'

test('snapshot rejects missing data, unusable endpoint fields and empty snapshots before publication', async () => {
  const scanAt = '2026-10-02T10:40:04.272Z'

  const entry = {
    scan_at: scanAt,
    model_id: 'author/model',
    variant: 'standard',
    model: {
      slug: 'author/model',
      permaslug: 'author/model-v1',
      input_modalities: ['text'],
      output_modalities: ['text'],
    },
    endpoints: null,
  }

  const source = spyOn(objects, 'loadMany').mockResolvedValue([null])
  const ctx = {} as ActionCtx

  try {
    await rejects(buildSnapshot(ctx, scanAt), /Scan not found/)

    source.mockResolvedValue([
      JSON.stringify({
        ...entry,
        endpoints: [{ id: 'endpoint', variant: 'standard', model_variant_slug: 'author/model' }],
      }),
    ])

    await rejects(buildSnapshot(ctx, scanAt))
    for (const endpoints of [null, []]) {
      source.mockResolvedValue([JSON.stringify({ ...entry, endpoints })])
      await rejects(buildSnapshot(ctx, scanAt), /Public API scan has no usable endpoints/)
    }
  } finally {
    source.mockRestore()
  }
})
