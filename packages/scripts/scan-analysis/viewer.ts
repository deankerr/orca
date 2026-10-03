/// <reference lib="dom" />

import type { ValueProfile } from '../json-profile/library/profile'
import type { Population, ScanReport } from './profile'
import { distinctValues, escapeHtml, numericSummary, profileRows } from './summary'

const payload = document.querySelector('#report')
const population = document.querySelector<HTMLSelectElement>('#population')
const search = document.querySelector<HTMLInputElement>('#search')
const sort = document.querySelector<HTMLSelectElement>('#sort')
const fields = document.querySelector('#fields')
const counts = document.querySelector('#counts')
const empty = document.querySelector<HTMLElement>('#empty')

if (
  payload === null ||
  population === null ||
  search === null ||
  sort === null ||
  fields === null ||
  counts === null ||
  empty === null
) {
  throw new Error('The scan report is missing its viewer elements.')
}

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The renderer embeds its typed ScanReport as inert JSON in this document.
const report = JSON.parse(payload.textContent ?? '') as ScanReport

function percentage(count: number, total: number): string {
  return total === 0 ? '—' : `${((100 * count) / total).toFixed(1)}%`
}

function display(value: unknown): string {
  return JSON.stringify(value) ?? ''
}

function frequencies(entries: { count: number; value: unknown }[], total: number): string {
  const ordered = entries.toSorted((left, right) => right.count - left.count)
  const shown = ordered.slice(0, 50)
  return `<p class="hint">${entries.length > 50 ? `Showing the 50 most frequent of ${entries.length} values. Export JSON for every value.` : `${entries.length} distinct values.`}</p>
    <div class="frequency-list">${shown
      .map(
        ({ count, value }) => `
      <div class="frequency"><code>${escapeHtml(display(value))}</code><span>${count.toLocaleString()} <small>${percentage(count, total)}</small></span>
        <meter min="0" max="${total}" value="${count}" aria-label="Occurrences">${count}</meter>
      </div>`,
      )
      .join('')}</div>`
}

function describe(value: ValueProfile, selected: Population): string {
  const summary = numericSummary(value)

  const numeric =
    summary === null
      ? ''
      : `<div class="numeric">${[
          ['Minimum', summary.min],
          ['Median', summary.median],
          ['95th percentile', summary.p95],
          ['Maximum', summary.max],
        ]
          .map(([label, number]) => `<div><span>${label}</span><strong>${number}</strong></div>`)
          .join('')}</div>`

  const branches = value.types
    .map((branch) => {
      const heading = `<h3>${branch.type} <small>${branch.count.toLocaleString()} occurrences</small></h3>`

      if ('values' in branch) {
        return heading + frequencies(branch.values, branch.count)
      }

      if (branch.type === 'array') {
        return `${heading}<p class="hint">Array length distribution. Item values appear in the [*] field below.</p>${frequencies(
          branch.lengths.map(({ count, length }) => ({ count, value: length })),
          branch.count,
        )}`
      }

      if (branch.type === 'object') {
        return `${heading}<details class="key-sets"><summary>Explore ${branch.key_sets.length} property combinations</summary>${frequencies(
          branch.key_sets.map(({ count, keys }) => ({ count, value: keys })),
          branch.count,
        )}</details>`
      }

      return heading
    })
    .join('')

  const examples = selected.examples[value.path] ?? []

  const identities =
    examples.length === 0
      ? ''
      : `<h3>Entity examples</h3>${examples.map(({ id, value }) => `<div class="example"><code>${escapeHtml(id)}</code><code>${escapeHtml(display(value))}</code></div>`).join('')}`
  return `${numeric}${branches}${identities}`
}

function render(): void {
  if (
    population === null ||
    search === null ||
    sort === null ||
    fields === null ||
    counts === null ||
    empty === null
  ) {
    return
  }

  let selected = report.endpoints

  if (population.value === 'models') {
    selected = report.models
  } else if (population.value === 'providers') {
    selected = report.providers
  }

  const all = profileRows(selected.profile)
  const query = search.value.trim().toLowerCase()

  const rows = all
    .filter(({ value }) => value.path.toLowerCase().includes(query))
    .toSorted((left, right) => {
      if (sort.value === 'missing') {
        return right.none / (right.value.population || 1) - left.none / (left.value.population || 1)
      }

      if (sort.value === 'distinct') {
        return distinctValues(right.value) - distinctValues(left.value)
      }

      return left.value.path.localeCompare(right.value.path)
    })

  fields.replaceChildren()
  counts.textContent = `${selected.profile.record_count.toLocaleString()} entities · ${rows.length} of ${all.length} fields`
  empty.hidden = rows.length > 0

  for (const { none, value } of rows) {
    const row = document.createElement('details')
    const nulls = value.types.find((branch) => branch.type === 'null')?.count ?? 0
    row.className = 'field'

    row.innerHTML = `<summary>
      <code class="path">${escapeHtml(value.path.replace(/^\$\[\*\]/, ''))}</code>
      <span class="types">${value.types.map((branch) => branch.type).join(' · ')}</span>
      <span class="stat" title="${value.population - none} of ${value.population} locations"><span class="mobile-label">Present </span>${percentage(value.population - none, value.population)}</span>
      <span class="stat"><span class="mobile-label">Null </span>${percentage(nulls, value.population)}</span>
      <span class="stat"><span class="mobile-label">Distinct </span>${distinctValues(value).toLocaleString()}</span>
    </summary>`

    let loaded = false

    row.addEventListener('toggle', () => {
      if (row.open && !loaded) {
        const detail = document.createElement('div')
        detail.className = 'detail'
        detail.innerHTML = `<p class="hint">${none.toLocaleString()} absent · ${nulls.toLocaleString()} null · ${value.population.toLocaleString()} possible locations</p>${describe(value, selected)}`
        row.append(detail)
        loaded = true
      }
    })

    fields.append(row)
  }
}

population.addEventListener('change', render)
search.addEventListener('input', render)
sort.addEventListener('change', render)

document.querySelector('#export')?.addEventListener('click', () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
  )

  const link = document.createElement('a')
  link.href = url
  link.download = `scan-profile.${report.source.scan_at}.json`
  link.click()

  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
})

render()
