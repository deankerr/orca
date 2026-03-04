import { Popover } from '@base-ui/react/popover'

import { Doc } from '@/convex/_generated/dataModel'

import { SpriteIcon } from '@/components/ui/sprite-icon'
import { Attribute, AttributeName, attributes } from '@/lib/attributes'

import { DataList, DataListItem, DataListLabel, DataListValue } from './data-list'
import {
  PopoverCard,
  PopoverCardContent,
  PopoverCardDescription,
  PopoverCardTitle,
  PopoverCardTrigger,
} from './popover-card'
import { RadIconBadge } from './rad-badge'

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
  definition: Attribute
  state?: ReturnType<Attribute['resolve']>
}

export function AttributeBadge({ definition, state }: AttributeBadgeProps) {
  const { icon, label, description, color, key } = definition
  const badge = state?.value
  const details = state?.details

  return (
    <PopoverCardTrigger
      handle={attributePopoverHandle}
      nativeButton={false}
      payload={{ label, description, badge, details }}
      render={<RadIconBadge variant="surface" color={color} aria-label={key} />}
    >
      <SpriteIcon name={icon} className="size-full" />
    </PopoverCardTrigger>
  )
}

// --- Badge set ---

interface AttributeBadgeSetProps {
  endpoint: Doc<'or_views_endpoints'>
  attributes: (AttributeName | AttributeName[])[]
  mode?: 'grid' | 'compact' | 'first'
}

export function AttributeBadgeSet({
  endpoint,
  attributes: attributeItems,
  mode = 'grid',
}: AttributeBadgeSetProps) {
  const components: React.ReactNode[] = []

  for (const item of attributeItems) {
    if (Array.isArray(item)) {
      // Array: resolve in reverse order, render first active one
      let rendered = false
      for (const name of [...item].reverse()) {
        const definition = attributes[name]
        const state = definition.resolve(endpoint)
        if (state.active) {
          components.push(<AttributeBadge key={name} definition={definition} state={state} />)
          rendered = true
          break
        }
      }
      // If none were active and in grid mode, add placeholder
      if (!rendered && mode === 'grid') {
        components.push(<div key={item[0]} className="size-7 shrink-0" />)
      }
    } else {
      // Single attribute: resolve and add
      const name = item
      const definition = attributes[name]
      const state = definition.resolve(endpoint)
      if (state.active) {
        components.push(<AttributeBadge key={name} definition={definition} state={state} />)
        if (mode === 'first') break
      } else if (mode === 'grid') {
        components.push(<div key={name} className="size-7 shrink-0" />)
      }
    }
  }

  return <div className="flex items-center justify-center gap-1">{components}</div>
}
