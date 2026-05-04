import { cn } from '@/lib/utils'

import { EntityAvatar } from './entity-avatar'

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
