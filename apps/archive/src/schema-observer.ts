import { mkdir } from 'node:fs/promises'

import * as Effect from 'effect/Effect'

import {
  ArchiveError,
  DEFAULT_EXPORT_DIRECTORY,
  DEFAULT_WORK_DIRECTORY,
  attempt,
  readCrawls,
} from './archive.ts'

type JsonRecord = Record<string, unknown>
type JsonType = 'array' | 'boolean' | 'null' | 'number' | 'object' | 'string'
type FieldState = 'absent' | 'partial' | 'universal'

interface LocalField {
  readonly examples: Set<string>
  readonly types: Set<JsonType>
}

interface CrawlField {
  count: number
  readonly examples: Set<string>
  readonly types: Set<JsonType>
}

interface FieldInterval {
  readonly end: string
  readonly start: string
  readonly state: FieldState
  readonly types: readonly JsonType[]
}

interface TrackedField {
  count: number
  readonly examples: Set<string>
  firstSeen: string
  readonly intervals: FieldInterval[]
  lastSeen: string
  readonly types: Set<JsonType>
}

interface Signature {
  count: number
  firstSeen: string
  lastSeen: string
  readonly sampleIds: Set<string>
}

interface EntityTracker {
  crawlsWithData: number
  readonly fields: Map<string, TrackedField>
  objects: number
  readonly signatures: Map<string, Signature>
}

interface SchemaScanOptions {
  readonly exportDirectory?: string
  readonly limit?: number
  readonly outputPath?: string
  readonly progressEvery?: number
}

const MAX_EXAMPLES = 5

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const jsonType = (value: unknown): JsonType | undefined => {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  if (typeof value === 'object') {
    return 'object'
  }
  if (typeof value === 'boolean') {
    return 'boolean'
  }
  if (typeof value === 'number') {
    return 'number'
  }
  return typeof value === 'string' ? 'string' : undefined
}

const example = (value: unknown): string | undefined => {
  if (typeof value === 'object' && value !== null) {
    return undefined
  }
  const encoded = JSON.stringify(value)
  return encoded === undefined || encoded.length > 120 ? undefined : encoded
}

const addCapped = (target: Set<string>, value: string | undefined) => {
  if (value !== undefined && target.size < MAX_EXAMPLES) {
    target.add(value)
  }
}

const observePath = (fields: Map<string, LocalField>, path: string, value: unknown) => {
  const type = jsonType(value)
  if (type === undefined) {
    return
  }

  const field = fields.get(path) ?? { examples: new Set<string>(), types: new Set<JsonType>() }
  field.types.add(type)
  addCapped(field.examples, example(value))
  fields.set(path, field)

  if (Array.isArray(value)) {
    for (const item of value) {
      observePath(fields, `${path}[]`, item)
    }
    return
  }

  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      observePath(fields, path.length === 0 ? key : `${path}.${key}`, child)
    }
  }
}

const observeEntity = (fields: Map<string, CrawlField>, value: JsonRecord) => {
  const local = new Map<string, LocalField>()
  for (const [key, child] of Object.entries(value)) {
    observePath(local, key, child)
  }

  for (const [path, observation] of local) {
    const field = fields.get(path) ?? {
      count: 0,
      examples: new Set<string>(),
      types: new Set<JsonType>(),
    }
    field.count += 1
    for (const type of observation.types) {
      field.types.add(type)
    }
    for (const item of observation.examples) {
      addCapped(field.examples, item)
    }
    fields.set(path, field)
  }
}

const makeTracker = (): EntityTracker => ({
  crawlsWithData: 0,
  fields: new Map(),
  objects: 0,
  signatures: new Map(),
})

const observeSignature = (
  signatures: Map<string, Signature>,
  value: JsonRecord,
  crawlId: string,
  id: string,
) => {
  const key = Object.keys(value).toSorted().join(',')
  const signature = signatures.get(key) ?? {
    count: 0,
    firstSeen: crawlId,
    lastSeen: crawlId,
    sampleIds: new Set<string>(),
  }
  signature.count += 1
  signature.lastSeen = crawlId
  addCapped(signature.sampleIds, id)
  signatures.set(key, signature)
}

const sameTypes = (left: readonly JsonType[], right: readonly JsonType[]) =>
  left.length === right.length && left.every((type, index) => type === right[index])

const finishCrawl = (
  tracker: EntityTracker,
  crawlId: string,
  objects: ReadonlyMap<string, JsonRecord>,
) => {
  if (objects.size === 0) {
    return
  }

  tracker.crawlsWithData += 1
  tracker.objects += objects.size
  const crawlFields = new Map<string, CrawlField>()

  for (const [id, value] of objects) {
    observeEntity(crawlFields, value)
    observeSignature(tracker.signatures, value, crawlId, id)
  }

  const paths = new Set([...tracker.fields.keys(), ...crawlFields.keys()])
  for (const path of paths) {
    const current = crawlFields.get(path)
    let state: FieldState = 'partial'
    if (current === undefined) {
      state = 'absent'
    } else if (current.count === objects.size) {
      state = 'universal'
    }
    const types = [...(current?.types ?? [])].toSorted()
    const tracked = tracker.fields.get(path)

    if (tracked === undefined) {
      if (current === undefined) {
        continue
      }
      tracker.fields.set(path, {
        count: current.count,
        examples: new Set(current.examples),
        firstSeen: crawlId,
        intervals: [{ end: crawlId, start: crawlId, state, types }],
        lastSeen: crawlId,
        types: new Set(current.types),
      })
      continue
    }

    const last = tracked.intervals.at(-1)
    if (last !== undefined && last.state === state && sameTypes(last.types, types)) {
      tracked.intervals[tracked.intervals.length - 1] = { ...last, end: crawlId }
    } else {
      tracked.intervals.push({ end: crawlId, start: crawlId, state, types })
    }

    if (current !== undefined) {
      tracked.count += current.count
      tracked.lastSeen = crawlId
      for (const type of current.types) {
        tracked.types.add(type)
      }
      for (const item of current.examples) {
        addCapped(tracked.examples, item)
      }
    }
  }
}

const isTextOutput = (model: JsonRecord) => {
  const modalities = model.output_modalities
  return Array.isArray(modalities) && modalities.length === 1 && modalities[0] === 'text'
}

const entityId = (value: JsonRecord, key: string) => {
  const id = value[key]
  return typeof id === 'string' ? id : undefined
}

const modelId = (model: JsonRecord): string | undefined => {
  const slug = entityId(model, 'slug')
  if (slug === undefined) {
    return undefined
  }
  const { endpoint } = model
  const variant = isRecord(endpoint) && typeof endpoint.variant === 'string' ? endpoint.variant : ''
  return `${slug}:${variant}`
}

interface ScanCounters {
  failedModelFetches: number
  malformedEntries: number
  textEndpointObservations: number
}

const observeBundle = (modelEntries: readonly unknown[], counters: ScanCounters) => {
  const models = new Map<string, JsonRecord>()
  const endpoints = new Map<string, JsonRecord>()

  for (const entry of modelEntries) {
    if (!isRecord(entry) || !isRecord(entry.model)) {
      counters.malformedEntries += 1
      continue
    }
    if (!Array.isArray(entry.endpoints)) {
      counters.failedModelFetches += 1
      continue
    }

    for (const endpoint of entry.endpoints) {
      if (!isRecord(endpoint) || !isRecord(endpoint.model) || !isTextOutput(endpoint.model)) {
        continue
      }

      const endpointKey = entityId(endpoint, 'id')
      const modelKey = modelId(endpoint.model)
      if (endpointKey === undefined || modelKey === undefined) {
        counters.malformedEntries += 1
        continue
      }

      endpoints.set(endpointKey, endpoint)
      models.set(modelKey, endpoint.model)
      counters.textEndpointObservations += 1
    }
  }

  return { endpoints, models }
}

const decodeBundle = (value: unknown) => {
  if (!isRecord(value) || typeof value.crawl_id !== 'string' || !isRecord(value.data)) {
    throw new ArchiveError('expected a crawl bundle object')
  }
  if (!Array.isArray(value.data.models)) {
    throw new ArchiveError(`crawl ${value.crawl_id} has no model array`)
  }
  return { crawlId: value.crawl_id, modelEntries: value.data.models }
}

const crawlDate = (crawlId: string) => new Date(Number(crawlId)).toISOString()

const serializeTracker = (tracker: EntityTracker) => ({
  crawlsWithData: tracker.crawlsWithData,
  fields: Object.fromEntries(
    [...tracker.fields.entries()]
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([path, field]) => [
        path,
        {
          count: field.count,
          examples: [...field.examples],
          firstSeen: field.firstSeen,
          firstSeenAt: crawlDate(field.firstSeen),
          intervals: field.intervals,
          lastSeen: field.lastSeen,
          lastSeenAt: crawlDate(field.lastSeen),
          types: [...field.types].toSorted(),
        },
      ]),
  ),
  objects: tracker.objects,
  signatures: [...tracker.signatures.entries()]
    .map(([fields, signature]) => ({
      count: signature.count,
      fields: fields.split(','),
      firstSeen: signature.firstSeen,
      firstSeenAt: crawlDate(signature.firstSeen),
      lastSeen: signature.lastSeen,
      lastSeenAt: crawlDate(signature.lastSeen),
      sampleIds: [...signature.sampleIds],
    }))
    .toSorted((left, right) => right.count - left.count),
})

export const scanSchemas = Effect.fn(function* scanSchemas(options: SchemaScanOptions = {}) {
  const exportDirectory = options.exportDirectory ?? DEFAULT_EXPORT_DIRECTORY
  const outputPath =
    options.outputPath ?? `${DEFAULT_WORK_DIRECTORY}/analysis/schema-observations.json`
  const progressEvery = options.progressEvery ?? 250
  const allCrawls = yield* readCrawls(exportDirectory)
  const crawls = options.limit === undefined ? allCrawls : allCrawls.slice(0, options.limit)

  return yield* attempt('scan crawl schemas', async () => {
    const models = makeTracker()
    const endpoints = makeTracker()
    const counters: ScanCounters = {
      failedModelFetches: 0,
      malformedEntries: 0,
      textEndpointObservations: 0,
    }

    for (const [index, crawl] of crawls.entries()) {
      const compressed = await Bun.file(`${exportDirectory}/_storage/${crawl.storage_id}`).bytes()
      const bundle = decodeBundle(JSON.parse(new TextDecoder().decode(Bun.gunzipSync(compressed))))
      const observed = observeBundle(bundle.modelEntries, counters)

      finishCrawl(models, bundle.crawlId, observed.models)
      finishCrawl(endpoints, bundle.crawlId, observed.endpoints)

      if ((index + 1) % progressEvery === 0 || index + 1 === crawls.length) {
        console.log('[schema-scan]', {
          crawl: bundle.crawlId,
          crawls: `${index + 1}/${crawls.length}`,
          endpointFields: endpoints.fields.size,
          modelFields: models.fields.size,
        })
      }
    }

    const report = {
      entities: {
        endpoints: serializeTracker(endpoints),
        models: serializeTracker(models),
      },
      filter: { output_modalities: ['text'] },
      range: {
        crawls: crawls.length,
        end: crawls.at(-1)?.crawl_id ?? null,
        endAt: crawls.at(-1) === undefined ? null : crawlDate(crawls.at(-1)?.crawl_id ?? ''),
        start: crawls[0]?.crawl_id ?? null,
        startAt: crawls[0] === undefined ? null : crawlDate(crawls[0].crawl_id),
      },
      stats: counters,
    }

    await mkdir(outputPath.slice(0, outputPath.lastIndexOf('/')), { recursive: true })
    await Bun.write(outputPath, `${JSON.stringify(report, null, 2)}\n`)
    return { outputPath, report }
  })
})
