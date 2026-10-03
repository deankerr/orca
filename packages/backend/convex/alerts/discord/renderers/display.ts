export const dot = ' • '

/** Wrap preformatted children in a consistent field row or block; labels are plain text. */
export function field(
  label: string,
  children: string,
  {
    width = 0,
    layout = 'inline',
    change,
  }: {
    width?: number
    layout?: 'inline' | 'block'
    change?: 'added' | 'removed'
  } = {},
): string {
  const key = code(layout === 'inline' ? `${label}:` : label, {
    width: width + (layout === 'inline' ? 1 : 0),
  })
  const heading = change === 'removed' ? strike(key) : key
  const value = change === 'removed' ? strike(children) : children
  const marker = change === 'added' ? '+ ' : change === 'removed' ? '− ' : ''

  return layout === 'block' ? `${marker}${heading}\n${value}` : `${marker}${heading} ${value}`
}

/** Keep quote markers outside strikethrough so removed prose retains its block layout. */
function strike(children: string): string {
  return children
    .split('\n')
    .map((line) => (line.startsWith('> ') ? `> ~~${line.slice(2)}~~` : `~~${line}~~`))
    .join('\n')
}

/** Values arrive formatted; arrows indicate updates, and only removed fields are struck. */
export function valueChange(
  before: string | undefined,
  after: string | undefined,
  { annotation = '' }: { annotation?: string } = {},
): string {
  // Rounded prices or fractional fields can coincide: show ≈0.142 ▲,
  // rather than a misleading 0.142 → 0.142 or an arbitrarily long decimal tail.
  if (before !== undefined && before === after) {
    return `≈${after}${annotation === '' ? '' : ` ${annotation}`}`
  }

  const values = [before, after].filter((value) => value !== undefined).join(' → ')

  return `${values}${annotation === '' ? '' : ` ${annotation}`}`
}

/** Padding stays inside the code span; literal backticks/newlines retain the escaped-text fallback. */
export function code(
  children: string,
  { width = 0, align = 'left' }: { width?: number; align?: 'left' | 'right' } = {},
): string {
  const text = align === 'right' ? children.padStart(width) : children.padEnd(width)

  return /[`\r\n]/.test(text) ? escape(text) : `\`${text}\``
}

/** Escape inline Markdown, leaving ordinary punctuation such as slug hyphens untouched. */
export const escape = (text: string): string => text.replaceAll(/[\\`*_~|<>[\]]/g, '\\$&')

/** Each event kind has a marker; arrivals distinguish discoveries and returns. */
export function lifecycleMarker(event: { type: string; previously_known?: boolean }): string {
  if (event.type.endsWith('_removed')) {
    return '− '
  }

  if (event.type.endsWith('_added')) {
    return event.previously_known === false ? '✨ ' : event.previously_known === true ? '↺ ' : '+ '
  }

  return 'Δ '
}
