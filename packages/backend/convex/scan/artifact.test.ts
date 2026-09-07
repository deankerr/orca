/// <reference types="bun" />

import { expect, test } from 'bun:test'

import { createScanArtifact } from './artifact'

test('creates a parsed scan artifact', () => {
  const scan_at = '2026-09-04T00:00:00.000Z'

  const entry = {
    model_id: 'author/model',
    variant: 'standard',
    model: {
      slug: 'author/model',
      permaslug: 'author/model',
      input_modalities: ['text'],
      output_modalities: ['text'],
    },
    endpoints: null,
  }

  const artifact = createScanArtifact([entry], scan_at)

  expect(artifact).toEqual({
    id: `scan.${scan_at}.jsonl`,
    scan_at,
    entries: [
      {
        ...entry,
        scan_at,
      },
    ],
  })
})

test('artifact timestamp overrides an entry timestamp', () => {
  const scan_at = '2026-09-04T00:00:00.000Z'

  const entry = {
    model_id: 'author/model',
    variant: 'standard',
    model: {
      slug: 'author/model',
      permaslug: 'author/model',
      input_modalities: ['text'],
      output_modalities: ['text'],
    },
    endpoints: null,
  }

  Object.defineProperty(entry, 'scan_at', { value: 'wrong' })

  expect(createScanArtifact([entry], scan_at).entries[0]?.scan_at).toBe(scan_at)
})
