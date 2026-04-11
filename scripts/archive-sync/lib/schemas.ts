import { z } from 'zod'

export const availableDailyArchiveSchema = z.looseObject({
  status: z.literal('available'),
  crawl_id: z.string(),
  day: z.string(),
  size: z
    .looseObject({
      blob: z.number().optional(),
      raw: z.number().optional(),
    })
    .nullable()
    .optional(),
  totals: z.record(z.string(), z.number()).nullable().optional(),
})

export const missingDailyArchiveSchema = z.looseObject({
  status: z.literal('missing_full_bundle'),
  day: z.string(),
})

export const dailyArchiveEntrySchema = z.union([
  availableDailyArchiveSchema,
  missingDailyArchiveSchema,
])

export const dailyArchivesResponseSchema = z.array(dailyArchiveEntrySchema)

export const localBundleSchema = z.looseObject({
  crawl_id: z.string(),
  data: z.looseObject({
    models: z.array(z.unknown()),
    providers: z.array(z.unknown()),
  }),
})

export const manifestArchiveSchema = z.looseObject({
  crawlId: z.string(),
  day: z.string(),
  downloadedAt: z.string().nullable(),
  fileGzip: z.string(),
  size: z
    .looseObject({
      blob: z.number().optional(),
      raw: z.number().optional(),
    })
    .nullable()
    .optional(),
  totals: z.record(z.string(), z.number()).nullable().optional(),
})

export const manifestSchema = z.looseObject({
  version: z.literal(1),
  targetUrl: z.string().nullable(),
  archives: z.array(manifestArchiveSchema),
  latest: z
    .looseObject({
      crawlId: z.string(),
      fileJson: z.string(),
      updatedAt: z.string(),
    })
    .nullable()
    .optional(),
})

export type DailyArchive = z.infer<typeof availableDailyArchiveSchema>
export type DailyArchiveEntry = z.infer<typeof dailyArchiveEntrySchema>
export type ManifestArchive = z.infer<typeof manifestArchiveSchema>
export type ManifestPointer = {
  crawlId: string
  fileJson: string
  updatedAt: string
}
export type Manifest = {
  version: 1
  targetUrl: string | null
  archives: ManifestArchive[]
  latest: ManifestPointer | null
}
export type LocalArchive = {
  absolutePath: string
  crawlId: string
  day: string
  fileGzip: string
}
export type SyncOptions = {
  days: number
  dryRun: boolean
  force: boolean
  outputDir?: string
  targetUrl?: string
}
export type UnzipOptions = {
  crawlId?: string
  day?: string
  outputDir?: string
  targetUrl?: string
}
