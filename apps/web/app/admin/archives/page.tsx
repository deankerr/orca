'use client'

import { api } from '@orca/backend/convex/_generated/api'
import type { Doc } from '@orca/backend/convex/_generated/dataModel'
import { usePaginatedQuery } from 'convex/react'
import { formatDistanceToNow } from 'date-fns'
import { ArchiveIcon, BoxesIcon, DownloadIcon, GitBranchIcon, PackageCheckIcon } from 'lucide-react'
import Link from 'next/link'
import prettyBytes from 'pretty-bytes'
import { z } from 'zod'

import { PageContainer, PageHeader, PageTitle } from '@/components/app-layout/pages'
import { CopyToClipboardButton } from '@/components/shared/copy-to-clipboard-button'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { getConvexHttpUrl } from '@/lib/utils'

const PAGE_SIZE = 40

export default function Page() {
  const archives = usePaginatedQuery(api.admin.archives.feed, {}, { initialNumItems: PAGE_SIZE })
  const isLoadingFirstPage = archives.status === 'LoadingFirstPage'
  const isLoadingMore = archives.status === 'LoadingMore'
  const isExhausted = archives.status === 'Exhausted'

  return (
    <PageContainer>
      <PageHeader className="gap-0.5">
        <PageTitle>Archives</PageTitle>
        <p className="text-xs text-muted-foreground">Downloadable crawl snapshots, newest first.</p>
      </PageHeader>

      <div className="w-full max-w-5xl space-y-3 py-2 sm:px-4">
        {isLoadingFirstPage ? <ArchiveListSkeleton /> : null}

        {archives.results.length > 0 ? (
          <div className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
            <div className="hidden grid-cols-[minmax(15rem,1.35fr)_minmax(15rem,1fr)_8rem_auto] items-center gap-4 bg-muted/40 px-4 py-2 text-[0.5625rem] font-medium tracking-wide text-muted-foreground uppercase md:grid">
              <span>Snapshot</span>
              <span>Contents</span>
              <span>Bundle</span>
              <span className="sr-only">Actions</span>
            </div>
            <div className="divide-y divide-foreground/10">
              {archives.results.map((archive, index) => (
                <ArchiveRow key={archive._id} archive={archive} isLatest={index === 0} />
              ))}
            </div>
          </div>
        ) : null}

        {isExhausted && archives.results.length === 0 ? <ArchivesEmptyState /> : null}

        {archives.results.length > 0 ? (
          <ArchiveListFooter
            isExhausted={isExhausted}
            isLoadingMore={isLoadingMore}
            onLoadMore={() => {
              archives.loadMore(PAGE_SIZE)
            }}
          />
        ) : null}
      </div>
    </PageContainer>
  )
}

function ArchiveRow({
  archive,
  isLatest,
}: {
  archive: Doc<'snapshot_crawl_archives'>
  isLatest: boolean
}) {
  const metadata = readMetadata(archive)
  const downloadUrl = getConvexHttpUrl(`/bundle?crawl_id=${archive.crawl_id}`)
  const timestamp = Number(archive.crawl_id)

  return (
    <article className="relative grid gap-3 px-3 py-3.5 transition-colors hover:bg-muted/25 md:grid-cols-[minmax(15rem,1.35fr)_minmax(15rem,1fr)_8rem_auto] md:items-center md:gap-4 md:px-4">
      {isLatest ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
        />
      ) : null}

      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <ArchiveIcon className="size-4" />
          {isLatest ? (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-card" />
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <time
              dateTime={new Date(timestamp).toISOString()}
              className="font-mono text-sm font-medium tabular-nums"
            >
              {formatArchiveTimeUTC(timestamp)}
            </time>
            {isLatest ? (
              <span className="text-[0.5625rem] font-medium tracking-wide text-primary uppercase">
                Latest
              </span>
            ) : null}
          </div>
          <p className="text-[0.6875rem] text-muted-foreground">
            {formatDistanceToNow(timestamp, { addSuffix: true })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ArchiveCount icon={BoxesIcon} label="Models" value={metadata.totals?.models} />
        <ArchiveCount icon={GitBranchIcon} label="Endpoints" value={metadata.totals?.endpoints} />
      </div>

      <div className="flex items-baseline gap-1.5 md:block">
        <span className="text-[0.5625rem] font-medium tracking-wide text-muted-foreground uppercase md:hidden">
          Bundle
        </span>
        <span className="font-mono text-xs font-medium tabular-nums">
          {formatOptionalBytes(metadata.size?.blob)}
        </span>
        <span className="text-[0.625rem] text-muted-foreground">gzip</span>
      </div>

      <div className="flex items-center gap-1.5 md:justify-end">
        <CopyToClipboardButton
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground"
          value={archive.crawl_id}
          aria-label={`Copy crawl ID ${archive.crawl_id}`}
        />

        <Button
          variant={isLatest ? 'default' : 'outline'}
          size="sm"
          render={<Link href={downloadUrl} prefetch={false} />}
          nativeButton={false}
        >
          <DownloadIcon data-icon="inline-start" />
          Download
        </Button>
      </div>
    </article>
  )
}

function ArchiveCount({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BoxesIcon
  label: string
  value: number | undefined
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="font-mono text-xs font-medium tabular-nums">
          {value?.toLocaleString() ?? '—'}
        </div>
        <div className="text-[0.5625rem] leading-none text-muted-foreground">{label}</div>
      </div>
    </div>
  )
}

function ArchiveListSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10"
      aria-label="Loading archives"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="h-[5.25rem] rounded-none border-b last:border-b-0" />
      ))}
    </div>
  )
}

function ArchivesEmptyState() {
  return (
    <Empty className="min-h-64 bg-muted/20 ring-1 ring-foreground/10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageCheckIcon />
        </EmptyMedia>
        <EmptyTitle>No archives yet</EmptyTitle>
        <EmptyDescription>
          Crawl bundles will appear here after the first snapshot.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function ArchiveListFooter({
  isExhausted,
  isLoadingMore,
  onLoadMore,
}: {
  isExhausted: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
}) {
  if (isExhausted) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
        <PackageCheckIcon className="size-3.5" />
        End of archive history
      </div>
    )
  }

  return (
    <div className="flex justify-center py-2">
      <Button variant="secondary" onClick={onLoadMore} disabled={isLoadingMore}>
        {isLoadingMore ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <ArchiveIcon data-icon="inline-start" />
        )}
        {isLoadingMore ? 'Loading…' : `Load ${PAGE_SIZE} more`}
      </Button>
    </div>
  )
}

const ArchiveMetadataSchema = z.object({
  size: z
    .object({
      blob: z.number(),
      raw: z.number(),
    })
    .optional(),

  totals: z
    .object({
      endpoints: z.number().optional(),
      models: z.number().optional(),
    })
    .optional(),
})

function readMetadata(
  archive: Doc<'snapshot_crawl_archives'>,
): z.infer<typeof ArchiveMetadataSchema> {
  const result = ArchiveMetadataSchema.safeParse(archive.data)
  return result.data ?? {}
}

function formatOptionalBytes(value: number | undefined): string {
  return value === undefined ? 'Unknown' : prettyBytes(value)
}

function formatArchiveTimeUTC(timestamp: number): string {
  return new Date(timestamp)
    .toLocaleString('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    })
    .replace(',', '')
}
