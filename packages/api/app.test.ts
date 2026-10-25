import { Endpoint } from '@orca/contract/endpoint'
import { Model } from '@orca/contract/model'
import { Provider } from '@orca/contract/provider'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createApp } from './app'

function endpoint(overrides: {
  id: string
  model: string
  tag: string
  created_at?: string
  context_length?: number
  input?: string
  parameters?: string[]
  unlisted_at?: string
}): Endpoint {
  const [providerId = overrides.tag] = overrides.tag.split('/')
  return {
    context_length: overrides.context_length ?? 131_072,
    data_policy: {
      can_publish: false,
      requires_user_ids: null,
      retains_prompts: false,
      retention_days: null,
      training: false,
    },
    has_chat_completions: true,
    has_completions: false,
    id: overrides.id,
    input_modalities: ['text'],
    is_deranked: false,
    is_disabled: false,
    is_zdr: null,
    label: providerId,
    limit_rpd: null,
    limit_rpm: null,
    max_completion_tokens: null,
    max_prompt_tokens: null,
    max_tokens_per_image: null,
    model: {
      created_at: overrides.created_at ?? '2026-10-01T00:00:00.000Z',
      id: overrides.model,
      name: overrides.model,
      variant: overrides.model.endsWith(':free') ? 'free' : 'standard',
    },
    moderation_required: false,
    output_modalities: ['text'],
    pricing: {
      audio: null,
      audio_output: null,
      discount: 0,
      image: null,
      image_output: null,
      input: overrides.input ?? '0.000001',
      input_audio_cache: null,
      input_cache_read: null,
      input_cache_write: null,
      input_cache_write_1h: null,
      output: '0.000002',
      overrides: null,
      web_search: null,
    },
    provider: { id: providerId, name: providerId, tag: overrides.tag },
    quantization: null,
    stats: { p50_latency_ms: null, p50_throughput_tps: null },
    supported_parameters: overrides.parameters ?? [],
    supports_native_web_search: null,
    supports_reasoning: false,
    unlisted_at: overrides.unlisted_at ?? null,
  }
}

const endpoints = [
  endpoint({
    created_at: '2026-10-10T00:00:00.000Z',
    id: 'a',
    model: 'qwen/qwen4',
    parameters: ['tools'],
    tag: 'deepinfra/fp8',
  }),
  endpoint({
    context_length: 32_768,
    id: 'b',
    input: '0.0000005',
    model: 'qwen/qwen4',
    tag: 'novita',
  }),
  endpoint({ id: 'c', input: '0', model: 'xingchen-agi/xing4.0-29b-a4b:free', tag: 'phala' }),
  endpoint({ id: 'd', model: 'qwen/qwen4', tag: 'gone', unlisted_at: '2026-10-20T00:00:00.000Z' }),
]

function model(overrides: {
  id: string
  created_at: string
  providers: string[]
  reasoning?: boolean
}): Model {
  const [author = overrides.id] = overrides.id.split('/')
  return {
    author: { id: author, name: author },
    created_at: overrides.created_at,
    description: 'A model.',
    hf_slug: null,
    id: overrides.id,
    input_modalities: ['text'],
    knowledge_cutoff: null,
    listed_endpoints: overrides.providers.length,
    name: overrides.id,
    output_modalities: ['text'],
    permaslug: overrides.id,
    provider_ids: overrides.providers,
    reasoning_config: {
      default_reasoning_effort: null,
      is_mandatory_reasoning: null,
      supported_reasoning_efforts: null,
    },
    supports_reasoning: overrides.reasoning ?? false,
    variant: overrides.id.endsWith(':free') ? 'free' : 'standard',
  }
}

const models = [
  model({
    created_at: '2026-10-10T00:00:00.000Z',
    id: 'qwen/qwen4',
    providers: ['deepinfra', 'novita'],
    reasoning: true,
  }),
  model({
    created_at: '2026-10-01T00:00:00.000Z',
    id: 'xingchen-agi/xing4.0-29b-a4b:free',
    providers: ['phala'],
  }),
  model({ created_at: '2026-09-01T00:00:00.000Z', id: 'qwen/qwen3-retired', providers: [] }),
]

function provider(id: string, name: string, listed: number): Provider {
  return {
    byok_enabled: null,
    datacenters: null,
    headquarters: null,
    id,
    listed_endpoints: listed,
    listed_models: listed,
    name,
    privacy_policy_url: null,
    status_page_url: null,
    terms_of_service_url: null,
  }
}

const providers = [
  provider('novita', 'NovitaAI', 1),
  provider('deepinfra', 'DeepInfra', 1),
  provider('phala', 'Phala', 1),
  provider('gone', 'Gone', 0),
]

const app = createApp({
  basePath: '/api/v5-alpha',
  loadCatalog: async () => ({ as_at: '2026-10-23T01:40:41.466Z', endpoints, models, providers }),
})

const Page = z.object({
  as_at: z.string().nullable(),
  data: z.array(z.union([Endpoint, Model, Provider])),
  next: z.string().nullable(),
  total: z.number(),
})
const One = z.object({ data: Endpoint })
const OneModel = z.object({ data: Model })
const Problem = z.object({ title: z.string() })
const Spec = z.object({
  components: z.object({
    schemas: z.record(z.string(), z.looseObject({ properties: z.object({}).loose() })),
  }),
  paths: z.record(z.string(), z.unknown()),
})

async function get<T extends z.ZodType>(path: string, schema: T) {
  const response = await app.request(`http://orca.test/api/v5-alpha${path}`)
  return { body: schema.parse(await response.json()), response }
}

async function status(path: string) {
  const response = await app.request(`http://orca.test/api/v5-alpha${path}`)
  return response.status
}

async function ids(path: string) {
  const { body } = await get(path, Page)
  return body.data.map((item) => item.id)
}

describe('V5 endpoints', () => {
  it('lists listed endpoints in the default order with the ORCA clock', async () => {
    const { body, response } = await get('/endpoints', Page)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('s-maxage')
    expect(body.as_at).toBe('2026-10-23T01:40:41.466Z')
    expect(body.data.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(body.next).toBeNull()
  })

  it('applies bounds, search, and status', async () => {
    expect(await ids('/endpoints?min_context_length=100000')).toEqual(['a', 'c'])
    expect(await ids('/endpoints?max_input_price=0.0000005')).toEqual(['b', 'c'])
    expect(await ids('/endpoints?q=qwen%20novita')).toEqual(['b'])
    expect(await ids('/endpoints?status=unlisted')).toEqual(['d'])
  })

  it('sorts with unknown values last', async () => {
    expect(await ids('/endpoints?sort=input_price&order=asc')).toEqual(['c', 'b', 'a'])
    expect(await ids('/endpoints?sort=throughput')).toEqual(['a', 'b', 'c'])
  })

  it('pages with continuation URLs', async () => {
    const { body } = await get('/endpoints?limit=2', Page)
    expect(body.data.map((item) => item.id)).toEqual(['a', 'b'])
    expect(body.total).toBe(3)
    expect(body.next).toBe('http://orca.test/api/v5-alpha/endpoints?limit=2&offset=2')
  })

  it('reports invalid parameters as problem details', async () => {
    const { body, response } = await get('/endpoints?sort=teleportation', Problem)
    expect(response.status).toBe(400)
    expect(response.headers.get('Content-Type')).toContain('application/problem+json')
    expect(body.title).toBe('Invalid parameters')
  })

  it('gets one endpoint by UUID', async () => {
    const { body } = await get('/endpoints/c', One)
    expect(body.data.model.id).toBe('xingchen-agi/xing4.0-29b-a4b:free')
    expect(await status('/endpoints/missing')).toBe(404)
  })
})

describe('V5 model endpoints', () => {
  it('accepts verbatim model slugs with variant suffixes', async () => {
    expect(await ids('/models/xingchen-agi/xing4.0-29b-a4b:free/endpoints')).toEqual(['c'])
  })

  it('combines the model scope with selection parameters', async () => {
    expect(await ids('/models/qwen/qwen4/endpoints?status=all&provider=deepinfra')).toEqual(['a'])
  })

  it('distinguishes unknown models from empty selections', async () => {
    expect(await status('/models/nobody/nothing/endpoints')).toBe(404)
    const { body, response } = await get('/models/qwen/qwen4/endpoints?provider=phala', Page)
    expect(response.status).toBe(200)
    expect(body.data).toEqual([])
  })
})

describe('V5 models', () => {
  it('lists every known model newest first, with or without listings', async () => {
    expect(await ids('/models')).toEqual([
      'qwen/qwen4',
      'xingchen-agi/xing4.0-29b-a4b:free',
      'qwen/qwen3-retired',
    ])
    expect(await ids('/models?has_listings=true')).toEqual([
      'qwen/qwen4',
      'xingchen-agi/xing4.0-29b-a4b:free',
    ])
    expect(await ids('/models?has_listings=false')).toEqual(['qwen/qwen3-retired'])
  })

  it('filters by author, provider, and search', async () => {
    expect(await ids('/models?author=qwen')).toEqual(['qwen/qwen4', 'qwen/qwen3-retired'])
    expect(await ids('/models?provider=phala')).toEqual(['xingchen-agi/xing4.0-29b-a4b:free'])
    expect(await ids('/models?q=xing')).toEqual(['xingchen-agi/xing4.0-29b-a4b:free'])
  })

  it('sorts by listed endpoints', async () => {
    expect(await ids('/models?sort=endpoints&order=asc')).toEqual([
      'qwen/qwen3-retired',
      'xingchen-agi/xing4.0-29b-a4b:free',
      'qwen/qwen4',
    ])
  })

  it('gets one model by verbatim slug', async () => {
    const { body } = await get('/models/xingchen-agi/xing4.0-29b-a4b:free', OneModel)
    expect(body.data.provider_ids).toEqual(['phala'])
    expect(await status('/models/nobody/nothing')).toBe(404)
  })

  it('knows models without listed endpoints', async () => {
    const { body, response } = await get('/models/qwen/qwen3-retired/endpoints', Page)
    expect(response.status).toBe(200)
    expect(body.total).toBe(0)
  })
})

describe('V5 providers', () => {
  it('lists known providers by name', async () => {
    expect(await ids('/providers')).toEqual(['deepinfra', 'gone', 'novita', 'phala'])
    expect(await ids('/providers?has_listings=true')).toEqual(['deepinfra', 'novita', 'phala'])
    expect(await ids('/providers?q=gone')).toEqual(['gone'])
  })

  it('searches provider names as well as slugs', async () => {
    expect(await ids('/providers?q=novitaai')).toEqual(['novita'])
  })

  it('scopes endpoints to a provider', async () => {
    expect(await ids('/providers/novita/endpoints')).toEqual(['b'])
    expect(await status('/providers/nobody/endpoints')).toBe(404)
    expect(await status('/providers/nobody')).toBe(404)
  })
})

describe('V5 reference', () => {
  it('publishes every route and contract component', async () => {
    const { body } = await get('/openapi.json', Spec)
    expect(Object.keys(body.paths).toSorted()).toEqual([
      '/api/v5-alpha/endpoints',
      '/api/v5-alpha/endpoints/{id}',
      '/api/v5-alpha/models',
      '/api/v5-alpha/models/{author}/{slug}',
      '/api/v5-alpha/models/{author}/{slug}/endpoints',
      '/api/v5-alpha/providers',
      '/api/v5-alpha/providers/{id}',
      '/api/v5-alpha/providers/{id}/endpoints',
    ])
    expect(Object.keys(body.components.schemas).toSorted()).toEqual([
      'Endpoint',
      'Model',
      'Problem',
      'Provider',
    ])
  })
})
