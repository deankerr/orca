import type { EndpointProjection } from '@orca/backend/convex/catalog/endpoints'

import type { Attribute, AttributeSlots, AttributeState } from '@/lib/attributes'
import { resolveEndpointAttributeSlot } from '@/lib/attributes'

import { ColorIconBadge } from './color-icon-badge'
import { DataList, DataListItem, DataListLabel, DataListValue } from './data-list'
import {
  PopoverCardContent,
  PopoverCardDescription,
  PopoverCardTitle,
  PopoverCardTrigger,
} from './popover-card'

type EndpointProjectionLike = Omit<EndpointProjection, '_id'> & { _id: string }

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
          {details.map((item) => (
            <DataListItem key={`${item.label ?? ''}:${item.value}`}>
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

function AttributeBadge({
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
      render={<ColorIconBadge icon={icon} color={color} aria-label={key} />}
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
  endpoint: EndpointProjectionLike
  slots: AttributeSlots
  reserve?: boolean
  handle: React.ComponentProps<typeof PopoverCardTrigger>['handle']
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      {slots.map((slot) => {
        const slotKey = slot.join('|')
        const resolved = resolveEndpointAttributeSlot(endpoint, slot)
        if (resolved) {
          return (
            <AttributeBadge
              key={`${resolved.attribute.key}:${slotKey}`}
              attribute={resolved.attribute}
              data={resolved.data}
              handle={handle}
            />
          )
        }

        if (reserve) {
          return <div key={`slot:${slotKey}`} className="size-6 shrink-0" />
        }

        return null
      })}
    </div>
  )
}
