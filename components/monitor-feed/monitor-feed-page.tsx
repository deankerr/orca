'use client'

import { usePaginatedQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '@/convex/_generated/api'
import { ChangeDoc } from '@/convex/feed'

import { EntitySheetTrigger } from '@/components/entity-sheet/entity-sheet'
import { ChangeValuePair } from '@/components/monitor-feed/monitor-feed-values'
import { EntityInline } from '@/components/shared/entity-badge'
import { PaginatedLoadButton } from '@/components/shared/paginated-load-button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll'
import { formatDateTime, formatRelativeTime } from '@/lib/formatters'
import { cn } from '@/lib/utils'

export function MonitorFeed() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.feed.changesByCrawlId,
    {},
    { initialNumItems: 50, customPagination: true },
  )

  const viewportRef = useInfiniteScroll(() => loadMore(1), {
    hasMore: status === 'CanLoadMore',
    threshold: 1400,
  })

  return (
    <ScrollArea className="flex-1 rounded-none" viewportRef={viewportRef} maskHeight={10}>
      <div className="mx-auto max-w-7xl space-y-8 px-2 py-6 sm:px-6">
        {results.map(({ crawl_id, data: changes }) => (
          <div key={crawl_id} className="space-y-5 text-sm">
            <TimelineMarker crawl_id={crawl_id} />

            <ul className="ml-2 list-disc space-y-4 font-mono leading-loose text-muted-foreground sm:pl-2">
              {changes.map((change: ChangeDoc) => (
                <FeedItem key={change._id} change={change} />
              ))}
            </ul>
          </div>
        ))}

        <div className="flex items-center justify-center py-4">
          <PaginatedLoadButton status={status} onClick={() => loadMore(1)} />
        </div>
      </div>
    </ScrollArea>
  )
}

function TimelineMarker({ crawl_id, className }: { crawl_id: string; className?: string }) {
  const timestamp = Number(crawl_id)
  const localTime = formatDateTime(timestamp)

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="h-px flex-1 border-b border-dashed" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="font-mono">
            {formatRelativeTime(timestamp)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="font-mono">{localTime}</TooltipContent>
      </Tooltip>
      <div className="h-px flex-1 border-b border-dashed" />
    </div>
  )
}

function FeedItem({ change }: { change: ChangeDoc }) {
  const actionText =
    change.change_kind === 'create' ? (
      <span className="text-green-400">created</span>
    ) : change.change_kind === 'delete' ? (
      <span className="text-rose-400">removed</span>
    ) : (
      'updated: '
    )

  return (
    <li className="[&>span]:font-normal">
      {change.entity_type !== 'endpoint' && `${change.entity_type} `}
      {change.entity_type === 'provider' && (
        <EntitySheetTrigger type="provider" slug={change.provider_slug} asChild>
          <EntityInline
            slug={change.provider_slug}
            className="text-primary underline decoration-primary/40 decoration-dotted underline-offset-3"
          />
        </EntitySheetTrigger>
      )}
      {'provider_tag_slug' in change && (
        <EntitySheetTrigger type="provider" slug={change.provider_slug} asChild>
          <EntityInline
            slug={change.provider_tag_slug}
            className="text-primary underline decoration-primary/40 decoration-dotted underline-offset-3"
          />
        </EntitySheetTrigger>
      )}
      {change.entity_type === 'endpoint' && ' endpoint for '}
      {'model_slug' in change && (
        <EntitySheetTrigger type="model" slug={change.model_slug} asChild>
          <EntityInline
            slug={change.model_slug}
            className="text-primary underline decoration-primary/40 decoration-dotted underline-offset-3"
          />
        </EntitySheetTrigger>
      )}{' '}
      was {actionText}
      {change.change_kind === 'update' && (
        <>
          <Badge variant="outline" className="rounded-sm border-dashed text-sm text-foreground/80">
            {change.path}
          </Badge>{' '}
          <ChangeValuePair
            before={change.before}
            after={change.after}
            path_level_1={change.path_level_1}
            path_level_2={change.path_level_2}
          />
        </>
      )}
    </li>
  )
}
