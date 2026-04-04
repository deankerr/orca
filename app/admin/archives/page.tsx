'use client'

import Link from 'next/link'

import { usePaginatedQuery } from 'convex/react'
import z from 'zod'

import { Database, Download } from 'lucide-react'
import prettyBytes from 'pretty-bytes'

import { api } from '@/convex/_generated/api'
import { Doc } from '@/convex/_generated/dataModel'

import { PageContainer, PageHeader, PageTitle } from '@/components/app-layout/pages'
import { CopyToClipboardButton } from '@/components/shared/copy-to-clipboard-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTimeUTC, formatRelativeTime } from '@/lib/formatters'
import { getConvexHttpUrl } from '@/lib/utils'

export default function Page() {
  const archives = usePaginatedQuery(api.admin.archives.feed, {}, { initialNumItems: 40 })

  return (
    <PageContainer>
      <PageHeader>
        <PageTitle>Archives</PageTitle>
      </PageHeader>

      <div className="space-y-4 py-2 sm:px-4">
        {archives.results.map((data) => (
          <ArchiveCard key={data._id} archive={data} />
        ))}

        <Button
          variant="secondary"
          className="mx-auto block"
          onClick={() => archives.loadMore(40)}
          disabled={archives.status !== 'CanLoadMore'}
        >
          {archives.status === 'CanLoadMore'
            ? 'Load More'
            : archives.status === 'Exhausted'
              ? 'Exhausted'
              : 'Loading...'}
        </Button>
      </div>
    </PageContainer>
  )
}

function ArchiveCard({ archive }: { archive: Doc<'snapshot_crawl_archives'> }) {
  const metadata = readMetadata(archive)
  const visibleTotals = Object.entries(metadata.totals ?? {}).filter(([, value]) =>
    typeof value === 'number' ? value > 0 : Boolean(value),
  )
  const downloadUrl = getConvexHttpUrl(`/bundle?crawl_id=${archive.crawl_id}`)

  return (
    <section className="border bg-card p-2">
      <div className="flex flex-col gap-2.5">
        {/* header */}
        <div className="flex justify-between gap-2">
          <div className="flex min-w-0 gap-3">
            <div className="flex size-5 shrink-0 items-center justify-center">
              <Database className="size-3.5" />
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="font-mono text-sm">
                  {formatDateTimeUTC(Number(archive.crawl_id))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatRelativeTime(Number(archive.crawl_id))}
                </div>
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
                <div>
                  raw:{' '}
                  <span className="text-foreground">
                    {metadata.size?.raw ? prettyBytes(metadata.size.raw) : 'Unknown'}
                  </span>
                </div>
                <div>
                  blob:{' '}
                  <span className="text-foreground">
                    {metadata.size?.blob ? prettyBytes(metadata.size.blob) : 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start">
            <CopyToClipboardButton
              size="sm"
              variant="secondary"
              className="font-mono text-xs"
              value={archive.crawl_id}
            >
              {archive.crawl_id}
            </CopyToClipboardButton>

            <Button asChild variant="outline" size="icon-sm">
              <Link href={downloadUrl} prefetch={false}>
                <Download />
              </Link>
            </Button>
          </div>
        </div>

        {/* totals */}
        {visibleTotals.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {visibleTotals.map(([key, value]) => (
              <Badge key={key} variant="outline" className="rounded-sm bg-background/40 font-mono">
                {key}: {typeof value === 'number' ? value.toLocaleString() : String(value)}
              </Badge>
            ))}
          </div>
        )}

        {/* raw */}
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
            Raw Metadata
          </summary>
          <pre className="mt-2 overflow-auto rounded bg-muted p-3 text-xs">
            {JSON.stringify(archive.data, null, 2)}
          </pre>
        </details>
      </div>
    </section>
  )
}

const ArchiveMetadataSchema = z.object({
  size: z
    .object({
      blob: z.number(),
      raw: z.number(),
    })
    .optional(),

  totals: z.record(z.string(), z.any()).optional(),
})

function readMetadata(
  archive: Doc<'snapshot_crawl_archives'>,
): z.infer<typeof ArchiveMetadataSchema> {
  const result = ArchiveMetadataSchema.safeParse(archive.data)
  return result.data ?? {}
}
