import path from 'node:path'

import * as BunRuntime from '@effect/platform-bun/BunRuntime'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as SqlClient from 'effect/unstable/sql/SqlClient'

import { monitorPage } from '../src/product-query/monitor.ts'
import { pricingHistory } from '../src/product-query/pricing.ts'
import type { ProductEvent } from '../src/product-query/types.ts'

const databasePath = path.resolve(
  process.argv[2] ??
    path.join(import.meta.dir, '../../../.labs-work/databases/products-daily.sqlite'),
)
const outputPath = path.resolve(
  process.argv[3] ?? path.join(import.meta.dir, 'products-daily.html'),
)
const manifestPath = path.join(import.meta.dir, '../../../.labs-work/corpora/core-v2/manifest.json')

interface CountRow {
  readonly crawls: number
  readonly endpoints: number
  readonly events: number
  readonly fields: number
  readonly first_crawl: string
  readonly last_crawl: string
  readonly metrics: number
  readonly models: number
}

interface DistributionRow {
  readonly count: number
  readonly entity_type: string
  readonly event_type: string
}

interface FieldRow {
  readonly changes: number
  readonly path: string
}

interface ModelRow {
  readonly endpoints: number
  readonly max_prompt: number
  readonly min_prompt: number
  readonly name: string
  readonly slug: string
}

interface MonthlyRow {
  readonly captures_day: number
  readonly changed_pct: number
  readonly events_day: number
  readonly fields_day: number
  readonly glm_pricing: number
  readonly month: string
  readonly pricing_day: number
}

interface HotspotRow {
  readonly crawl_id: string
  readonly day: string
  readonly events: number
  readonly fields: number
}

interface MetadataRow {
  readonly key: string
  readonly value: string
}

interface EndpointRow {
  readonly completion: number
  readonly context_length: number
  readonly prompt: number
  readonly provider: string
  readonly provider_slug: string
  readonly quantization: string | null
}

interface PlanRow {
  readonly detail: string
}

const ManifestSchema = Schema.Struct({
  codec: Schema.String,
  compressionLevel: Schema.Number,
  counts: Schema.Struct({ accepted: Schema.Number, dropped: Schema.Number }),
  dropReasons: Schema.Record(Schema.String, Schema.Number),
  formatVersion: Schema.Number,
  shards: Schema.Array(Schema.Struct({ compressedBytes: Schema.Number, rawBytes: Schema.Number })),
})
const decodeManifest = Schema.decodeUnknownSync(Schema.fromJsonString(ManifestSchema))

const escapeHtml = (value: unknown) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const jsonForScript = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c')
const compact = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1, notation: 'compact' })
const integer = new Intl.NumberFormat('en-AU')
const usd = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
  style: 'currency',
})
const date = (crawlId: string | number) =>
  new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(new Date(Number(crawlId)))
const dateTime = (crawlId: string | number) =>
  new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    second: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
    year: 'numeric',
  }).format(new Date(Number(crawlId)))
const bytes = (value: number) =>
  value < 1_000_000_000
    ? `${(value / 1_000_000).toFixed(1)} MB`
    : `${(value / 1_000_000_000).toFixed(value < 10_000_000_000 ? 2 : 1)} GB`
const pricePerMillion = (value: number | string) => usd.format(Number(value) * 1_000_000)

const eventTitle = (event: ProductEvent) => {
  const name = event.entityType === 'endpoint' ? event.context.model.name : event.context.name
  const provider =
    event.entityType === 'endpoint' ? event.context.endpoint.provider_display_name : ''
  return provider === '' ? name : `${name} · ${provider}`
}

const fieldValue = (value: unknown, pathName: string) => {
  if (typeof value === 'string' && pathName.startsWith('pricing.')) {
    return `${pricePerMillion(value)} / M`
  }
  if (value === undefined) {
    return 'not present'
  }
  return typeof value === 'string' ? value : JSON.stringify(value)
}

const eventCard = (event: ProductEvent, featured = false) => {
  const fields = event.fields
    .slice(0, featured ? 6 : 3)
    .map(
      (field) => `<div class="diff-row">
        <code>${escapeHtml(field.path)}</code>
        <span class="before">${escapeHtml(fieldValue(field.before, field.path))}</span>
        <span class="arrow" aria-hidden="true">→</span>
        <span class="after">${escapeHtml(fieldValue(field.after, field.path))}</span>
      </div>`,
    )
    .join('')
  let lifecycleDescription = 'The last known endpoint context remains available after removal.'
  if (event.eventType === 'baseline') {
    lifecycleDescription =
      'Present at the lower bound of this projection; no availability transition is implied.'
  } else if (event.eventType === 'available') {
    lifecycleDescription = 'A complete period-valid endpoint context is captured at appearance.'
  }
  const lifecycle =
    event.fields.length === 0 ? `<p class="lifecycle-copy">${lifecycleDescription}</p>` : fields
  return `<article class="event-card ${featured ? 'featured' : ''}">
    <div class="event-head">
      <span class="event-type ${event.eventType}">${escapeHtml(event.eventType)}</span>
      <span class="provider">${escapeHtml(event.providerName ?? event.entityType)}</span>
    </div>
    <h3>${escapeHtml(eventTitle(event))}</h3>
    <p class="slug">${escapeHtml(event.modelSlug)}</p>
    <div class="diffs">${lifecycle}</div>
    <p class="event-id">event <bdi>${escapeHtml(event.eventId.slice(0, 16))}…</bdi></p>
  </article>`
}

const build = Effect.gen(function* buildPresentation() {
  const manifest = yield* Effect.tryPromise(async () =>
    decodeManifest(await Bun.file(manifestPath).text()),
  )
  const sql = yield* SqlClient.SqlClient
  const [counts] = yield* sql<CountRow>`SELECT
    (SELECT COUNT(*) FROM crawls) AS crawls,
    (SELECT COUNT(*) FROM models) AS models,
    (SELECT COUNT(*) FROM endpoints) AS endpoints,
    (SELECT COUNT(*) FROM endpoint_metrics) AS metrics,
    (SELECT COUNT(*) FROM entity_events) AS events,
    (SELECT COUNT(*) FROM event_fields) AS fields,
    (SELECT MIN(crawl_id) FROM crawls) AS first_crawl,
    (SELECT MAX(crawl_id) FROM crawls) AS last_crawl`
  if (counts === undefined) {
    return yield* Effect.fail(new Error('product database is empty'))
  }

  const metadata = new Map(
    (yield* sql<MetadataRow>`SELECT key, value FROM database_metadata`).map((row) => [
      row.key,
      row.value,
    ]),
  )
  const historicalPrecision = metadata.get('historical_precision') ?? 'unknown'
  const databaseName = path.basename(databasePath)

  const distribution = yield* sql<DistributionRow>`SELECT entity_type, event_type, COUNT(*) AS count
    FROM entity_events GROUP BY entity_type, event_type ORDER BY entity_type, event_type`
  const topFields = yield* sql<FieldRow>`SELECT path, COUNT(*) AS changes FROM event_fields
    GROUP BY path ORDER BY changes DESC LIMIT 12`
  const models = yield* sql<ModelRow>`SELECT
      m.slug,
      json_extract(m.state_json, '$.name') AS name,
      COUNT(e.id) AS endpoints,
      MIN(CAST(json_extract(e.state_json, '$.pricing.prompt') AS REAL)) AS min_prompt,
      MAX(CAST(json_extract(e.state_json, '$.pricing.prompt') AS REAL)) AS max_prompt
    FROM models AS m JOIN endpoints AS e ON e.model_slug = m.slug
    GROUP BY m.slug ORDER BY endpoints DESC LIMIT 8`
  const endpoints = yield* sql<EndpointRow>`SELECT
      provider_name AS provider,
      provider_slug,
      json_extract(state_json, '$.quantization') AS quantization,
      json_extract(state_json, '$.context_length') AS context_length,
      CAST(json_extract(state_json, '$.pricing.prompt') AS REAL) AS prompt,
      CAST(json_extract(state_json, '$.pricing.completion') AS REAL) AS completion
    FROM endpoints WHERE model_slug = 'z-ai/glm-5.2'
    ORDER BY prompt LIMIT 8`
  const monthly = yield* sql<MonthlyRow>`WITH
    base AS (
      SELECT crawl_id, strftime('%Y-%m', CAST(crawl_id AS INTEGER) / 1000, 'unixepoch') AS month
      FROM crawls
    ),
    events AS (SELECT crawl_id, COUNT(*) AS events FROM entity_events GROUP BY crawl_id),
    fields AS (
      SELECT e.crawl_id, COUNT(*) AS fields, SUM(f.path LIKE 'pricing.%') AS pricing
      FROM entity_events AS e JOIN event_fields AS f USING(event_id) GROUP BY e.crawl_id
    ),
    glm AS (
      SELECT strftime('%Y-%m', CAST(e.crawl_id AS INTEGER) / 1000, 'unixepoch') AS month,
        COUNT(*) AS pricing
      FROM entity_events AS e JOIN event_fields AS f USING(event_id)
      WHERE e.model_slug = 'z-ai/glm-5.2' AND f.path LIKE 'pricing.%' GROUP BY month
    )
    SELECT base.month,
      ROUND(COUNT(*) * 1.0 / COUNT(DISTINCT date(CAST(base.crawl_id AS INTEGER) / 1000, 'unixepoch')), 1) AS captures_day,
      ROUND(100.0 * SUM(COALESCE(events.events, 0) > 0) / COUNT(*), 1) AS changed_pct,
      ROUND(SUM(COALESCE(events.events, 0)) * 1.0 / COUNT(DISTINCT date(CAST(base.crawl_id AS INTEGER) / 1000, 'unixepoch')), 1) AS events_day,
      ROUND(SUM(COALESCE(fields.fields, 0)) * 1.0 / COUNT(DISTINCT date(CAST(base.crawl_id AS INTEGER) / 1000, 'unixepoch')), 1) AS fields_day,
      ROUND(SUM(COALESCE(fields.pricing, 0)) * 1.0 / COUNT(DISTINCT date(CAST(base.crawl_id AS INTEGER) / 1000, 'unixepoch')), 1) AS pricing_day,
      COALESCE(glm.pricing, 0) AS glm_pricing
    FROM base LEFT JOIN events USING(crawl_id) LEFT JOIN fields USING(crawl_id)
      LEFT JOIN glm USING(month)
    WHERE base.month < '2026-08'
    GROUP BY base.month ORDER BY base.month`
  const hotspots = yield* sql<HotspotRow>`WITH
    events AS (SELECT crawl_id, COUNT(*) AS events FROM entity_events GROUP BY crawl_id),
    fields AS (
      SELECT e.crawl_id, COUNT(*) AS fields
      FROM entity_events AS e JOIN event_fields AS f USING(event_id) GROUP BY e.crawl_id
    )
    SELECT events.crawl_id,
      date(CAST(events.crawl_id AS INTEGER) / 1000, 'unixepoch') AS day,
      events.events, fields.fields
    FROM events JOIN fields USING(crawl_id)
    WHERE day IN ('2025-08-18', '2025-10-23', '2026-01-27', '2026-06-17')
    ORDER BY events.crawl_id`

  const monitorStarted = performance.now()
  const monitor = yield* monitorPage({ before: '1785172230122', limit: 1 })
  const monitorMs = performance.now() - monitorStarted
  const pricingStarted = performance.now()
  const history = yield* pricingHistory('z-ai/glm-5.2')
  const pricingMs = performance.now() - pricingStarted

  const monitorPlan = yield* sql.unsafe<PlanRow>(
    `EXPLAIN QUERY PLAN
    SELECT DISTINCT crawl_id FROM entity_events
    WHERE model_slug = ? AND crawl_id < ? ORDER BY crawl_id DESC LIMIT ?`,
    ['z-ai/glm-5.2', '9999999999999', 10],
  )
  const pricingPlan = yield* sql.unsafe<PlanRow>(
    `EXPLAIN QUERY PLAN
    SELECT e.event_id, e.crawl_id, e.entity_id, e.event_type, f.path
    FROM entity_events AS e
    LEFT JOIN event_fields AS f ON f.event_id = e.event_id
    WHERE e.entity_type = 'endpoint' AND e.model_slug = ?
      AND (e.event_type IN ('baseline', 'available', 'unavailable')
        OR f.path IN ('pricing.prompt', 'pricing.completion', 'pricing.input_cache_read',
          'pricing.input_cache_write', 'pricing.input_cache_write_1h'))
    ORDER BY e.crawl_id, e.entity_id, f.ordinal`,
    ['z-ai/glm-5.2'],
  )

  const rawBytes = manifest.shards.reduce((total, shard) => total + shard.rawBytes, 0)
  const compressedBytes = manifest.shards.reduce((total, shard) => total + shard.compressedBytes, 0)
  const ratio = rawBytes / compressedBytes
  const databaseBytes = Bun.file(databasePath).size
  const [batch] = monitor.batches
  if (batch === undefined) {
    return yield* Effect.fail(new Error('selected Monitor demonstration crawl is missing'))
  }
  const selectedEvents = [
    batch.events.find((event) => event.eventType === 'available'),
    batch.events.find(
      (event) => event.eventType === 'updated' && event.modelSlug === 'openai/gpt-5.6-luna',
    ),
    batch.events.find(
      (event) => event.eventType === 'updated' && event.modelSlug === 'z-ai/glm-5.2',
    ),
    batch.events.find((event) => event.eventType === 'unavailable'),
  ].filter((event): event is ProductEvent => event !== undefined)

  const wantedProviders = new Set(['NovitaAI', 'StreamLake', 'io.net', 'Ambient'])
  const pricingSeries = history.series
    .filter((series) => wantedProviders.has(series.provider.displayName))
    .toSorted((left, right) => right.points.length - left.points.length)
    .slice(0, 5)
    .map((series) => {
      let prompt: number | undefined
      const points = series.points.flatMap((point) => {
        if (point.pricing.prompt === null) {
          prompt = undefined
        } else if (point.pricing.prompt !== undefined) {
          prompt = Number(point.pricing.prompt) * 1_000_000
        }
        return prompt === undefined
          ? []
          : [{ at: point.at, available: point.available, value: prompt }]
      })
      return {
        availableFrom: series.availableFrom,
        endpointId: series.endpointId,
        points,
        provider: series.provider.displayName,
        unavailableAt: series.unavailableAt,
      }
    })

  const maxFieldCount = topFields[0]?.changes ?? 1
  const modelRows = models
    .map(
      (model) => `<tr>
        <td><strong>${escapeHtml(model.name)}</strong><code>${escapeHtml(model.slug)}</code></td>
        <td class="number">${integer.format(model.endpoints)}</td>
        <td class="number">${pricePerMillion(model.min_prompt)}</td>
        <td class="number">${pricePerMillion(model.max_prompt)}</td>
      </tr>`,
    )
    .join('')
  const endpointRows = endpoints
    .map(
      (endpoint) => `<tr>
        <td><strong>${escapeHtml(endpoint.provider)}</strong><code>${escapeHtml(endpoint.provider_slug)}</code></td>
        <td>${escapeHtml(endpoint.quantization ?? 'unknown')}</td>
        <td class="number">${compact.format(endpoint.context_length)}</td>
        <td class="number">${pricePerMillion(endpoint.prompt)}</td>
        <td class="number">${pricePerMillion(endpoint.completion)}</td>
      </tr>`,
    )
    .join('')
  const fieldBars = topFields
    .map(
      (field) => `<li>
        <code>${escapeHtml(field.path)}</code>
        <span class="bar-track"><span style="inline-size:${((field.changes / maxFieldCount) * 100).toFixed(1)}%"></span></span>
        <strong>${integer.format(field.changes)}</strong>
      </li>`,
    )
    .join('')
  const eventCounts = new Map(
    distribution.map((row) => [`${row.entity_type}.${row.event_type}`, row.count]),
  )
  const monitorPlans = monitorPlan.map((row) => row.detail).join('\n')
  const pricingPlans = pricingPlan.map((row) => row.detail).join('\n')
  const rawEvent = selectedEvents.find((event) => event.modelSlug === 'openai/gpt-5.6-luna')
  const hotspotDetails = new Map([
    ['2025-08-18', ['Data policy rewrite', 'A broad canPublish change across the catalog']],
    ['2025-10-23', ['Quantization rewrite', 'A broad endpoint quantization change']],
    ['2026-01-27', ['Pricing shape cleanup', 'Zero-valued optional fields were broadly removed']],
    ['2026-06-17', ['Capability rewrite', 'A broad supported_parameters change']],
  ])
  const hotspotCards = hotspots
    .map((hotspot) => {
      const [title, detail] = hotspotDetails.get(hotspot.day) ?? ['Update burst', '']
      return `<article class="hotspot">
        <time datetime="${new Date(Number(hotspot.crawl_id)).toISOString()}">${escapeHtml(date(hotspot.crawl_id))}</time>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(detail)}</p>
        <span>${integer.format(hotspot.events)} events · ${integer.format(hotspot.fields)} fields</span>
      </article>`
    })
    .join('')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>ORCA Labs · Core v2 walkthrough</title>
  <style>
    :root {
      --paper: #f3efe6;
      --paper-deep: #e8e1d4;
      --ink: #151617;
      --muted: #66645f;
      --faint: #9d978c;
      --line: rgba(21, 22, 23, .14);
      --orange: #ed5a28;
      --green: #187a58;
      --red: #b83b36;
      --blue: #2766c7;
      --panel: rgba(255, 255, 255, .52);
      --serif: Iowan Old Style, Baskerville, Georgia, serif;
      --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: var(--sans);
      font-size: 16px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    ::selection { background: var(--orange); color: white; }
    button, a { -webkit-tap-highlight-color: transparent; }
    a { color: inherit; text-decoration-thickness: from-font; text-underline-offset: .18em; }
    code, pre, .number, .eyebrow, .metric strong { font-family: var(--mono); font-variant-numeric: tabular-nums; }
    code { overflow-wrap: break-word; }
    .shell { display: grid; grid-template-columns: 232px minmax(0, 1fr); }
    .rail {
      position: sticky;
      inset-block-start: 0;
      block-size: 100vh;
      padding: 28px 24px;
      border-inline-end: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: color-mix(in srgb, var(--paper) 88%, transparent);
      backdrop-filter: blur(16px);
      z-index: 5;
    }
    .brand { display: flex; gap: 10px; align-items: center; font-weight: 750; letter-spacing: -.02em; }
    .brand-mark { inline-size: 12px; block-size: 12px; background: var(--orange); border-radius: 50%; box-shadow: 0 0 0 5px rgba(237, 90, 40, .12); }
    .rail nav { display: grid; gap: 4px; margin-block: 42px auto; }
    .rail nav a {
      padding: 8px 10px;
      border-radius: 7px;
      color: var(--muted);
      font-size: 13px;
      text-decoration: none;
      transition-property: color, background-color;
      transition-duration: 120ms;
    }
    .rail nav a:hover, .rail nav a.active { color: var(--ink); background: rgba(255,255,255,.66); }
    .rail-meta { color: var(--muted); font: 11px/1.6 var(--mono); }
    main { min-inline-size: 0; }
    section {
      min-block-size: 92vh;
      padding: clamp(56px, 8vw, 112px) clamp(28px, 7vw, 104px);
      border-block-end: 1px solid var(--line);
      display: grid;
      align-content: center;
    }
    .wrap { inline-size: min(1180px, 100%); margin-inline: auto; }
    .eyebrow {
      margin: 0 0 20px;
      color: var(--orange);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    h1, h2, h3, p { margin-block-start: 0; }
    h1, h2 { font-family: var(--serif); font-weight: 500; letter-spacing: -.045em; text-wrap: balance; }
    h1 { max-inline-size: 950px; margin-block-end: 26px; font-size: clamp(54px, 8vw, 116px); line-height: .9; }
    h2 { max-inline-size: 900px; margin-block-end: 20px; font-size: clamp(40px, 5vw, 72px); line-height: 1; }
    h3 { letter-spacing: -.02em; }
    .lede { max-inline-size: 66ch; color: var(--muted); font-size: clamp(18px, 2vw, 23px); line-height: 1.5; text-wrap: pretty; }
    .hero-note { margin-block-start: 48px; padding-inline-start: 18px; border-inline-start: 3px solid var(--orange); max-inline-size: 52ch; color: var(--muted); }
    .hero-note strong { color: var(--ink); }
    .metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-block-start: 60px; }
    .metric { padding: 22px; background: var(--panel); border-radius: 12px; box-shadow: 0 1px 0 rgba(255,255,255,.8) inset, 0 12px 36px rgba(50,40,25,.04); }
    .metric strong { display: block; margin-block-end: 8px; font-size: clamp(26px, 3vw, 42px); line-height: 1; letter-spacing: -.05em; }
    .metric span { color: var(--muted); font-size: 13px; }
    .pipeline { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); align-items: stretch; gap: 28px; margin-block-start: 56px; }
    .stage { position: relative; padding: 24px; background: var(--panel); border-radius: 12px; }
    .stage:not(:last-child)::after { content: '→'; position: absolute; inset-inline-end: -21px; inset-block-start: 50%; color: var(--faint); transform: translateY(-50%); }
    .stage .step { color: var(--orange); font: 11px var(--mono); }
    .stage h3 { margin: 24px 0 8px; font-size: 18px; }
    .stage p { margin: 0; color: var(--muted); font-size: 13px; }
    .storage { display: grid; grid-template-columns: 1.2fr .8fr; gap: 52px; align-items: end; margin-block-start: 64px; }
    .storage-bars { display: grid; gap: 18px; }
    .storage-bar { display: grid; grid-template-columns: 125px 1fr 90px; gap: 12px; align-items: center; }
    .storage-bar span { color: var(--muted); font-size: 13px; }
    .storage-bar b { display: block; block-size: 28px; min-inline-size: 3px; border-radius: 4px; background: var(--ink); }
    .storage-bar:nth-child(2) b { background: var(--orange); }
    .storage-bar:nth-child(3) b { background: var(--green); }
    .storage-bar strong { text-align: end; font: 13px var(--mono); }
    .callout { padding: 28px; background: var(--ink); color: var(--paper); border-radius: 14px; }
    .callout strong { display: block; margin-block-end: 12px; color: #ff8158; font: 42px/1 var(--mono); letter-spacing: -.06em; }
    .callout p { margin: 0; color: #bbb7af; font-size: 14px; }
    .analysis-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-block: 38px 18px; }
    .analysis-metrics div { padding: 18px; border-radius: 10px; background: rgba(255,255,255,.58); }
    .analysis-metrics strong { display: block; font: 25px/1 var(--mono); letter-spacing: -.05em; }
    .analysis-metrics span { color: var(--muted); font-size: 11px; }
    .timeline-shell { padding: 22px; border-radius: 14px; background: #17191b; color: #f2eee6; box-shadow: 0 24px 70px rgba(20,20,20,.12); }
    .timeline-head { display: flex; justify-content: space-between; gap: 20px; align-items: start; margin-block-end: 20px; }
    .timeline-head h3 { margin: 0 0 4px; font-size: 17px; }
    .timeline-head p { margin: 0; color: #9c9c98; font-size: 12px; }
    .timeline-legend { display: flex; flex-wrap: wrap; justify-content: end; gap: 12px; color: #aaa9a3; font-size: 11px; }
    .timeline-legend span { display: flex; gap: 6px; align-items: center; }
    .timeline-legend i { inline-size: 8px; block-size: 8px; border-radius: 2px; }
    .timeline-shell svg { display: block; inline-size: 100%; block-size: auto; }
    #cadence-chart { margin-block-end: 12px; padding-block-end: 12px; border-block-end: 1px solid rgba(255,255,255,.1); }
    .hotspot-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-block-start: 18px; }
    .hotspot { padding: 18px; border-radius: 10px; background: rgba(255,255,255,.58); }
    .hotspot time { display: block; color: var(--orange); font: 10px var(--mono); }
    .hotspot strong { display: block; margin-block: 22px 6px; font-size: 14px; }
    .hotspot p { min-block-size: 40px; margin: 0 0 18px; color: var(--muted); font-size: 12px; }
    .hotspot span { color: var(--faint); font: 10px var(--mono); }
    .finding { margin-block-start: 18px; padding: 22px; border-radius: 10px; background: rgba(237,90,40,.09); color: var(--muted); font-size: 14px; }
    .finding strong { color: var(--ink); }
    .tabs { display: flex; gap: 6px; margin-block: 34px 22px; }
    .tab {
      appearance: none; border: 0; padding: 9px 13px; border-radius: 7px; background: transparent; color: var(--muted); cursor: pointer; font: 600 13px var(--sans);
      transition-property: color, background-color, scale; transition-duration: 120ms;
    }
    .tab:hover, .tab[aria-selected="true"] { background: white; color: var(--ink); }
    .tab:active { scale: .96; }
    .tab-panel[hidden] { display: none; }
    .table-shell { overflow-x: auto; border-radius: 14px; background: rgba(255,255,255,.58); box-shadow: 0 18px 60px rgba(50,40,25,.05); }
    table { inline-size: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 15px 18px; text-align: start; border-block-end: 1px solid var(--line); white-space: nowrap; }
    th { color: var(--muted); font-size: 11px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; }
    tr:last-child td { border-block-end: 0; }
    td strong, td code { display: block; }
    td code { max-inline-size: 420px; color: var(--muted); font-size: 11px; white-space: normal; }
    td.number, th.number { text-align: end; }
    .batch-head { display: flex; justify-content: space-between; gap: 24px; align-items: end; margin-block: 38px 22px; }
    .batch-head h3 { margin: 0; font: 24px var(--mono); letter-spacing: -.04em; }
    .batch-head p { margin: 0; color: var(--muted); font-size: 13px; }
    .event-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
    .event-card { min-inline-size: 0; padding: 20px; border-radius: 12px; background: rgba(255,255,255,.58); box-shadow: 0 10px 35px rgba(50,40,25,.04); }
    .event-card.featured { background: white; }
    .event-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .event-type { padding: 4px 7px; border-radius: 4px; font: 700 10px var(--mono); letter-spacing: .06em; text-transform: uppercase; }
    .event-type.available { color: var(--green); background: rgba(24,122,88,.1); }
    .event-type.baseline { color: var(--muted); background: rgba(102,100,95,.1); }
    .event-type.updated { color: var(--blue); background: rgba(39,102,199,.1); }
    .event-type.unavailable { color: var(--red); background: rgba(184,59,54,.1); }
    .provider { color: var(--muted); font-size: 12px; }
    .event-card h3 { margin: 20px 0 3px; font-size: 16px; }
    .slug { margin-block-end: 20px; color: var(--muted); font: 11px var(--mono); overflow-wrap: break-word; }
    .diffs { display: grid; gap: 8px; }
    .diff-row { display: grid; grid-template-columns: minmax(120px,1fr) minmax(95px,.8fr) 14px minmax(95px,.8fr); gap: 8px; align-items: center; font-size: 11px; }
    .diff-row code { color: var(--muted); }
    .diff-row .before { color: var(--red); text-decoration: line-through; text-decoration-color: rgba(184,59,54,.4); }
    .diff-row .after { color: var(--green); }
    .diff-row .arrow { color: var(--faint); }
    .lifecycle-copy { margin: 0; color: var(--muted); font-size: 13px; }
    .event-id { margin: 18px 0 0; color: var(--faint); font: 10px var(--mono); }
    .chart-shell { margin-block-start: 38px; padding: 22px; border-radius: 14px; background: #17191b; color: #f2eee6; box-shadow: 0 24px 70px rgba(20,20,20,.12); }
    .chart-head { display: flex; justify-content: space-between; gap: 20px; align-items: start; margin-block-end: 14px; }
    .chart-head h3 { margin: 0 0 4px; font-size: 17px; }
    .chart-head p { margin: 0; color: #9c9c98; font-size: 12px; }
    .chart-legend { display: flex; flex-wrap: wrap; justify-content: end; gap: 12px; font-size: 11px; }
    .chart-legend span { display: flex; align-items: center; gap: 6px; }
    .chart-legend i { inline-size: 8px; block-size: 8px; border-radius: 50%; }
    #pricing-chart { display: block; inline-size: 100%; block-size: auto; overflow: visible; }
    .chart-grid { stroke: rgba(255,255,255,.1); stroke-width: 1; }
    .chart-label { fill: #8c8d88; font: 10px var(--mono); }
    .chart-line { fill: none; stroke-width: 1.8; vector-effect: non-scaling-stroke; }
    .chart-caption { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; margin-block-start: 16px; padding-block-start: 16px; border-block-start: 1px solid rgba(255,255,255,.1); }
    .chart-caption strong { display: block; font: 20px var(--mono); }
    .chart-caption span { color: #8c8d88; font-size: 11px; }
    .split { display: grid; grid-template-columns: minmax(0,1fr) minmax(320px,.72fr); gap: 52px; align-items: start; margin-block-start: 48px; }
    .bars { display: grid; gap: 11px; margin: 0; padding: 0; list-style: none; }
    .bars li { display: grid; grid-template-columns: minmax(170px,.8fr) minmax(120px,1fr) 55px; gap: 12px; align-items: center; }
    .bars code { color: var(--muted); font-size: 11px; }
    .bar-track { block-size: 8px; border-radius: 9px; background: rgba(21,22,23,.08); overflow: hidden; }
    .bar-track span { display: block; block-size: 100%; border-radius: inherit; background: var(--orange); }
    .bars strong { text-align: end; font: 11px var(--mono); }
    .event-matrix { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
    .event-matrix div { padding: 16px; border-radius: 9px; background: rgba(255,255,255,.58); }
    .event-matrix strong { display: block; font: 24px var(--mono); }
    .event-matrix span { color: var(--muted); font-size: 11px; }
    .code-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; margin-block-start: 42px; }
    .code-card { min-inline-size: 0; overflow: hidden; border-radius: 12px; background: #17191b; color: #f0ece3; }
    .code-card header { display: flex; justify-content: space-between; padding: 12px 16px; border-block-end: 1px solid rgba(255,255,255,.1); color: #aaa9a3; font-size: 11px; }
    pre { margin: 0; padding: 18px; overflow: auto; color: #d7d5ce; font: 11px/1.65 var(--mono); tab-size: 2; }
    .plan { color: #83c9a9; }
    .raw { max-block-size: 330px; }
    .takeaways { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-block-start: 52px; counter-reset: takeaway; }
    .takeaway { min-block-size: 240px; padding: 24px; background: var(--panel); border-radius: 12px; counter-increment: takeaway; }
    .takeaway::before { content: '0' counter(takeaway); display: block; margin-block-end: 48px; color: var(--orange); font: 12px var(--mono); }
    .takeaway h3 { margin-block-end: 10px; font-size: 18px; }
    .takeaway p { margin: 0; color: var(--muted); font-size: 14px; }
    .footer-line { display: flex; justify-content: space-between; gap: 24px; margin-block-start: 54px; padding-block-start: 20px; border-block-start: 1px solid var(--line); color: var(--muted); font: 11px var(--mono); }
    :focus-visible { outline: 3px solid var(--orange); outline-offset: 3px; }
    @media (max-width: 920px) {
      .shell { display: block; }
      .rail { position: sticky; block-size: auto; padding: 14px 18px; flex-direction: row; align-items: center; border-inline-end: 0; border-block-end: 1px solid var(--line); }
      .rail nav { display: none; }
      .rail-meta { text-align: end; }
      section { min-block-size: auto; padding-block: 72px; }
      .metric-grid, .pipeline, .analysis-metrics, .hotspot-grid { grid-template-columns: repeat(2,1fr); }
      .stage:nth-child(2)::after { display: none; }
      .storage, .split, .code-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 620px) {
      h1 { font-size: 54px; }
      .metric-grid, .pipeline, .event-grid, .takeaways, .analysis-metrics, .hotspot-grid { grid-template-columns: 1fr; }
      .stage::after { display: none; }
      .storage-bar { grid-template-columns: 95px 1fr 75px; }
      .batch-head, .chart-head { align-items: start; flex-direction: column; }
      .chart-legend { justify-content: start; }
      .chart-caption { grid-template-columns: 1fr; }
      .diff-row { grid-template-columns: 1fr 14px 1fr; }
      .diff-row code { grid-column: 1 / -1; }
      .bars li { grid-template-columns: 1fr 45px; }
      .bars .bar-track { grid-row: 2; grid-column: 1 / -1; }
    }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
    @media print {
      .shell { display: block; }
      .rail { display: none; }
      section { min-block-size: 0; break-before: page; padding: 48px 32px; }
      section:first-child { break-before: auto; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="rail">
      <div class="brand"><span class="brand-mark"></span> ORCA Labs</div>
      <nav aria-label="Presentation sections">
        <a href="#opening">Core v2</a>
        <a href="#pipeline">Artifact pipeline</a>
        <a href="#timeline">Change over time</a>
        <a href="#catalog">Current view</a>
        <a href="#monitor">Monitor</a>
        <a href="#pricing">Pricing history</a>
        <a href="#evidence">Evidence profile</a>
        <a href="#queries">Query anatomy</a>
        <a href="#next">What this proves</a>
      </nav>
      <div class="rail-meta">Static build<br>${escapeHtml(new Date().toISOString().slice(0, 10))}</div>
    </aside>
    <main>
      <section id="opening">
        <div class="wrap">
          <p class="eyebrow">Core v2 · ${escapeHtml(historicalPrecision)} product projection</p>
          <h1>One year of model-market evidence, locally queryable.</h1>
          <p class="lede">The raw production snapshot is now a reproducible corpus and a ${bytes(databaseBytes)} product database. Current views, immutable Monitor events, and forward pricing periods all come from the same replay.</p>
          <p class="hero-note"><strong>This is real output, not a mock dataset.</strong> Every number, event, provider, and price in this walkthrough was read from <code>${escapeHtml(databaseName)}</code>, built with <code>${escapeHtml(historicalPrecision)}</code> historical precision.</p>
          <div class="metric-grid">
            <div class="metric"><strong>${integer.format(counts.crawls)}</strong><span>selected crawls</span></div>
            <div class="metric"><strong>${integer.format(counts.events)}</strong><span>immutable entity events</span></div>
            <div class="metric"><strong>${integer.format(counts.fields)}</strong><span>field-level changes</span></div>
            <div class="metric"><strong>${bytes(databaseBytes)}</strong><span>SQLite executable spec</span></div>
          </div>
        </div>
      </section>

      <section id="pipeline">
        <div class="wrap">
          <p class="eyebrow">01 · artifact pipeline</p>
          <h2>Rebuild everything. Re-run only what matters.</h2>
          <p class="lede">The expensive Convex shape is removed once. Stable outer contracts let analysis and product projections consume a compact chronological stream.</p>
          <div class="pipeline">
            <div class="stage"><span class="step">01 / immutable</span><h3>Snapshot ZIP</h3><p>Convex export metadata and nested crawl blobs stay untouched.</p></div>
            <div class="stage"><span class="step">02 / clean</span><h3>Corpus v2</h3><p>Text endpoints only. Embedded model copies deduplicated by slug.</p></div>
            <div class="stage"><span class="step">03 / replay</span><h3>Effect SQL</h3><p>Selected crawls commit current state and events atomically; precision is a rebuild policy.</p></div>
            <div class="stage"><span class="step">04 / consume</span><h3>Product queries</h3><p>Monitor and pricing adapters hide the physical table layout.</p></div>
          </div>
          <div class="storage">
            <div class="storage-bars" aria-label="Artifact storage comparison">
              <div class="storage-bar"><span>Decoded JSON</span><b style="inline-size:100%"></b><strong>${bytes(rawBytes)}</strong></div>
              <div class="storage-bar"><span>Zstd corpus</span><b style="inline-size:${((compressedBytes / rawBytes) * 100).toFixed(1)}%"></b><strong>${bytes(compressedBytes)}</strong></div>
              <div class="storage-bar"><span>Product DB</span><b style="inline-size:${Math.max(0.4, (databaseBytes / rawBytes) * 100).toFixed(2)}%"></b><strong>${bytes(databaseBytes)}</strong></div>
            </div>
            <aside class="callout"><strong>${ratio.toFixed(1)}×</strong><p>corpus compression at Zstandard level ${manifest.compressionLevel}; ${manifest.shards.length} sequential shards replace ${integer.format(counts.crawls)} individually compressed crawl files.</p></aside>
          </div>
        </div>
      </section>

      <section id="timeline">
        <div class="wrap">
          <p class="eyebrow">02 · temporal analysis</p>
          <h2>Daily roll-up preserves product history without false precision.</h2>
          <p class="lede">The source corpus moved from hourly to 20-minute capture during the year. This projection keeps the final accepted crawl per UTC day, while field-level evidence still distinguishes market movement from upstream reporting rewrites.</p>
          <div class="analysis-metrics">
            <div><strong>20.0 min</strong><span>source-corpus median interval</span></div>
            <div><strong>${integer.format(counts.crawls)}</strong><span>daily product samples selected</span></div>
            <div><strong>${escapeHtml(historicalPrecision)}</strong><span>recorded projection precision</span></div>
            <div><strong>80.7%</strong><span>July pricing fields from GLM 5.2</span></div>
          </div>
          <div class="timeline-shell">
            <div class="timeline-head"><div><h3>Selected samples and evidence rate</h3><p>Complete months · UTC · normalized per active day</p></div><div class="timeline-legend"><span><i style="background:#72c7a5"></i>samples/day</span><span><i style="background:#f0c55b"></i>changed samples</span><span><i style="background:#ff7650"></i>events/day</span><span><i style="background:#7da7ef"></i>pricing fields/day</span></div></div>
            <svg id="cadence-chart" viewBox="0 0 1000 170" role="img" aria-label="Monthly capture rate and percentage of changed crawls"></svg>
            <svg id="activity-chart" viewBox="0 0 1000 300" role="img" aria-label="Monthly entity events and pricing field changes per day"></svg>
          </div>
          <div class="hotspot-grid">${hotspotCards}</div>
          <p class="finding"><strong>July is a real workload hotspot, but a concentrated one.</strong> GLM 5.2 contributes 1,533 of 2,924 events and 5,671 of 7,024 pricing-field changes. Novita and StreamLake account for most of those tiny, frequent price movements. By contrast, the four bursts above are broad same-field rewrites that Monitor should group or annotate at read time.</p>
        </div>
      </section>

      <section id="catalog">
        <div class="wrap">
          <p class="eyebrow">03 · current projection</p>
          <h2>The easy query is useful too.</h2>
          <p class="lede">The terminal replay state is already shaped for a dense Grid or API response: ${integer.format(counts.models)} models, ${integer.format(counts.endpoints)} endpoints, and ${integer.format(counts.metrics)} latest metric observations.</p>
          <div class="tabs" role="tablist" aria-label="Current catalog examples">
            <button class="tab" role="tab" aria-selected="true" aria-controls="models-panel" id="models-tab">Largest model markets</button>
            <button class="tab" role="tab" aria-selected="false" aria-controls="endpoints-panel" id="endpoints-tab">GLM 5.2 endpoints</button>
          </div>
          <div class="tab-panel" role="tabpanel" id="models-panel" aria-labelledby="models-tab">
            <div class="table-shell"><table><thead><tr><th>Model</th><th class="number">Endpoints</th><th class="number">Min prompt / M</th><th class="number">Max prompt / M</th></tr></thead><tbody>${modelRows}</tbody></table></div>
          </div>
          <div class="tab-panel" role="tabpanel" id="endpoints-panel" aria-labelledby="endpoints-tab" hidden>
            <div class="table-shell"><table><thead><tr><th>Provider</th><th>Quant.</th><th class="number">Context</th><th class="number">Prompt / M</th><th class="number">Completion / M</th></tr></thead><tbody>${endpointRows}</tbody></table></div>
          </div>
        </div>
      </section>

      <section id="monitor">
        <div class="wrap">
          <p class="eyebrow">04 · product query / Monitor</p>
          <h2>A crawl becomes a coherent market moment.</h2>
          <p class="lede">Feed pagination discovers changed crawl IDs first, then loads each complete batch. Context is period-valid: an unavailable endpoint still carries its last known model and provider identity.</p>
          <div class="batch-head"><div><h3>${escapeHtml(batch.crawlId)}</h3><p>${escapeHtml(dateTime(batch.crawlId))}</p></div><p>${batch.events.length} events · ${batch.events.reduce((total, event) => total + event.fields.length, 0)} field changes · query ${monitorMs.toFixed(1)} ms</p></div>
          <div class="event-grid">${selectedEvents.map((event, index) => eventCard(event, index === 1)).join('')}</div>
        </div>
      </section>

      <section id="pricing">
        <div class="wrap">
          <p class="eyebrow">05 · product query / Pricing History</p>
          <h2>Sparse events become explicit price periods.</h2>
          <p class="lede">The adapter folds opted-in pricing fields forward per endpoint. Unavailability closes a period; reappearance begins from a fresh complete context, with no price leakage across the gap.</p>
          <div class="chart-shell">
            <div class="chart-head"><div><h3>Z.ai: GLM 5.2 · prompt</h3><p>USD per million tokens · selected provider periods</p></div><div class="chart-legend" id="chart-legend"></div></div>
            <svg id="pricing-chart" viewBox="0 0 1000 390" role="img" aria-label="GLM 5.2 prompt price history for selected providers"></svg>
            <div class="chart-caption">
              <div><strong>${integer.format(history.series.length)}</strong><span>availability periods</span></div>
              <div><strong>${integer.format(history.series.reduce((total, series) => total + series.points.length, 0))}</strong><span>pricing and lifecycle points</span></div>
              <div><strong>${pricingMs.toFixed(1)} ms</strong><span>decode and forward fold</span></div>
            </div>
          </div>
        </div>
      </section>

      <section id="evidence">
        <div class="wrap">
          <p class="eyebrow">06 · evidence profile</p>
          <h2>Pricing dominates—but the event contract stays general.</h2>
          <p class="lede">Raw field paths remain durable evidence. Presentation can suppress, label, group, or render set differences without narrowing what the history knows.</p>
          <div class="split">
            <ol class="bars">${fieldBars}</ol>
            <div>
              <p class="eyebrow">Event lifecycle</p>
              <div class="event-matrix">
                <div><strong>${integer.format(eventCounts.get('endpoint.available') ?? 0)}</strong><span>endpoint available</span></div>
                <div><strong>${integer.format(eventCounts.get('endpoint.updated') ?? 0)}</strong><span>endpoint updated</span></div>
                <div><strong>${integer.format(eventCounts.get('endpoint.unavailable') ?? 0)}</strong><span>endpoint unavailable</span></div>
                <div><strong>${integer.format(eventCounts.get('model.available') ?? 0)}</strong><span>model available</span></div>
                <div><strong>${integer.format(eventCounts.get('model.updated') ?? 0)}</strong><span>model updated</span></div>
                <div><strong>${integer.format(eventCounts.get('model.unavailable') ?? 0)}</strong><span>model unavailable</span></div>
              </div>
              <p class="hero-note"><strong>${integer.format(manifest.counts.dropped)} crawls were rejected before replay.</strong> ${integer.format(manifest.dropReasons['failed-text-endpoint-scope'] ?? 0)} had explicit text endpoint fetch failures; ${integer.format(manifest.dropReasons['empty-catalog'] ?? 0)} had empty catalogs.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="queries">
        <div class="wrap">
          <p class="eyebrow">07 · query anatomy</p>
          <h2>Product contracts above, boring indexes below.</h2>
          <p class="lede">Effect SQL supplies the portable read boundary. SQLite remains visible as the executable specification: parameterized discovery, indexed joins, canonical JSON decoding, and TypeScript grouping.</p>
          <div class="code-grid">
            <article class="code-card"><header><span>Monitor · crawl discovery</span><span>${monitorMs.toFixed(1)} ms assembled</span></header><pre>SELECT DISTINCT crawl_id
FROM entity_events
WHERE model_slug = ? AND crawl_id &lt; ?
ORDER BY crawl_id DESC
LIMIT ?;

<span class="plan">${escapeHtml(monitorPlans)}</span></pre></article>
            <article class="code-card"><header><span>Pricing · forward event read</span><span>${pricingMs.toFixed(1)} ms folded</span></header><pre>SELECT e.*, f.*
FROM entity_events AS e
LEFT JOIN event_fields AS f
  ON f.event_id = e.event_id
WHERE e.entity_type = 'endpoint'
  AND e.model_slug = ?
  AND (lifecycle OR tracked_price_path)
ORDER BY e.crawl_id, e.entity_id, f.ordinal;

<span class="plan">${escapeHtml(pricingPlans)}</span></pre></article>
            <article class="code-card"><header><span>Decoded event · selected example</span><span>period-valid context</span></header><pre class="raw">${escapeHtml(JSON.stringify(rawEvent, null, 2))}</pre></article>
            <article class="code-card"><header><span>Physical store</span><span>${bytes(databaseBytes)}</span></header><pre>crawls
models                 ← latest state
endpoints              ← latest state
endpoint_metrics       ← latest observation
entity_events          ← immutable grouping
event_fields           ← ordered before / after

events_by_crawl
events_by_model_crawl
events_by_provider_crawl
event_fields_by_path</pre></article>
          </div>
        </div>
      </section>

      <section id="next">
        <div class="wrap">
          <p class="eyebrow">08 · what this proves</p>
          <h2>The pipeline is no longer the product boundary.</h2>
          <p class="lede">Historical replay and eventual active capture can share transformations and event semantics while each product receives a deliberately shaped query.</p>
          <div class="takeaways">
            <article class="takeaway"><h3>Artifacts are disposable downstream.</h3><p>The snapshot remains authoritative. Corpus and database formats can be rebuilt, benchmarked, or replaced independently.</p></article>
            <article class="takeaway"><h3>History is context-correct.</h3><p>Monitor and Alerts can describe what was known at that crawl, instead of enriching old events from today’s catalog.</p></article>
            <article class="takeaway"><h3>Projections can specialize.</h3><p>If forward pricing folds become expensive remotely, materialize pricing points without changing immutable event generation.</p></article>
          </div>
          <div class="footer-line"><span>${date(counts.first_crawl)} → ${date(counts.last_crawl)}</span><span>generated from ${escapeHtml(path.basename(databasePath))}</span></div>
        </div>
      </section>
    </main>
  </div>
  <script type="application/json" id="pricing-data">${jsonForScript(pricingSeries)}</script>
  <script type="application/json" id="monthly-data">${jsonForScript(monthly)}</script>
  <script>
    const tabs = [...document.querySelectorAll('[role="tab"]')]
    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        for (const item of tabs) {
          const selected = item === tab
          item.setAttribute('aria-selected', String(selected))
          document.getElementById(item.getAttribute('aria-controls')).hidden = !selected
        }
      })
    }

    const links = [...document.querySelectorAll('.rail nav a')]
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        for (const link of links) link.classList.toggle('active', link.hash === '#' + entry.target.id)
      }
    }, { rootMargin: '-35% 0px -60% 0px' })
    for (const section of document.querySelectorAll('main section')) observer.observe(section)

    const series = JSON.parse(document.getElementById('pricing-data').textContent)
    const colors = ['#ff7650', '#72c7a5', '#f0c55b', '#7da7ef', '#c794db']
    const svg = document.getElementById('pricing-chart')
    const legend = document.getElementById('chart-legend')
    const all = series.flatMap(item => item.points)
    const minX = Math.min(...all.map(point => point.at))
    const maxX = Math.max(...all.map(point => point.at))
    const minY = Math.min(...all.map(point => point.value))
    const maxY = Math.max(...all.map(point => point.value))
    const box = { x: 74, y: 22, width: 898, height: 316 }
    const x = value => box.x + ((value - minX) / (maxX - minX || 1)) * box.width
    const y = value => box.y + box.height - ((value - minY) / (maxY - minY || 1)) * box.height
    const ns = 'http://www.w3.org/2000/svg'
    const node = (name, attrs, text) => {
      const element = document.createElementNS(ns, name)
      for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value)
      if (text !== undefined) element.textContent = text
      svg.append(element)
      return element
    }
    for (let step = 0; step <= 4; step++) {
      const yy = box.y + box.height * (step / 4)
      node('line', { class: 'chart-grid', x1: box.x, x2: box.x + box.width, y1: yy, y2: yy })
      const value = maxY - (maxY - minY) * (step / 4)
      node('text', { class: 'chart-label', x: box.x - 10, y: yy + 4, 'text-anchor': 'end' }, '$' + value.toFixed(2))
    }
    for (let step = 0; step <= 4; step++) {
      const xx = box.x + box.width * (step / 4)
      const timestamp = minX + (maxX - minX) * (step / 4)
      node('text', { class: 'chart-label', x: xx, y: box.y + box.height + 28, 'text-anchor': step === 0 ? 'start' : step === 4 ? 'end' : 'middle' }, new Date(timestamp).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }))
    }
    series.forEach((item, index) => {
      const color = colors[index % colors.length]
      const points = item.points.map(point => x(point.at).toFixed(2) + ',' + y(point.value).toFixed(2)).join(' ')
      node('polyline', { class: 'chart-line', points, stroke: color })
      const marker = document.createElement('span')
      marker.innerHTML = '<i style="background:' + color + '"></i>' + item.provider
      legend.append(marker)
    })

    const months = JSON.parse(document.getElementById('monthly-data').textContent)
    const cadenceSvg = document.getElementById('cadence-chart')
    const activitySvg = document.getElementById('activity-chart')
    const add = (target, name, attrs, text) => {
      const element = document.createElementNS(ns, name)
      for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value)
      if (text !== undefined) element.textContent = text
      target.append(element)
      return element
    }
    const cadenceBox = { x: 55, y: 12, width: 917, height: 112 }
    const monthX = index => cadenceBox.x + cadenceBox.width * ((index + .5) / months.length)
    for (const value of [0, 50, 100]) {
      const yy = cadenceBox.y + cadenceBox.height - cadenceBox.height * (value / 100)
      add(cadenceSvg, 'line', { class: 'chart-grid', x1: cadenceBox.x, x2: cadenceBox.x + cadenceBox.width, y1: yy, y2: yy })
      add(cadenceSvg, 'text', { class: 'chart-label', x: cadenceBox.x - 10, y: yy + 4, 'text-anchor': 'end' }, value)
    }
    const cadencePoints = months.map((month, index) => monthX(index) + ',' + (cadenceBox.y + cadenceBox.height - cadenceBox.height * month.captures_day / 100)).join(' ')
    const changedPoints = months.map((month, index) => monthX(index) + ',' + (cadenceBox.y + cadenceBox.height - cadenceBox.height * month.changed_pct / 100)).join(' ')
    add(cadenceSvg, 'polyline', { class: 'chart-line', points: cadencePoints, stroke: '#72c7a5' })
    add(cadenceSvg, 'polyline', { class: 'chart-line', points: changedPoints, stroke: '#f0c55b' })

    const activityBox = { x: 55, y: 12, width: 917, height: 222 }
    const maxActivity = Math.max(...months.flatMap(month => [month.events_day, month.pricing_day]))
    for (let step = 0; step <= 3; step++) {
      const value = maxActivity * (1 - step / 3)
      const yy = activityBox.y + activityBox.height * (step / 3)
      add(activitySvg, 'line', { class: 'chart-grid', x1: activityBox.x, x2: activityBox.x + activityBox.width, y1: yy, y2: yy })
      add(activitySvg, 'text', { class: 'chart-label', x: activityBox.x - 10, y: yy + 4, 'text-anchor': 'end' }, Math.round(value))
    }
    const groupWidth = activityBox.width / months.length
    months.forEach((month, index) => {
      const baseX = activityBox.x + groupWidth * index
      const eventHeight = activityBox.height * month.events_day / maxActivity
      const pricingHeight = activityBox.height * month.pricing_day / maxActivity
      add(activitySvg, 'rect', { x: baseX + groupWidth * .2, y: activityBox.y + activityBox.height - eventHeight, width: groupWidth * .27, height: eventHeight, rx: 2, fill: '#ff7650' })
      add(activitySvg, 'rect', { x: baseX + groupWidth * .52, y: activityBox.y + activityBox.height - pricingHeight, width: groupWidth * .27, height: pricingHeight, rx: 2, fill: '#7da7ef' })
      add(activitySvg, 'text', { class: 'chart-label', x: baseX + groupWidth * .5, y: activityBox.y + activityBox.height + 24, 'text-anchor': 'middle' }, month.month.slice(2))
    })
  </script>
</body>
</html>`

  yield* Effect.tryPromise(async () => await Bun.write(outputPath, html))
  yield* Effect.logInfo('presentation built').pipe(
    Effect.annotateLogs({ database: databasePath, output: outputPath }),
  )
  return outputPath
}).pipe(
  Effect.provide(SqliteClient.layer({ disableWAL: true, filename: databasePath, readonly: true })),
)

BunRuntime.runMain(build)
