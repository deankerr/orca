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
  const key = code(label, { width })
  const heading = change === 'removed' ? strike(key) : key
  const value = change === 'removed' ? strike(children) : children
  const marker = change === 'added' ? ' · new' : ''

  return layout === 'block' ? `${heading}${marker}\n${value}` : `${heading} ${value}${marker}`
}

/** Keep quote markers outside strikethrough so removed prose retains its block layout. */
function strike(children: string): string {
  return children
    .split('\n')
    .map((line) => (line.startsWith('> ') ? `> ~~${line.slice(2)}~~` : `~~${line}~~`))
    .join('\n')
}

/** Values arrive formatted; changed old values are struck, while single values stand alone. */
export function valueChange(
  before: string | undefined,
  after: string | undefined,
  { annotation = '' }: { annotation?: string } = {},
): string {
  const values = [before === undefined || after === undefined ? before : strike(before), after]
    .filter((value) => value !== undefined)
    .join(' → ')

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
