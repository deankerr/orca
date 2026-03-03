import { ChangeDoc } from '@/convex/feed'

import { EntitySheetTrigger } from '@/components/entity-sheet/entity-sheet'
import { ChangeValuePair } from '@/components/monitor-feed/monitor-feed-values'
import { EndpointUuid } from '@/components/shared/endpoint-uuid'
import { EntityInline } from '@/components/shared/entity-badge'
import { Badge } from '@/components/ui/badge'

export function FeedItem({ change }: { change: ChangeDoc }) {
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
      {'endpoint_uuid' in change && (
        <EndpointUuid
          uuid={change.endpoint_uuid}
          modelSlug={change.model_slug}
          className="mr-2 mb-1"
        />
      )}
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
