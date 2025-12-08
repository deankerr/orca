import { Popover } from '@base-ui-components/react/popover'

import { Doc } from '@/convex/_generated/dataModel'

import { SpriteIcon } from '@/components/ui/sprite-icon'
import { Attribute, AttributeName, attributes } from '@/lib/attributes'

import { DataList, DataListItem, DataListLabel, DataListValue } from './data-list'
import { RadIconBadge } from './rad-badge'

interface AttributeBadgeProps {
  definition: Attribute
  state?: ReturnType<Attribute['resolve']>
}

export function AttributeBadge({ definition, state }: AttributeBadgeProps) {
  const { icon, label, description, color, key } = definition
  const badge = state?.value
  const details = state?.details

  return (
    <Popover.Root>
      <Popover.Trigger
        render={<RadIconBadge variant="surface" color={color} aria-label={key} />}
        openOnHover
        delay={0}
        closeDelay={0}
        nativeButton={false}
      >
        <SpriteIcon name={icon} className="size-full" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={8}>
          <Popover.Popup className="max-w-72 origin-[var(--transform-origin)] rounded-lg bg-[canvas] px-4 py-3 text-foreground shadow-lg outline outline-border dark:-outline-offset-1">
            <Popover.Arrow className="data-[side=bottom]:top-[-8px] data-[side=left]:right-[-13px] data-[side=left]:rotate-90 data-[side=right]:left-[-13px] data-[side=right]:-rotate-90 data-[side=top]:bottom-[-8px] data-[side=top]:rotate-180">
              <ArrowSvg />
            </Popover.Arrow>

            <div className="mb-1 flex items-center justify-between gap-4">
              <Popover.Title className="text-sm font-medium">{label}</Popover.Title>
              {badge && <span className="font-mono text-[95%]">{badge}</span>}
            </div>

            <Popover.Description className="font-sans text-sm text-muted-foreground">
              {description}
            </Popover.Description>

            {details && details.length > 0 && (
              <DataList className="mt-2 space-y-0.5">
                {details.map((item, i) => (
                  <DataListItem key={i}>
                    {item.label && (
                      <DataListLabel className="uppercase">{item.label}</DataListLabel>
                    )}
                    <DataListValue>{item.value}</DataListValue>
                  </DataListItem>
                ))}
              </DataList>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

function ArrowSvg(props: React.ComponentProps<'svg'>) {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" fill="none" {...props}>
      <path
        d="M9.66437 2.60207L4.80758 6.97318C4.07308 7.63423 3.11989 8 2.13172 8H0V10H20V8H18.5349C17.5468 8 16.5936 7.63423 15.8591 6.97318L11.0023 2.60207C10.622 2.2598 10.0447 2.25979 9.66437 2.60207Z"
        className="fill-[canvas]"
      />
      <path
        d="M8.99542 1.85876C9.75604 1.17425 10.9106 1.17422 11.6713 1.85878L16.5281 6.22989C17.0789 6.72568 17.7938 7.00001 18.5349 7.00001L15.89 7L11.0023 2.60207C10.622 2.2598 10.0447 2.2598 9.66436 2.60207L4.77734 7L2.13171 7.00001C2.87284 7.00001 3.58774 6.72568 4.13861 6.22989L8.99542 1.85876Z"
        className="fill-border dark:fill-none"
      />
      <path
        d="M10.3333 3.34539L5.47654 7.71648C4.55842 8.54279 3.36693 9 2.13172 9H0V8H2.13172C3.11989 8 4.07308 7.63423 4.80758 6.97318L9.66437 2.60207C10.0447 2.25979 10.622 2.2598 11.0023 2.60207L15.8591 6.97318C16.5936 7.63423 17.5468 8 18.5349 8H20V9H18.5349C17.2998 9 16.1083 8.54278 15.1901 7.71648L10.3333 3.34539Z"
        className="dark:fill-border"
      />
    </svg>
  )
}

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
