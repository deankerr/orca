import type { FieldValue } from './curate'

export function fact(facts: Record<string, FieldValue>, path: string): FieldValue | undefined {
  const [key = '', child] = path.split('.')
  const parent = facts[key]

  if (child === undefined) {
    return parent
  }

  return parent !== null && typeof parent === 'object' && !Array.isArray(parent)
    ? parent[child]
    : undefined
}
