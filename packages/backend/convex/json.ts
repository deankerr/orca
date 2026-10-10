import { z } from 'zod'

export const JsonObject = z.record(z.string(), z.json())
export const JsonObjectFromString = z
  .string()
  .transform((json) => JsonObject.parse(JSON.parse(json)))

export type JsonValue = z.infer<ReturnType<typeof z.json>>
