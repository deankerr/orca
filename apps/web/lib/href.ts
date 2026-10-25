export function pickParams(from: URLSearchParams, keys: readonly string[]): URLSearchParams {
  const next = new URLSearchParams()

  for (const key of keys) {
    for (const value of from.getAll(key)) {
      next.append(key, value)
    }
  }

  return next
}

export function href(path: string, params: URLSearchParams): string {
  const search = params.toString()

  return search === '' ? path : `${path}?${search}`
}
