'use client'

import Link from 'next/link'

import { usePaginatedQuery } from 'convex/react'
import z from 'zod'

import { Database, Download } from 'lucide-react'
import prettyBytes from 'pretty-bytes'

import { api } from '@/convex/_generated/api'
import { Doc } from '@/convex/_generated/dataModel'

import {
  PageContainer,
  PageDescription,
  PageHeader,
  PageTitle,
} from '@/components/app-layout/pages'
import { CopyToClipboardButton } from '@/components/shared/copy-to-clipboard-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTimeUTC, formatRelativeTime } from '@/lib/formatters'
import { getConvexHttpUrl } from '@/lib/utils'

export default function Page() {
  const archives = usePaginatedQuery(api.admin.archives.feed, {}, { initialNumItems: 20 })

  return (
    <PageContainer className="pb-4">
      <PageHeader>
        <PageTitle>Archives</PageTitle>
        <PageDescription>
          Historical snapshots of OpenRouter model data and metadata
        </PageDescription>
      </PageHeader>

      <div className="space-y-4">
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
  const downloadUrl = getConvexHttpUrl(`/bundle?crawl_id=${archive.crawl_id}`)

  return (
    <Card className="gap-3 py-3">
      <CardHeader className="border-b px-3 pb-1">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-muted">
              <Database className="size-4" />
            </div>
            <div className="space-y-1">
              <CardTitle className="font-mono">
                {formatDateTimeUTC(Number(archive.crawl_id))}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {formatRelativeTime(Number(archive.crawl_id))}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <CopyToClipboardButton
              size="sm"
              variant="secondary"
              className="font-mono"
              value={archive.crawl_id}
            >
              {archive.crawl_id}
            </CopyToClipboardButton>
            <Button asChild variant="outline" size="sm">
              <Link href={downloadUrl} prefetch={false}>
                <Download className="size-4" />
                Download
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-3">
        {/* Size Information */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Raw:</span>
            <Badge variant="secondary">
              {metadata.size?.raw ? prettyBytes(metadata.size.raw) : 'Unknown'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Blob:</span>
            <Badge variant="secondary">
              {metadata.size?.blob ? prettyBytes(metadata.size.blob) : 'Unknown'}
            </Badge>
          </div>
        </div>

        {/* Collection Summary  */}
        {metadata.totals && Object.keys(metadata.totals).length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-medium">Collection Summary</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(metadata.totals).map(([key, value]) => (
                <Badge key={key} variant="outline" className="font-mono">
                  {key}: {typeof value === 'number' ? value.toLocaleString() : String(value)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Raw Metadata  */}
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
            Raw Metadata
          </summary>
          <pre className="mt-2 overflow-auto rounded bg-muted p-3 text-xs">
            {JSON.stringify(archive.data, null, 2)}
          </pre>
        </details>
      </CardContent>
    </Card>
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
