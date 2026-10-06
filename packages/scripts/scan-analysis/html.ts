import type { ScanReport } from '@orca/backend/scan/analysis'

import { escapeHtml } from './summary'

/** Bundle only the local viewer; the saved report has no network or runtime dependencies. */
export async function renderHtml(report: ScanReport): Promise<string> {
  const built = await Bun.build({
    entrypoints: [new URL('viewer.ts', import.meta.url).pathname],
    minify: true,
    target: 'browser',
  })

  if (!built.success || built.outputs[0] === undefined) {
    throw new Error(
      `Unable to build the report viewer: ${built.logs.map((log) => log.message).join('\n')}`,
    )
  }

  const script = await built.outputs[0].text()
  const styles = await Bun.file(new URL('styles.css', import.meta.url)).text()
  const payload = JSON.stringify(report).replaceAll('<', '\\u003c')
  const scope = report.selection.scope === 'orca' ? 'ORCA scope' : 'Collected data'
  const filters = [report.selection.model, report.selection.provider].filter(Boolean).join(' · ')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scan profile · ${escapeHtml(report.scan_at)}</title>
<style>${styles}</style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">ORCA / Scan analysis</p>
    <h1>Scan profile</h1>
    <p class="source"><time>${escapeHtml(report.scan_at)}</time></p>
    <p class="scope">${scope}${filters ? ` · ${escapeHtml(filters)}` : ''}</p>
  </header>
  <section aria-label="Explore fields">
    <div class="toolbar">
      <label>Population<select id="population">
        <option value="endpoints">Endpoints · ${report.endpoints.profile.record_count}</option>
        <option value="models">Models · ${report.models.profile.record_count}</option>
        <option value="providers">Providers · ${report.providers.profile.record_count}</option>
      </select></label>
      <label class="search">Find a field<input id="search" type="search" placeholder="e.g. pricing, quantization, context_length"></label>
      <label>Sort by<select id="sort"><option value="path">Field path</option><option value="missing">Most absent</option><option value="distinct">Most distinct values</option></select></label>
      <button id="export" type="button">Export JSON</button>
    </div>
    <p id="counts" role="status"></p>
    <div class="columns" aria-hidden="true"><span>Field path</span><span>Types</span><span>Present</span><span>Null</span><span>Distinct*</span></div>
    <div id="fields"></div>
    <p id="empty" hidden>No fields match. Clear the search or choose another population.</p>
  </section>
  <footer>
    <p>Presence and null percentages use the containing object population. Array-item rows count occurrences, including repeated items. *Distinct counts include primitive values only.</p>
    <p>Numeric summaries describe observed field values, not combined request performance. Numeric strings retain their source representation. Examples show up to three distinct primitive values with their entity identities.</p>
    <p>${report.selection.scope === 'orca' ? 'ORCA scope applies the current text-model selection and entity assembly rules.' : 'Collected data includes all collected models and endpoint source fields. Providers are counted once by identity, using the last collected body.'} This report describes one scan; capture time dates the observation.</p>
  </footer>
  <noscript>Enable JavaScript to explore this report. Use scan_analysis/index:profile through the Convex CLI for a plain data report.</noscript>
</main>
<script type="application/json" id="report">${payload}</script>
<script>${script.replaceAll('</script', '<\\/script')}</script>
</body>
</html>`
}
