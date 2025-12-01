'use client'

import { MinusIcon, PencilIcon, PlusIcon } from 'lucide-react'

import { api } from '@/convex/_generated/api'
import { ChangeTypeEndpointDoc } from '@/convex/db/or/views/changes'

import { EntityBadge } from '@/components/shared/entity-badge'
import { Badge } from '@/components/ui/badge'
import { useCachedQuery } from '@/hooks/use-cached-query'

import { FeedTreeContent, FeedTreeGroup, FeedTreeItem, FeedTreeTrigger } from './feed-tree-group'

function ChangeItemEntry({ item }: { item: ChangeTypeEndpointDoc }) {
  return (
    <div className="flex items-center gap-2 overflow-hidden">
      <span className="mx-1 size-6 shrink-0 rounded-md border border-yellow-500/20 bg-yellow-500/10 p-1 text-yellow-500">
        <PencilIcon className="size-full" />
      </span>

      <Badge variant="outline" className="font-mono text-muted-foreground">
        {item.path ?? ''}
      </Badge>

      <Badge variant="outline" className="font-mono text-muted-foreground">
        {String(item.before ?? 'undefined')}
      </Badge>

      <Badge variant="outline" className="font-mono text-muted-foreground">
        {String(item.after ?? 'undefined')}
      </Badge>
    </div>
  )
}

export function CreateChanges({ items }: { items: ChangeTypeEndpointDoc[] }) {
  const models = useCachedQuery(api.models.list, {})
  return (
    <>
      {items.map((item) => {
        const modelName = models?.find((m) => m.slug === item.model_slug)?.name ?? ''
        return (
          <div key={item._id} className="flex items-center gap-2">
            <PlusIcon className="size-4 text-green-500" />

            <EntityBadge
              name={modelName}
              slug={item.model_slug}
              className="w-fit rounded-sm border p-2"
            />
          </div>
        )
      })}
    </>
  )
}

export function DeleteChanges({ items }: { items: ChangeTypeEndpointDoc[] }) {
  const models = useCachedQuery(api.models.list, {})
  return (
    <>
      {items.map((item) => {
        const modelName = models?.find((m) => m.slug === item.model_slug)?.name ?? ''
        return (
          <div key={item._id} className="flex items-center gap-2">
            <MinusIcon className="size-4 text-red-500" />

            <EntityBadge
              name={modelName}
              slug={item.model_slug}
              className="w-fit rounded-sm border p-2"
            />
          </div>
        )
      })}
    </>
  )
}

export function UpdateChanges({
  items,
  modelSlug,
  defaultExpanded,
}: {
  items: ChangeTypeEndpointDoc[]
  modelSlug: string
  defaultExpanded?: boolean
}) {
  const models = useCachedQuery(api.models.list, {})
  const modelName = models?.find((m) => m.slug === modelSlug)?.name ?? ''
  const value = `${modelSlug}-updates`
  return (
    <FeedTreeGroup defaultValue={defaultExpanded ? value : undefined}>
      <FeedTreeItem value={value} className="border border-dashed p-2">
        <FeedTreeTrigger>
          <EntityBadge name={modelName} slug={modelSlug} />
        </FeedTreeTrigger>
        <FeedTreeContent className="space-y-2 pt-2">
          {items.map((item) => (
            <ChangeItemEntry key={item._id} item={item} />
          ))}
        </FeedTreeContent>
      </FeedTreeItem>
    </FeedTreeGroup>
  )
}
