import { describe, expect, test } from 'bun:test'

import { ArtifactName, batchIdAt, EndpointsQuery } from '@orca/schema/artifacts.ts'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import * as Keys from '../src/archive/keys.ts'

const decodeQuery = Schema.decodeUnknownSync(EndpointsQuery)
const decodeName = Schema.decodeUnknownSync(ArtifactName)

describe('archive keys', () => {
  test('catalog and batch prefixes are batch-major', () => {
    const batch = Effect.runSync(Effect.map(DateTime.now, batchIdAt))
    expect(Keys.catalogKey(batch)).toBe(`catalog/${batch}.json`)
    expect(Keys.batchPrefix(batch)).toBe(`endpoints/${batch}/`)
    expect(Keys.batchIn(Keys.catalogKey(batch))).toBe(batch)
  })

  test('artifact name folds permaslug slashes; does not parse model dots', () => {
    const batch = Effect.runSync(Effect.map(DateTime.now, batchIdAt))
    const query = decodeQuery({
      batch,
      permaslug: 'openai/gpt-3.5-turbo',
      variant: 'standard',
    })
    const name = Keys.artifactName(query)
    expect(name).toBe(decodeName('openai.gpt-3.5-turbo.standard'))

    const key = Keys.artifactKey(batch, name)
    expect(key).toBe(`endpoints/${batch}/openai.gpt-3.5-turbo.standard.json`)
    expect(Keys.nameIn(key, Keys.batchPrefix(batch))).toBe(name)
  })
})
