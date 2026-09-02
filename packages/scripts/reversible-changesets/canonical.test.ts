import { expect, test } from 'bun:test'

import type { IJsonAtom } from 'json-diff-ts'

import { ModelEndpointsV1Schema } from '../model-endpoints-v1.ts'
import {
  applyReversibleAtom,
  createReversibleAtom,
  normalizeBundleCollections,
  revertReversibleAtom,
  semanticallyEqual,
} from './canonical.ts'

const ENDPOINT_1 = '00000000-0000-4000-8000-000000000001'
const ENDPOINT_2 = '00000000-0000-4000-8000-000000000002'

test('keys models and endpoints without emitting reorder operations', () => {
  const before = normalizeBundleCollections(
    bundle([
      {
        endpoints: [endpoint(ENDPOINT_2, 2), endpoint(ENDPOINT_1, 1)],
        model_id: 'model/b',
      },
      { endpoints: [], model_id: 'model/a' },
    ]),
  )
  const after = normalizeBundleCollections(
    bundle([
      { endpoints: [], model_id: 'model/a' },
      {
        endpoints: [endpoint(ENDPOINT_1, 3), endpoint(ENDPOINT_2, 2)],
        model_id: 'model/b',
      },
    ]),
  )

  const atom = createReversibleAtom(before, after)

  expect(atom.operations).toEqual([
    {
      oldValue: 1,
      op: 'replace',
      path: `$.data[?(@.model_id=='model/b')].endpoints[?(@.id=='${ENDPOINT_1}')].price`,
      value: 3,
    },
  ])
  const applied = normalizeBundleCollections(
    ModelEndpointsV1Schema.parse(applyReversibleAtom(before, atom)),
  )
  expect(semanticallyEqual(applied, after)).toBe(true)
})

test('keeps nested array order meaningful unless an identity policy says otherwise', () => {
  const before = normalizeBundleCollections(
    bundle([{ endpoints: [endpoint('endpoint-1', 1, ['a', 'b'])], model_id: 'model/a' }]),
  )
  const after = normalizeBundleCollections(
    bundle([{ endpoints: [endpoint('endpoint-1', 1, ['b', 'a'])], model_id: 'model/a' }]),
  )

  expect(createReversibleAtom(before, after).operations.length).toBeGreaterThan(0)
})

test('applies bracket-quoted properties without changing the generated Atom', () => {
  const before = normalizeBundleCollections(
    bundle([
      {
        endpoints: [endpoint('endpoint-1', 1, undefined, { 'openai:prompt_tokens': 'old' })],
        model_id: 'model/a',
      },
    ]),
  )
  const after = normalizeBundleCollections(
    bundle([
      {
        endpoints: [endpoint('endpoint-1', 1, undefined, { 'openai:prompt_tokens': 'new' })],
        model_id: 'model/a',
      },
    ]),
  )

  const atom = createReversibleAtom(before, after)

  expect(atom.operations).toEqual([
    {
      oldValue: 'old',
      op: 'replace',
      path: "$.data[?(@.model_id=='model/a')].endpoints[?(@.id=='endpoint-1')].pricing_json['openai:prompt_tokens']",
      value: 'new',
    },
  ])
  expect(semanticallyEqual(applyReversibleAtom(before, atom), after)).toBe(true)
})

test('reverts a non-root replacement to null', () => {
  const before = { model: { icon: null } }
  const after = { model: { icon: 'icon.png' } }
  const atom = createReversibleAtom(before, after)

  expect(semanticallyEqual(revertReversibleAtom(after, atom), before)).toBe(true)
})

test('replaces a complete endpoint addressed by an id filter', () => {
  const before = { endpoints: [{ id: 'endpoint-1', value: 'old' }] }
  const after = { endpoints: [{ id: 'endpoint-1', value: 'new' }] }
  const atom: IJsonAtom = {
    format: 'json-atom',
    operations: [
      {
        oldValue: before.endpoints[0],
        op: 'replace',
        path: "$.endpoints[?(@.id=='endpoint-1')]",
        value: after.endpoints[0],
      },
    ],
    version: 1,
  }

  expect(semanticallyEqual(applyReversibleAtom(before, atom), after)).toBe(true)
  expect(semanticallyEqual(revertReversibleAtom(after, atom), before)).toBe(true)
})

function bundle(
  data: {
    endpoints: ReturnType<typeof endpoint>[]
    model_id: string
  }[],
) {
  return {
    bundle_format: 'model-endpoints-v1' as const,
    crawl_at: '2026-08-24T00:00:00.000Z',
    crawl_id: 'crawl',
    data: data.map((entry) => ({
      ...entry,
      model: { permaslug: entry.model_id, slug: entry.model_id },
      variant: 'standard',
    })),
  }
}

function endpoint(
  id: string,
  price: number,
  values?: string[],
  pricingJson?: Record<string, string>,
) {
  return {
    id,
    model_variant_slug: 'model/a',
    price,
    ...(values === undefined ? {} : { values }),
    ...(pricingJson === undefined ? {} : { pricing_json: pricingJson }),
  }
}
