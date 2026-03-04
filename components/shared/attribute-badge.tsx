import { Popover } from '@base-ui/react/popover'

import { Doc } from '@/convex/_generated/dataModel'

import { Attribute, AttributeSlots, resolveEndpointAttributeSlot } from '@/lib/attributes'

import { DataList, DataListItem, DataListLabel, DataListValue } from './data-list'
import {
  PopoverCard,
  PopoverCardContent,
  PopoverCardDescription,
  PopoverCardTitle,
  PopoverCardTrigger,
} from './popover-card'
import { SpriteIconBadge } from './sprite-icon-badge'

// --- Singleton popover: one shared Root for all attribute badges ---

interface AttributePopoverPayload {
  label: string
  description: React.ReactNode
  badge?: string
  details?: { label?: string; value: string }[]
}

const attributePopoverHandle = Popover.createHandle<AttributePopoverPayload>()

export function AttributePopoverProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PopoverCard handle={attributePopoverHandle}>
        {({ payload }) => (
          <PopoverCardContent className="max-w-72">
            <PopoverCardTitle>
              {payload?.label}
              {payload?.badge && <span className="font-mono text-[95%]">{payload.badge}</span>}
            </PopoverCardTitle>

            <PopoverCardDescription>{payload?.description}</PopoverCardDescription>

            {payload?.details && payload.details.length > 0 && (
              <DataList className="mt-2 space-y-0.5">
                {payload.details.map((item, i) => (
                  <DataListItem key={i}>
                    {item.label && (
                      <DataListLabel className="uppercase">{item.label}</DataListLabel>
                    )}
                    <DataListValue>{item.value}</DataListValue>
                  </DataListItem>
                ))}
              </DataList>
            )}
          </PopoverCardContent>
        )}
      </PopoverCard>
    </>
  )
}

// --- Badge: lightweight trigger only (no Root, no Portal) ---

interface AttributeBadgeProps {
  attribute: Attribute
  data?: ReturnType<Attribute['resolve']>
}

export function AttributeBadge({ attribute, data }: AttributeBadgeProps) {
  const { icon, label, description, color, key } = attribute
  const badge = data?.value
  const details = data?.details

  return (
    <PopoverCardTrigger
      handle={attributePopoverHandle}
      nativeButton={false}
      payload={{ label, description, badge, details }}
      render={<SpriteIconBadge icon={icon} color={color} aria-label={key} />}
    />
  )
}

// --- Badge set ---

interface AttributeBadgeSetProps {
  endpoint: Doc<'or_views_endpoints'>
  slots: AttributeSlots
  reserve?: boolean
}

export function AttributeBadgeSet({ endpoint, slots, reserve = false }: AttributeBadgeSetProps) {
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
            />
          )
        }

        if (reserve) {
          return <div key={`slot:${index}`} className="size-7 shrink-0" />
        }
      })}
    </div>
  )
}
