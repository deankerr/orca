import { Doc } from '@/convex/_generated/dataModel'

import { SpriteIcon } from '@/components/ui/sprite-icon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Attribute, AttributeName, attributes } from '@/lib/attributes'

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
    <Tooltip>
      <TooltipTrigger asChild>
        <RadIconBadge variant="surface" color={color} aria-label={key}>
          <SpriteIcon name={icon} className="size-full" />
        </RadIconBadge>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 font-mono text-pretty">
        <div className="space-y-1">
          <div className="space-y-1 not-only:mb-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium uppercase">{label}</p>
              {badge && <span>{badge}</span>}
            </div>
            <p className="font-sans">{description}</p>
          </div>

          {details?.map((item, i) => (
            <div key={i} className="flex justify-between gap-2">
              {item.label && <span className="uppercase">{item.label}:</span>}
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
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
