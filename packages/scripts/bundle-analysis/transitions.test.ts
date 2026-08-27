import { describe, expect, test } from 'bun:test'

import { analyzeBundle } from './analyze-bundle.ts'
import {
  bundle,
  displayRow,
  endpoint,
  endpointId,
  otherEndpointId,
  pricing,
  source,
} from './test-fixtures.ts'
import { deriveTransitions } from './transitions.ts'

describe('deriveTransitions', () => {
  test('emits adjacent source-path changes', () => {
    const before = analyzeBundle(
      source(
        bundle('before', '2026-08-24T00:00:00.000Z', [
          endpoint({ pricing_json: undefined, pricing_version_id: undefined }),
        ]),
      ),
    )
    const after = analyzeBundle(
      source(
        bundle('after', '2026-08-24T01:00:00.000Z', [
          endpoint({
            pricing: pricing({ prompt: '0.000002' }),
            pricing_version_id: 'version-2',
          }),
        ]),
      ),
    )

    expect(deriveTransitions([before, after])).toEqual([
      {
        endpoint_changes: [
          {
            changed_paths: ['pricing.prompt', 'pricing_json', 'pricing_version_id'],
            endpoint_id: endpointId,
            kind: 'pricing_changed',
            model_id: 'example/model',
            provider_slug: 'example',
          },
        ],
        from_crawl_id: 'before',
        to_crawl_id: 'after',
      },
    ])
  })

  test('compares independent structures while ignoring object key order', () => {
    const before = analyzeBundle(
      source(
        bundle('before', '2026-08-24T00:00:00.000Z', [
          endpoint({ pricing_json: { completion: '2', prompt: '1' } }),
        ]),
      ),
    )
    const after = analyzeBundle(
      source(
        bundle('after', '2026-08-24T01:00:00.000Z', [
          endpoint({
            display_pricing: [displayRow({ price: '2e-6' })],
            pricing_json: { completion: '2', prompt: '1' },
          }),
        ]),
      ),
    )

    expect(deriveTransitions([before, after])[0]?.endpoint_changes).toEqual([
      {
        changed_paths: ['display_pricing'],
        endpoint_id: endpointId,
        kind: 'pricing_changed',
        model_id: 'example/model',
        provider_slug: 'example',
      },
    ])
  })

  test('emits endpoint additions and removals', () => {
    const before = analyzeBundle(source(bundle('before', '2026-08-24T00:00:00.000Z', [endpoint()])))
    const after = analyzeBundle(
      source(bundle('after', '2026-08-24T01:00:00.000Z', [endpoint({ id: otherEndpointId })])),
    )

    expect(deriveTransitions([before, after])[0]?.endpoint_changes).toEqual([
      {
        endpoint_id: endpointId,
        kind: 'endpoint_removed',
        model_id: 'example/model',
        provider_slug: 'example',
      },
      {
        endpoint_id: otherEndpointId,
        kind: 'endpoint_added',
        model_id: 'example/model',
        provider_slug: 'example',
      },
    ])
  })
})
