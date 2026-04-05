import type { ORCAEndpoint } from '@/convex/db/or/views/endpoints'
import type { Attribute, AttributeSlots, AttributeState } from '@/lib/attributes'
import { resolveEndpointAttributeSlot } from '@/lib/attributes'

import { DataList, DataListItem, DataListLabel, DataListValue } from './data-list'
import {
  PopoverCardContent,
  PopoverCardDescription,
  PopoverCardTitle,
  PopoverCardTrigger,
} from './popover-card'
import { SpriteIconBadge } from './sprite-icon-badge'

// --- Popover content ---

export function AttributeBadgePopoverContent({
  label,
  description,
  badge,
  details,
}: {
  label: string
  description: React.ReactNode
  badge?: string
  details?: { label?: string; value: string }[]
}) {
  return (
    <PopoverCardContent className="max-w-72">
      <PopoverCardTitle>
        {label}
        {badge !== undefined && badge !== '' && (
          <span className="font-mono text-[95%]">{badge}</span>
        )}
      </PopoverCardTitle>

      <PopoverCardDescription>{description}</PopoverCardDescription>

      {details !== undefined && details.length > 0 && (
        <DataList className="mt-2 space-y-0.5">
          {details.map((item, i) => (
            <DataListItem key={i}>
              {item.label !== undefined && item.label !== '' && (
                <DataListLabel className="uppercase">{item.label}</DataListLabel>
              )}
              <DataListValue>{item.value}</DataListValue>
            </DataListItem>
          ))}
        </DataList>
      )}
    </PopoverCardContent>
  )
}

// --- Badge ---

export function AttributeBadge({
  attribute,
  data,
  ...props
}: {
  attribute: Attribute
  data?: AttributeState
} & React.ComponentProps<typeof PopoverCardTrigger>) {
  const { icon, label, description, color, key } = attribute
  const badge = data?.value
  const details = data?.details

  return (
    <PopoverCardTrigger
      nativeButton={false}
      payload={{ type: 'attribute', label, description, badge, details }}
      render={<SpriteIconBadge icon={icon} color={color} aria-label={key} />}
      {...props}
    />
  )
}

// --- Badge set ---

export function AttributeBadgeSet({
  endpoint,
  slots,
  reserve = false,
  handle,
}: {
  endpoint: ORCAEndpoint
  slots: AttributeSlots
  reserve?: boolean
  handle: React.ComponentProps<typeof PopoverCardTrigger>['handle']
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      {slots.map((slot, index) => {
        const resolved = resolveEndpointAttributeSlot(endpoint, slot)
        if (resolved) {
          return (
            <AttributeBadge
              key={`${resolved.attribute.key}:${index}`}
              attribute={resolved.attribute}
              data={resolved.data}
              handle={handle}
            />
          )
        }

        if (reserve) {
          return <div key={`slot:${index}`} className="size-7 shrink-0" />
        }

        return null
      })}
    </div>
  )
}
