import { z } from 'zod'

const Metadata = z.record(z.string(), z.json())

/** Decode extensible facts inside the lens; transport the original text across Convex seams. */
export function decodeMetadata(json: string): z.infer<typeof Metadata> {
  return Metadata.parse(JSON.parse(json))
}
