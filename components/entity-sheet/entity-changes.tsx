import { ChangeDoc } from '@/convex/feed'

import { ChangeValuePair } from '@/components/monitor-feed/monitor-feed-values'
import { Badge } from '@/components/ui/badge'

import { EntitySheetSection } from './entity-sheet-components'

function getChangeKindDisplayText(kind: string) {
  if (kind === 'create') return 'created'
  if (kind === 'delete') return 'removed'
  return kind
}

export function EntityChanges({
  changes,
  isPending,
}: {
  changes?: ChangeDoc[]
  isPending: boolean
}) {
  return (
    <EntitySheetSection title="Recent Changes">
      {isPending ? (
        <div className="text-sm text-muted-foreground">Loading changes...</div>
      ) : changes && changes.length > 0 ? (
        <div className="space-y-2 font-mono text-xs">
          {changes.map((change) => (
            <div key={change._id} className="rounded-xs border p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="uppercase">{getChangeKindDisplayText(change.change_kind)}</span>
                <span className="text-muted-foreground">
                  {new Date(Number(change.crawl_id)).toLocaleDateString()}
                </span>
              </div>
              {change.path && (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 overflow-hidden *:data-[slot=badge]:text-xs">
                  <Badge
                    variant="outline"
                    className="rounded-sm border-dashed text-xs font-normal text-muted-foreground"
                  >
                    {change.path}
                  </Badge>
                  {change.change_kind === 'update' && (
                    <ChangeValuePair
                      before={change.before}
                      after={change.after}
                      path_level_1={change.path_level_1}
                      path_level_2={change.path_level_2}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No recent changes</div>
      )}
    </EntitySheetSection>
  )
}
