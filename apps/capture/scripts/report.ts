// * The HTML side of the scripts in this directory: one self-contained file, no network, no build
// * step, openable from the filesystem and mailable as-is. A report is data plus a script that
// * renders it — the data is embedded as JSON so the page can filter, sort and expand without
// * re-running the analysis, which is the whole reason these reports are HTML and not Markdown.
// *
// * Everything a report shares lives here: the stylesheet, the page chrome (title, identity,
// * summary chips), and a small client prelude (`esc`, `num`, `pct`, `bar`, `el`) that report
// * scripts build their markup with. What a specific report *means* stays in that report's script.

const ESCAPES: Record<string, string> = {
  '"': '&quot;',
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
}

export const escapeHtml = (value: string) => value.replaceAll(/["&<>]/g, (c) => ESCAPES[c] ?? c)

// * `<` is escaped so an embedded value can never close the script tag it travels in
const embed = (data: unknown) => JSON.stringify(data).replaceAll('<', '\\u003c')

const STYLES = `
:root {
  --bg: oklch(98.5% 0.004 250); --panel: oklch(100% 0 0); --line: oklch(90% 0.006 250);
  --ink: oklch(25% 0.02 265); --dim: oklch(52% 0.02 265); --faint: oklch(70% 0.015 265);
  --accent: oklch(55% 0.19 265); --accent-soft: oklch(94% 0.03 265);
  --set: oklch(62% 0.15 160); --null: oklch(75% 0.14 75); --absent: oklch(88% 0.01 265);
  --shadow: 0 1px 2px oklch(25% 0.02 265 / 6%), 0 4px 16px oklch(25% 0.02 265 / 4%);
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: oklch(19% 0.015 265); --panel: oklch(23% 0.017 265); --line: oklch(31% 0.02 265);
    --ink: oklch(93% 0.01 265); --dim: oklch(72% 0.02 265); --faint: oklch(55% 0.02 265);
    --accent: oklch(75% 0.15 265); --accent-soft: oklch(30% 0.05 265);
    --set: oklch(70% 0.14 160); --null: oklch(78% 0.13 75); --absent: oklch(34% 0.015 265);
    --shadow: none;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.5 system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
main { max-width: 1180px; margin: 0 auto; padding: 0 24px 96px; }
a { color: var(--accent); }
code, .mono { font-family: var(--mono); font-size: 0.92em; }

/* page chrome */
header.page { max-width: 1180px; margin: 0 auto; padding: 40px 24px 20px; }
header.page h1 { margin: 0; font-size: 22px; letter-spacing: -0.01em; }
header.page .identity {
  margin: 6px 0 0; font-family: var(--mono); font-size: 13px; color: var(--dim);
}
header.page p.blurb { margin: 14px 0 0; max-width: 70ch; color: var(--dim); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 0; }
.chip {
  display: flex; gap: 8px; align-items: baseline; padding: 7px 11px; background: var(--panel);
  border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow);
}
.chip b { font-variant-numeric: tabular-nums; font-weight: 600; }
.chip span { color: var(--dim); font-size: 12px; text-transform: lowercase; }

/* generic pieces report scripts use */
.panel {
  background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  box-shadow: var(--shadow);
}
.bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: var(--absent); }
.bar > i { display: block; height: 100%; }
.bar > i.set { background: var(--set); }
.bar > i.null { background: var(--null); }
.bar > i.absent { background: var(--absent); }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); }
th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--faint); }
td.n, th.n { text-align: right; }
button { font: inherit; color: inherit; cursor: pointer; }
.muted { color: var(--dim); }
.faint { color: var(--faint); }
`

// * one report: chrome, embedded data, and the script that turns the second into the first
export const page = (options: {
  blurb?: string
  chips: Array<{ label: string; value: string }>
  data: unknown
  identity: string
  script: string
  styles?: string
  title: string
}) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<style>${STYLES}${options.styles ?? ''}</style>
</head>
<body>
<header class="page">
  <h1>${escapeHtml(options.title)}</h1>
  <p class="identity">${escapeHtml(options.identity)}</p>
  ${options.blurb === undefined ? '' : `<p class="blurb">${options.blurb}</p>`}
  <div class="chips">${options.chips
    .map(
      (chip) =>
        `<div class="chip"><b>${escapeHtml(chip.value)}</b><span>${escapeHtml(
          chip.label,
        )}</span></div>`,
    )
    .join('')}</div>
</header>
<main id="report"></main>
<script id="report-data" type="application/json">${embed(options.data)}</script>
<script>
const DATA = JSON.parse(document.getElementById('report-data').textContent)

// * client prelude — the four things every report needs to put a number on screen safely
const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const num = (value) => value.toLocaleString('en-US')
const pct = (part, whole) => (whole === 0 ? '0%' : \`\${Math.round((part / whole) * 100)}%\`)
const bar = (segments) =>
  \`<div class="bar">\${segments
    .filter(([, value]) => value > 0)
    .map(([kind, value, total]) => \`<i class="\${kind}" style="width:\${(value / total) * 100}%"></i>\`)
    .join('')}</div>\`
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild }

${options.script}
</script>
</body>
</html>
`
