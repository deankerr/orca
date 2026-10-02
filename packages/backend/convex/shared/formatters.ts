// Anonymous change-value formatting. Pricing has its own module.

export function splitPath(path: string): { category: string | null; key: string } {
  const dotIndex = path.indexOf('.')

  if (dotIndex === -1) {
    return { category: null, key: path }
  }

  return { category: path.slice(0, dotIndex), key: path.slice(dotIndex + 1) }
}
