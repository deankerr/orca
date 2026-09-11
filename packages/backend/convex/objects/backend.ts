import { env } from '../_generated/server'

/** Byte store for new writes. Existing objects are read from their locator. */
export type ObjectBackend = 'convex' | 'r2'

/** Convex storage is the default; deployments opt into R2 explicitly. */
export function backendFor(): ObjectBackend {
  return env.ORCA_OBJECTS_BACKEND ?? 'convex'
}
