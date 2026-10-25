import { OpenAPIHono } from '@hono/zod-openapi'
import type { Hook } from '@hono/zod-openapi'
import type { Endpoint } from '@orca/contract/endpoint'
import type { Model } from '@orca/contract/model'
import type { Provider } from '@orca/contract/provider'
import type { Env } from 'hono'
import { z } from 'zod'

/** One consistent read of the Catalog at the ORCA clock. */
export interface Catalog {
  as_at: string | null
  endpoints: Endpoint[]
  models: Model[]
  providers: Provider[]
}

export type LoadCatalog = () => Promise<Catalog>

const Problem = z
  .object({
    detail: z.string().optional(),
    status: z.number().int(),
    title: z.string(),
  })
  .meta({ description: 'RFC 9457 problem details.', id: 'Problem' })

export const problem = (description: string) => ({
  content: { 'application/problem+json': { schema: Problem } },
  description,
})

export const problemHeaders = { 'Content-Type': 'application/problem+json' }

export const notFound = (title: string, detail: string) => ({ detail, status: 404, title })

// A URL's representation changes only when the hourly ORCA clock advances.
export const cached = {
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
}

const AsAt = z.iso
  .datetime()
  .nullable()
  .meta({
    description:
      'ORCA clock: the scan time through which this response represents knowledge. ' +
      'Scans are hourly, so upstream can have changed up to an hour since.',
  })

export const Paging = z.object({
  limit: z.coerce.number().int().min(1).max(2000).default(100).meta({ description: 'Page size.' }),
  offset: z.coerce.number().int().nonnegative().default(0).meta({
    description: 'Results to skip. Offsets are stable for one `as_at`.',
  }),
})

type Paging = z.infer<typeof Paging>

export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({
    as_at: AsAt,
    data: z.array(item),
    next: z.string().nullable().meta({ description: 'URL of the next page, or null on the last.' }),
    total: z.number().int().meta({ description: 'Results matching the selection.' }),
  })
}

export function oneOf<T extends z.ZodType>(item: T) {
  return z.object({ as_at: AsAt, data: item })
}

/** Slice a complete selection, continuing from the request URL. */
export function paginate<T>(url: string, asAt: string | null, selected: T[], paging: Paging) {
  const end = paging.offset + paging.limit
  const nextUrl = new URL(url)
  nextUrl.searchParams.set('offset', String(end))
  return {
    as_at: asAt,
    data: selected.slice(paging.offset, end),
    next: end < selected.length ? nextUrl.href : null,
    total: selected.length,
  }
}

const invalidParameters: Hook<unknown, Env, string, unknown> = (result, c) =>
  result.success
    ? undefined
    : c.json(
        { detail: z.prettifyError(result.error), status: 400, title: 'Invalid parameters' },
        400,
        problemHeaders,
      )

/** Routers share validation failures as problem details. */
export function createRouter() {
  return new OpenAPIHono({ defaultHook: invalidParameters })
}

export const ModelPath = z.object({
  author: z.string().meta({ description: 'Model author slug.', example: 'moonshotai' }),
  slug: z.string().meta({
    description: 'Remainder of the model slug, verbatim, including any `:variant` suffix.',
    example: 'kimi-k3',
  }),
})
