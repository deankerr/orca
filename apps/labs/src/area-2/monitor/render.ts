export interface PricingRevision {
  kind: 'available' | 'baseline' | 'pricing' | 'unavailable'
  pricing: unknown
  providerModelId: string
}

export interface MonitorEvent {
  changeKind: 'available' | 'baseline' | 'unavailable' | 'updated'
  changeset: unknown
  context: unknown
  contextKind: 'entity' | 'none' | 'pricing'
  crawlId: string
  entityId: string
  entityType: 'endpoint' | 'model'
  modelName: string
  modelSlug: string
  pricingRevision: PricingRevision | undefined
  providerDisplayName: string | undefined
  providerName: string | undefined
  providerSlug: string | undefined
}

export interface MonitorSummary {
  crawls: number
  eventCount: number
  firstCrawlId: string
  generatedAt: string
  lastCrawlId: string
  pricingRevisionCount: number
}

interface PricingChange {
  after: unknown
  before: unknown
  component: string
}

type GenericChange =
  | {
      after: unknown
      before: unknown
      kind: 'value'
      path: string[]
    }
  | {
      added: unknown[]
      kind: 'members'
      path: string[]
      removed: unknown[]
    }

const pricingComponents = [
  'prompt',
  'completion',
  'audio',
  'input_audio_cache',
  'image',
  'image_output',
  'input_cache_read',
  'input_cache_write',
  'input_cache_write_1h',
  'internal_reasoning',
  'request',
  'web_search',
  'discount',
] as const
const pricingComponentSet = new Set<string>(pricingComponents)
const tokenPriceComponents = new Set<string>([
  'prompt',
  'completion',
  'audio',
  'input_audio_cache',
  'input_cache_read',
  'input_cache_write',
  'input_cache_write_1h',
  'internal_reasoning',
])
const alwaysVisibleRateComponents = new Set(['prompt', 'completion'])
const imagePriceComponents = new Set(['image', 'image_output'])
const requestPriceComponents = new Set(['request', 'web_search'])

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const json = (value: unknown) => JSON.stringify(value, null, 2) ?? 'undefined'

const humanize = (value: string) => value.replaceAll('_', ' ')

const formatDate = (crawlId: string) =>
  new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(Number(crawlId)))

const formatCompactValue = (value: unknown) => {
  if (value === undefined) {
    return 'not listed'
  }
  if (typeof value === 'number') {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 }).format(value)
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return String(value)
  }
  return json(value)
}

const isZero = (value: unknown) =>
  value === 0 || (typeof value === 'string' && /^-?0(?:\.0+)?$/.test(value))

const multiplyDecimal = (value: unknown, multiplierPower: number) => {
  const source = typeof value === 'number' ? String(value) : value
  if (typeof source !== 'string') {
    return formatCompactValue(value)
  }
  const match = /^(?<sign>-?)(?<whole>\d+)(?:\.(?<fractional>\d+))?$/.exec(source)
  if (match === null) {
    return source
  }
  const { fractional = '', sign = '', whole = '' } = match.groups ?? {}
  const digits = `${whole}${fractional}`.replace(/^0+/, '') || '0'
  if (digits === '0') {
    return `${sign}0`
  }
  const decimalPlaces = fractional.length - multiplierPower
  if (decimalPlaces <= 0) {
    return `${sign}${digits}${'0'.repeat(-decimalPlaces)}`
  }
  const padded = digits.padStart(decimalPlaces + 1, '0')
  const integer = padded.slice(0, -decimalPlaces)
  const decimal = padded.slice(-decimalPlaces).replace(/0+$/, '')
  return decimal === '' ? `${sign}${integer}` : `${sign}${integer}.${decimal}`
}

const formatPrice = (component: string, value: unknown) => {
  if (value === undefined) {
    return 'not listed'
  }
  if (component === 'discount') {
    return typeof value === 'number'
      ? `${formatCompactValue(value * 100)}%`
      : formatCompactValue(value)
  }
  if (tokenPriceComponents.has(component)) {
    return `$${multiplyDecimal(value, 6)} / M tokens`
  }
  if (imagePriceComponents.has(component)) {
    return `$${multiplyDecimal(value, 3)} / K images`
  }
  if (requestPriceComponents.has(component)) {
    return `$${formatCompactValue(value)} / request`
  }
  return `$${formatCompactValue(value)}`
}

const normalizePath = (path: string[]) => (path[0] === 'endpoint' ? path.slice(1) : path)

const isPricingPath = (path: string[]) => path[0] === 'pricing'

const memberValue = (change: Record<string, unknown>) =>
  change.value ?? change.oldValue ?? change.key

const beforeAndAfter = (change: Record<string, unknown>) => {
  if (change.type === 'ADD') {
    return { after: change.value, before: undefined }
  }
  if (change.type === 'REMOVE') {
    return { after: undefined, before: change.value }
  }
  return { after: change.value, before: change.oldValue }
}

const genericChanges = (changeset: unknown): GenericChange[] => {
  const visit = (changes: unknown, path: string[]): GenericChange[] => {
    if (!Array.isArray(changes)) {
      return []
    }
    return changes.flatMap((candidate) => {
      if (!isRecord(candidate) || typeof candidate.key !== 'string') {
        return []
      }
      const nextPath = candidate.key === '$root' ? path : [...path, candidate.key]
      if (Array.isArray(candidate.changes)) {
        if (candidate.embeddedKey === '$value') {
          const normalizedPath = normalizePath(nextPath)
          if (isPricingPath(normalizedPath)) {
            return []
          }
          const added: unknown[] = []
          const removed: unknown[] = []
          for (const member of candidate.changes) {
            if (!isRecord(member)) {
              continue
            }
            if (member.type === 'ADD') {
              added.push(memberValue(member))
            } else if (member.type === 'REMOVE') {
              removed.push(memberValue(member))
            }
          }
          return added.length === 0 && removed.length === 0
            ? visit(candidate.changes, nextPath)
            : [{ added, kind: 'members', path: normalizedPath, removed }]
        }
        return visit(candidate.changes, nextPath)
      }
      const normalizedPath = normalizePath(nextPath)
      if (normalizedPath.length === 0 || isPricingPath(normalizedPath)) {
        return []
      }
      const { after, before } = beforeAndAfter(candidate)
      return [
        {
          after,
          before,
          kind: 'value',
          path: normalizedPath,
        },
      ]
    })
  }

  const coalesced: GenericChange[] = []
  for (const change of visit(changeset, [])) {
    const previous = coalesced.at(-1)
    if (
      change.kind === 'value' &&
      previous?.kind === 'value' &&
      previous.path.join('.') === change.path.join('.') &&
      previous.after === undefined &&
      change.before === undefined
    ) {
      coalesced[coalesced.length - 1] = { ...change, before: previous.before }
    } else {
      coalesced.push(change)
    }
  }
  return coalesced
}

const pricingChanges = (changeset: unknown): PricingChange[] => {
  const visit = (changes: unknown, path: string[]): PricingChange[] => {
    if (!Array.isArray(changes)) {
      return []
    }
    return changes.flatMap((candidate) => {
      if (!isRecord(candidate) || typeof candidate.key !== 'string') {
        return []
      }
      const nextPath = candidate.key === '$root' ? path : [...path, candidate.key]
      if (Array.isArray(candidate.changes)) {
        return visit(candidate.changes, nextPath)
      }
      if (nextPath[0] !== 'endpoint' || nextPath[1] !== 'pricing' || nextPath.length !== 3) {
        return []
      }
      const { after, before } = beforeAndAfter(candidate)
      return [
        {
          after,
          before,
          component: nextPath[2] ?? 'unknown',
        },
      ]
    })
  }

  return visit(changeset, [])
}

const pricingCard = (context: unknown): Record<string, unknown> | undefined => {
  if (!isRecord(context)) {
    return undefined
  }
  if (isRecord(context.pricing)) {
    return context.pricing
  }
  if (isRecord(context.endpoint) && isRecord(context.endpoint.pricing)) {
    return context.endpoint.pricing
  }
  return undefined
}

const directPricingCard = (pricing: unknown): Record<string, unknown> | undefined =>
  isRecord(pricing) ? pricing : undefined

const renderPriceCard = (title: string, pricing: Record<string, unknown>) => {
  const keys = [
    ...pricingComponents.filter(
      (component) =>
        Object.hasOwn(pricing, component) &&
        (alwaysVisibleRateComponents.has(component) || !isZero(pricing[component])),
    ),
    ...Object.keys(pricing)
      .filter(
        (component) =>
          !pricingComponentSet.has(component) &&
          (alwaysVisibleRateComponents.has(component) || !isZero(pricing[component])),
      )
      .toSorted(),
  ]
  if (keys.length === 0) {
    return ''
  }
  return `<section class="rate-card">
    <h3>${escapeHtml(title)}</h3>
    <dl>${keys
      .map(
        (component) =>
          `<div><dt>${escapeHtml(humanize(component))}</dt><dd>${escapeHtml(
            formatPrice(component, pricing[component]),
          )}</dd></div>`,
      )
      .join('')}</dl>
  </section>`
}

const renderPricingChanges = (changes: PricingChange[]) => {
  if (changes.length === 0) {
    return ''
  }
  return `<section class="pricing-change">
    <h3>Pricing change</h3>
    <table>
      <thead><tr><th>Component</th><th>Before</th><th>After</th></tr></thead>
      <tbody>${changes
        .map(
          (change) => `<tr>
            <th>${escapeHtml(humanize(change.component))}</th>
            <td>${escapeHtml(formatPrice(change.component, change.before))}</td>
            <td>${escapeHtml(formatPrice(change.component, change.after))}</td>
          </tr>`,
        )
        .join('')}</tbody>
    </table>
  </section>`
}

const renderChange = (change: GenericChange) => {
  const path = change.path.map(humanize).join('.')
  if (change.kind === 'members') {
    const members = [
      ...change.added.map((value) => `+${formatCompactValue(value)}`),
      ...change.removed.map((value) => `-${formatCompactValue(value)}`),
    ]
    return `${path}: ${members.join(', ')}`
  }
  if (change.before === undefined) {
    return `${path}: +${formatCompactValue(change.after)}`
  }
  if (change.after === undefined) {
    return `${path}: -${formatCompactValue(change.before)}`
  }
  return `${path}: ${formatCompactValue(change.before)} -> ${formatCompactValue(change.after)}`
}

const renderChangeSummary = (changeset: unknown) => {
  const changes = genericChanges(changeset)
  if (changes.length === 0) {
    return ''
  }
  const shown = changes.slice(0, 3).map(renderChange)
  const remainder = changes.length - shown.length
  return `<p class="change-summary"><span>Changed</span> ${escapeHtml(shown.join(' | '))}${
    remainder === 0 ? '' : ` <span>+${remainder} more</span>`
  }</p>`
}

const renderJson = (title: string, value: unknown) => `<details>
  <summary>${escapeHtml(title)}</summary>
  <pre>${escapeHtml(json(value))}</pre>
</details>`

const rateCardTitle = (event: MonitorEvent, priceChanges: PricingChange[]) => {
  if (event.pricingRevision !== undefined) {
    return event.pricingRevision.kind === 'unavailable'
      ? 'Rate card before removal'
      : 'Rate-card revision'
  }
  if (priceChanges.length > 0) {
    return 'Rate card after pricing change'
  }
  if (event.changeKind === 'available') {
    return 'Rate card at availability'
  }
  if (event.changeKind === 'unavailable') {
    return 'Rate card before removal'
  }
  return 'Rate card at baseline'
}

const renderPricingRevision = (revision: PricingRevision | undefined) => {
  if (revision === undefined) {
    return ''
  }
  return `<p class="pricing-revision">Rate-card revision <strong>${escapeHtml(
    revision.kind,
  )}</strong> <code>${escapeHtml(revision.providerModelId)}</code></p>`
}

const renderProvider = (event: MonitorEvent) => {
  const label = event.providerDisplayName ?? event.providerName
  if (label === undefined) {
    return ''
  }
  const organization =
    event.providerName === undefined || event.providerName === label
      ? ''
      : ` (${event.providerName})`
  const slug = event.providerSlug === undefined ? '' : ` / ${event.providerSlug}`
  return `<span class="provider">${escapeHtml(`${label}${organization}${slug}`)}</span>`
}

const renderEvent = (event: MonitorEvent) => {
  const lifecycle = event.changeKind !== 'updated'
  const priceChanges = pricingChanges(event.changeset)
  const revisionPriceCard = directPricingCard(event.pricingRevision?.pricing)
  const priceCard = revisionPriceCard ?? pricingCard(event.context)

  return `<article class="event kind-${event.changeKind}">
    <header>
      <div class="event-heading">
        <span class="kind">${escapeHtml(event.changeKind)}</span>
        <span class="entity-type">${escapeHtml(event.entityType)}</span>
        <strong>${escapeHtml(event.modelName)}</strong>
        <code>${escapeHtml(event.modelSlug)}</code>
        ${renderProvider(event)}
      </div>
      <time datetime="${new Date(Number(event.crawlId)).toISOString()}">${escapeHtml(
        formatDate(event.crawlId),
      )} UTC</time>
    </header>
    <p class="entity-id">${escapeHtml(event.entityId)}</p>
    ${renderPricingRevision(event.pricingRevision)}
    ${lifecycle ? '' : renderChangeSummary(event.changeset)}
    ${renderPricingChanges(priceChanges)}
    ${priceCard === undefined ? '' : renderPriceCard(rateCardTitle(event, priceChanges), priceCard)}
    ${
      event.pricingRevision?.pricing === undefined
        ? ''
        : renderJson('Rate-card revision JSON', event.pricingRevision.pricing)
    }
    ${lifecycle ? renderJson('Selected entity state', event.context) : renderJson('Changeset JSON', event.changeset)}
  </article>`
}

const styles = `
  :root {
    color-scheme: dark;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    background: #10130f;
    color: #e6eadf;
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0 20px 56px; }
  main { max-width: 1160px; margin: 0 auto; }
  .masthead {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 24px;
    padding: 42px 0 24px;
    border-bottom: 1px solid #394036;
  }
  h1 { margin: 0; font-size: clamp(1.6rem, 5vw, 2.8rem); letter-spacing: -0.07em; }
  .eyebrow, h3, summary, .entity-id { color: #a6af9b; }
  .eyebrow { margin: 0 0 9px; font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; }
  .stats { display: grid; grid-template-columns: repeat(2, max-content); gap: 8px 14px; align-content: end; font-size: 0.75rem; }
  .stats dt { color: #a6af9b; }
  .stats dd { margin: 0; text-align: right; }
  .feed { display: grid; gap: 12px; padding-top: 18px; }
  .event { background: #171c16; border: 1px solid #313a2e; border-left: 4px solid #69735f; padding: 15px 16px; }
  .event.kind-baseline { border-left-color: #758770; }
  .event.kind-available { border-left-color: #72aa75; }
  .event.kind-unavailable { border-left-color: #c46d65; }
  .event.kind-updated { border-left-color: #c9a75c; }
  .event > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .event-heading { display: flex; flex-wrap: wrap; gap: 7px 11px; align-items: center; min-width: 0; }
  .kind, .entity-type, .provider { font-size: 0.72rem; }
  .kind { color: #10130f; background: #c9d0bf; padding: 2px 5px; text-transform: uppercase; font-weight: 700; }
  .entity-type { color: #c9d0bf; text-transform: uppercase; }
  strong { color: #e6eadf; font-size: 0.9rem; }
  code { color: #e8cb8c; overflow-wrap: anywhere; }
  .provider { color: #b9c7b2; overflow-wrap: anywhere; }
  time { flex: none; color: #a6af9b; font-size: 0.72rem; white-space: nowrap; }
  .entity-id { margin: 11px 0 0; font-size: 0.72rem; overflow-wrap: anywhere; }
  .change-summary { margin: 13px 0 0; color: #d5d9cf; font-size: 0.78rem; line-height: 1.6; }
  .change-summary span { color: #a6af9b; }
  .pricing-revision { margin: 13px 0 0; color: #b9c7b2; font-size: 0.76rem; }
  .pricing-revision strong { color: #e8cb8c; font-size: inherit; text-transform: uppercase; }
  .pricing-revision code { margin-left: 5px; }
  section, details { margin-top: 13px; }
  h3 { margin: 0 0 7px; font-size: 0.76rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; }
  .pricing-change { border: 1px solid #675430; background: #201d14; padding: 10px 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  th, td { padding: 5px 7px; text-align: left; border-top: 1px solid #554b31; overflow-wrap: anywhere; }
  thead th { color: #d8c287; border-top: 0; font-weight: 500; }
  tbody th { color: #d8c287; font-weight: 500; }
  .rate-card { border-left: 2px solid #687b5f; padding: 0 0 0 11px; }
  .rate-card dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px 14px; margin: 0; }
  .rate-card dl div { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px solid #30392d; padding-bottom: 4px; }
  .rate-card dt { color: #a6af9b; font-size: 0.72rem; }
  .rate-card dd { margin: 0; color: #e8cb8c; font-size: 0.76rem; overflow-wrap: anywhere; }
  summary { cursor: pointer; font-size: 0.76rem; }
  pre { max-height: 420px; overflow: auto; margin: 8px 0 0; padding: 12px; background: #0e110e; border: 1px solid #2a3228; color: #c6d0bf; font-size: 0.72rem; line-height: 1.45; }
  @media (max-width: 700px) {
    body { padding: 0 12px 36px; }
    .masthead { grid-template-columns: 1fr; gap: 18px; padding-top: 28px; }
    .stats { justify-content: start; }
    .event { padding: 13px; }
    .event > header { display: grid; gap: 10px; }
    time { white-space: normal; }
  }
`

export const renderMonitor = (summary: MonitorSummary, events: MonitorEvent[], limit: number) => {
  const newestCrawlId = events[0]?.crawlId
  const oldestCrawlId = events.at(-1)?.crawlId
  const eventWindow =
    newestCrawlId === undefined || oldestCrawlId === undefined
      ? 'no events'
      : `${formatDate(oldestCrawlId)} to ${formatDate(newestCrawlId)} UTC`

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ORCA Area 2 Monitor</title>
    <style>${styles}</style>
  </head>
  <body>
    <main>
      <header class="masthead">
        <div>
          <p class="eyebrow">ORCA / Area 2 / static artifact</p>
          <h1>Monitor</h1>
        </div>
        <dl class="stats">
          <dt>Events shown</dt><dd>${events.length} / ${limit}</dd>
          <dt>Event window</dt><dd>${escapeHtml(eventWindow)}</dd>
           <dt>Total events</dt><dd>${summary.eventCount}</dd>
           <dt>Pricing revisions</dt><dd>${summary.pricingRevisionCount}</dd>
           <dt>Crawls</dt><dd>${summary.crawls}</dd>
          <dt>Database coverage</dt><dd>${escapeHtml(formatDate(summary.firstCrawlId))} to ${escapeHtml(
            formatDate(summary.lastCrawlId),
          )} UTC</dd>
          <dt>Generated</dt><dd>${escapeHtml(summary.generatedAt)}</dd>
        </dl>
      </header>
      <section class="feed" aria-label="Recent changes">
        ${events.map(renderEvent).join('')}
      </section>
    </main>
  </body>
</html>
`
}
