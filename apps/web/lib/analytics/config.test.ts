import { expect, test } from 'bun:test'

import { analyticsConfig } from './config'

test('production and preview capture automatically; development requires explicit opt-in', () => {
  for (const environment of ['production', 'preview']) {
    expect(analyticsConfig({ environment, key: ' ingestion-key ' }).key).toBe('ingestion-key')
  }

  expect(analyticsConfig({ key: 'ingestion-key' })).toEqual({
    environment: 'development',
    key: undefined,
  })
  expect(analyticsConfig({ key: 'ingestion-key', developmentEnabled: 'true' }).key).toBe(
    'ingestion-key',
  )
  expect(
    analyticsConfig({ environment: 'unknown', key: 'ingestion-key', developmentEnabled: 'true' })
      .key,
  ).toBeUndefined()
})

test('every environment needs a nonblank ingestion key', () => {
  for (const environment of ['production', 'preview', 'development']) {
    for (const key of [undefined, '', '  ']) {
      expect(analyticsConfig({ environment, key, developmentEnabled: 'true' }).key).toBeUndefined()
    }
  }
})
