export async function createContentHash(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  return crypto.subtle
    .digest('SHA-256', bytes)
    .then((digest) =>
      Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    )
}
