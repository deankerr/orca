/**
 * Paths stored on R2. Edit this set to send a path to R2; everything else uses
 * Convex file storage.
 */
const R2_PATHS: ReadonlySet<string> = new Set(['analytics', 'scans', 'top-apps'])

/** Byte store a path writes to. Load uses the locator, not this. */
export type ObjectBackend = 'convex' | 'r2'

/**
 * Which byte store new writes for this path use.
 *
 * Existing objects are read from their locator, so changing this set does not
 * migrate old objects.
 */
export function backendFor(path: string): ObjectBackend {
  return R2_PATHS.has(path) ? 'r2' : 'convex'
}
