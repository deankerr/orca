const SEGMENT = /\[\*\]|\[(?<quoted>"(?:[^"\\]|\\.)*")\]/gu
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u

interface ReadablePath {
  parent: string
  leaf: string
}

/**
 * Readable form of a profile JSONPath: `$[*]["pricing"][*]["utc_end"]` becomes `pricing[].utc_end`.
 * Keys that are not plain identifiers keep their quoted bracket form.
 */
export function readablePath(path: string): ReadablePath {
  const segments: string[] = []

  for (const match of path.replace(/^\$\[\*\]/u, '').matchAll(SEGMENT)) {
    const quoted = match.groups?.quoted

    if (quoted === undefined) {
      segments.push('[]')
    } else {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: The profiler writes keys with JSON.stringify.
      const key = JSON.parse(quoted) as string
      segments.push(IDENTIFIER.test(key) ? `.${key}` : `[${quoted}]`)
    }
  }

  const leaf = segments.pop() ?? ''
  const parent = segments.join('').replace(/^\./u, '')

  return { leaf: parent === '' ? leaf.replace(/^\./u, '') : leaf, parent }
}
