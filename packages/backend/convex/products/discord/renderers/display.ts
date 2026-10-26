export const dot = ' • '

/**
 * One change per bullet: `- **label** value`, or the label above a quoted block.
 * Labels are curated field names; Discord leaves their mid-word underscores alone.
 */
export function changeRow(
  label: string,
  children: string,
  { layout = 'inline' }: { layout?: 'inline' | 'block' } = {},
): string {
  const key = `- **${label}**`

  return layout === 'block' ? `${key}\n${children}` : `${key} ${children}`
}

/** `- item` per non-empty line, as one list. */
export function bulletList(items: readonly string[]): string {
  return items.flatMap((item) => (item === '' ? [] : [`- ${item}`])).join('\n')
}

/** Rows stack line by line; a quote is always followed by a blank line before what comes next. */
export function stackRows(lines: readonly string[]): string {
  const present = lines.filter(Boolean)

  return present
    .map((line, index) =>
      index < present.length - 1 && line.split('\n').at(-1)?.startsWith('>') === true
        ? `${line}\n`
        : line,
    )
    .join('\n')
}

/** Added values are new; removed values are struck and named, since bullets carry no marker. */
export function presence(value: string, transition: 'added' | 'removed'): string {
  return transition === 'added' ? `${value} (new)` : `${strike(value)} (removed)`
}

/** Keep quote markers outside strikethrough so removed prose retains its block layout. */
export function strike(children: string): string {
  return children
    .split('\n')
    .map((line) => (line.startsWith('> ') ? `> ~~${line.slice(2)}~~` : `~~${line}~~`))
    .join('\n')
}

/** Values arrive formatted; an arrow joins the sides, and a known side alone stands by itself. */
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

/** Escape inline Markdown, leaving ordinary punctuation such as slug hyphens untouched. */
export const escape = (text: string): string => text.replaceAll(/[\\`*_~|<>[\]]/gu, '\\$&')

/** Arrivals distinguish first discovery and returns from arrivals with unknown history. */
export function arrival(
  previouslyKnown: boolean | undefined,
): 'discovered' | 'relisted' | 'listed' {
  if (previouslyKnown === false) {
    return 'discovered'
  }

  return previouslyKnown === true ? 'relisted' : 'listed'
}

/** A first-ever arrival, as opposed to a return or an arrival with unknown history. */
export function isDiscovery(event: { type: string; previously_known?: boolean }): boolean {
  return event.type.endsWith('_added') && arrival(event.previously_known) === 'discovered'
}

/** Only discoveries carry a marker; headings say what happened to everything else. */
export function lifecycleMarker(event: { type: string; previously_known?: boolean }): string {
  return isDiscovery(event) ? '✨ ' : ''
}
