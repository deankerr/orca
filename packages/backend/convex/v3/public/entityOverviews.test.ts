import { expect, test } from 'bun:test'

import { ModelMetadata, ProviderMetadata } from './entityOverviews'

test('overview metadata tolerates absent and malformed fields without losing false values', () => {
  expect(ModelMetadata.parse({}).description).toBeNull()
  expect(ModelMetadata.parse({ supports_reasoning: false }).supports_reasoning).toBe(false)
  expect(
    ModelMetadata.parse({ description: ' ', knowledge_cutoff: 123 }).knowledge_cutoff,
  ).toBeNull()
  expect(
    ProviderMetadata.parse({ 'dataPolicy.termsOfServiceURL': 'ftp://example.com' })[
      'dataPolicy.termsOfServiceURL'
    ],
  ).toBeNull()
  expect(
    ProviderMetadata.parse({ 'dataPolicy.privacyPolicyURL': 'https://example.com/privacy' })[
      'dataPolicy.privacyPolicyURL'
    ],
  ).toBe('https://example.com/privacy')
})
