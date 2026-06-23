import { cn } from '@/lib/utils'

import { Skeleton } from '../ui/skeleton'
import { EntityAvatar } from './entity-avatar'

export function EntityIdentitySkeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5 px-1 py-1', className)} {...props}>
      <Skeleton className="size-6 shrink-0 rounded-sm" />
      <div className="min-w-0 space-y-1">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-36" />
      </div>
    </div>
  )
}

export function EntityIdentity({
  slug,
  name,
  isAvailable = true,
  className,
  ...props
}: {
  slug: string
  name?: string
  isAvailable?: boolean
} & React.ComponentProps<'div'>) {
  const hasName = name !== undefined && name !== ''

  return (
    <div className={cn('flex min-w-0 items-center gap-1.5 px-1 py-1', className)} {...props}>
      <EntityAvatar slug={slug} className={cn('size-6', !isAvailable && 'brightness-50')} />
      <div className="min-w-0">
        {hasName && (
          <div
            className={cn(
              'truncate font-sans text-xs leading-tight font-medium',
              !isAvailable && 'text-muted-foreground',
            )}
          >
            {name}
          </div>
        )}
        <div
          className={cn(
            'truncate font-mono text-xs leading-none text-muted-foreground',
            !isAvailable && 'line-through',
          )}
        >
          {slug}
        </div>
      </div>
    </div>
  )
}
