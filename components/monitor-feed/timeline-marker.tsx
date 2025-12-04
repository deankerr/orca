import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateTime, formatRelativeTime } from '@/lib/formatters'
import { cn } from '@/lib/utils'

import { FeatureFlag } from '../dev-utils/feature-flag'
import { CopyToClipboardButton } from '../shared/copy-to-clipboard-button'

export function TimelineMarker({ crawl_id, className }: { crawl_id: string; className?: string }) {
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
      <FeatureFlag flag="dev">
        <CopyToClipboardButton
          size="icon-sm"
          className="-my-4"
          variant="secondary"
          value={crawl_id}
        />
      </FeatureFlag>
    </div>
  )
}
