const SEGMENT = /\[\*\]|\[(?<quoted>"(?:[^"\\]|\\.)*")\]/gu
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u

/**
 * Readable form of a profile JSONPath: `$[*]["pricing"][*]["utc_end"]` becomes `pricing[].utc_end`.
 * Keys that are not plain identifiers keep their quoted bracket form.
 */
export function readablePath(path: string): { parent: string; leaf: string } {
  const segments: string[] = []

  for (const match of path.replace(/^\$\[\*\]/u, '').matchAll(SEGMENT)) {
    const quoted = match.groups?.quoted

    if (quoted === undefined) {
      segments.push('[]')
    } else {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The profiler writes keys with JSON.stringify.
      const key = JSON.parse(quoted) as string
      segments.push(IDENTIFIER.test(key) ? `.${key}` : `[${quoted}]`)
    }
  }

  const leaf = segments.pop() ?? ''
  const parent = segments.join('').replace(/^\./u, '')
  return { leaf: parent === '' ? leaf.replace(/^\./u, '') : leaf, parent }
}
