import { expect, test } from 'bun:test'

import type { EntityChangeContent } from '../changeEvents/schema'
import { renderFeed } from './markdown'

type Event = Parameters<typeof renderFeed>[0][number]

test('time groups combine entity updates and render conflicting operations independently for every kind', () => {
  const record = {
    model_id: 'shared-id',
    provider_id: 'provider-id',
    provider_tag: 'provider-region',
    display_name: 'Example',
    model_display_name: 'Example model',
    provider_display_name: 'Example provider',
    pricing: { prompt: '0.000001', completion: '0.000002' },
    metadata: { description: 'An example entity' },
  }
  const events: Event[] = (['model', 'provider', 'endpoint'] as const).flatMap((entity_kind) =>
    (['create', 'update', 'delete'] as const).map((operation) => {
      const content: EntityChangeContent = {
        changes: {
          before:
            operation === 'create'
              ? null
              : operation === 'delete'
                ? record
                : { display_name: 'Old name' },
          after:
            operation === 'delete'
              ? null
              : operation === 'create'
                ? record
                : { display_name: 'New name' },
        },
        context: {
          before: { entity: operation === 'create' ? null : record },
          after: { entity: operation === 'delete' ? null : record },
        },
      }
      return {
        _id: `${entity_kind}-${operation}`,
        entity_kind,
        entity_id: 'shared-id',
        category: operation === 'update' ? 'attributes' : 'lifecycle',
        from_scan_at: '2026-09-01T00:00:00.000Z',
        scan_at: '2026-09-19T12:00:00.000Z',
        content: JSON.stringify(content),
      }
    }),
  )
  const pricing: Event = {
    ...events[7],
    _id: 'endpoint-pricing',
    category: 'pricing',
    content: JSON.stringify({
      changes: {
        before: { pricing: { prompt: '0.000001' } },
        after: { pricing: { prompt: '0.000002' } },
      },
      context: { before: { entity: record }, after: { entity: record } },
    }),
  }
  // Start with the older group to verify document ordering rather than relying on caller order.
  const older = { ...events[0], _id: 'older', scan_at: '2026-09-18T12:00:00.000Z' }
  const feed = renderFeed([older, ...events, pricing])
  expect(feed.match(/^## As of /gm)).toHaveLength(2)
  expect(feed.indexOf('As of 2026-09-19')).toBeLessThan(feed.indexOf('As of 2026-09-18'))
  expect(feed).not.toContain('2026-09-01')
  expect(feed).not.toContain('\n---\n')
  expect(feed).not.toContain('Observed ')
  expect(feed.match(/^### /gm)).toHaveLength(5)
  expect(feed.match(/^#### /gm)).toHaveLength(3)
  for (const kind of ['Model', 'Provider', 'Endpoint']) {
    for (const operation of ['added', 'updated', 'removed']) {
      expect(feed).toContain(`${kind} ${operation}.`)
    }
  }
  expect(feed.match(/Endpoint updated\./g)).toHaveLength(1)
  expect(feed).toContain('Input price changed from $1 per million tokens to $2 per million tokens')
  expect(feed).toContain('Input price: $1 per million tokens')
  expect(feed).toContain('Description:')
  expect(feed).toContain('### Example (` shared-id `)')
  expect(feed).toContain('### Example (` provider-id `)')
  expect(feed).toContain('#### Example provider (` provider-region `)')
  for (const event of [older, ...events, pricing]) {
    expect(feed).toContain(`/ces/events/${event._id})`)
  }
})

test('model sections put model creation before endpoints and distinguish provider tags from provider IDs', () => {
  const model = {
    model_id: 'org/model_v1',
    display_name: 'Model name',
    permaslug: 'not-the-model-id',
  }
  const endpoint = {
    model_id: model.model_id,
    model_display_name: model.display_name,
    model_permaslug: 'not-the-model-id',
    provider_display_name: 'Provider name',
    provider_tag: 'provider/us',
    provider_id: 'canonical-provider',
  }
  const created = (
    entity_kind: Event['entity_kind'],
    entity_id: string,
    record: Record<string, string>,
  ): Event => ({
    _id: entity_id,
    entity_kind,
    entity_id,
    category: 'lifecycle',
    from_scan_at: null,
    scan_at: '2026-09-19T12:00:00.000Z',
    content: JSON.stringify({
      changes: { before: null, after: record },
      context: { before: { entity: null }, after: { entity: record } },
    }),
  })
  const us = created('endpoint', 'endpoint-us', endpoint)
  const eu = created('endpoint', 'endpoint-eu', { ...endpoint, provider_tag: 'provider/eu' })
  const provider = created('provider', 'canonical-provider', {
    provider_id: 'canonical-provider',
    display_name: 'Provider name',
  })
  const other = created('endpoint', 'other-endpoint', { ...endpoint, model_id: 'org/model_v2' })
  const feed = renderFeed([us, provider, other, eu, created('model', model.model_id, model)])
  const modelHeading = '### Model name (` org/model_v1 `)'
  const usHeading = '#### Provider name (` provider/us `)'
  const euHeading = '#### Provider name (` provider/eu `)'
  expect(feed.split(modelHeading)).toHaveLength(2)
  expect(feed.indexOf('Model added.')).toBeLessThan(feed.indexOf(usHeading))
  expect(feed.indexOf(usHeading)).toBeLessThan(feed.indexOf(euHeading))
  expect(feed.indexOf(euHeading)).toBeLessThan(
    feed.indexOf('### Provider name (` canonical-provider `)'),
  )
  expect(feed).toContain('### Model name (` org/model_v2 `)')
  expect(feed).not.toContain('not-the-model-id')
  expect(feed).not.toContain('#### Provider name (` canonical-provider `)')
  expect(feed).not.toContain('\\_')

  const endpointOnly = renderFeed([us, eu])
  expect(endpointOnly).toContain(modelHeading)
  expect(endpointOnly).not.toContain('Model added.')
  expect(endpointOnly.match(/^### /gm)).toHaveLength(1)
  expect(endpointOnly.match(/^#### /gm)).toHaveLength(2)
})

test('empty windows and missing display context need no special document state', () => {
  expect(renderFeed([])).toBe('# ORCA change feed\n\nNo events yet.\n')
  const feed = renderFeed([
    {
      _id: 'missing-context',
      entity_kind: 'provider',
      entity_id: 'provider-id',
      category: 'lifecycle',
      from_scan_at: null,
      scan_at: '2026-09-19T12:00:00.000Z',
      content: JSON.stringify({
        changes: { before: null, after: {} },
        context: { before: { entity: null }, after: { entity: null } },
      }),
    },
  ])
  expect(feed).toContain('### provider-id')
  expect(feed).toContain('Provider added.')
})
