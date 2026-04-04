import { cn } from '@/lib/utils'

import { EntityBadge } from '../shared/entity-badge'

export function EntitySheetHeader({
  type,
  slug,
  name,
  className,
  ...props
}: {
  type: 'model' | 'provider'
  slug: string
  name: string
} & React.ComponentProps<'div'>) {
  return (
    <div className={cn('space-y-3', className)} {...props}>
      <div className="font-mono text-xs text-muted-foreground uppercase">{type}</div>
      <EntityBadge name={name} slug={slug} size="lg" />
    </div>
  )
}

export function EntitySheetSection({
  title,
  count,
  action,
  children,
  className,
  ...props
}: {
  title: string
  count?: number | string
  action?: React.ReactNode
  children?: React.ReactNode
} & React.ComponentProps<'div'>) {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      <div className="flex items-center justify-between font-mono text-xs text-muted-foreground uppercase">
        <div>{title}</div>
        <div className="flex items-center gap-2">
          {action}
          {count !== undefined && <div>{count}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}
