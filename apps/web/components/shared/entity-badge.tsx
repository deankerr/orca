import { toast } from 'sonner'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { EntityAvatar } from './entity-avatar'

export function EntityBadgeSkeleton({
  size = 'sm',
  className,
}: {
  size?: 'sm' | 'lg'
  className?: string
}) {
  const sizeConfig = {
    sm: { avatar: 'size-7', name: 'h-3.5 w-28', slug: 'h-3.5 w-40' },
    lg: { avatar: 'size-10', name: 'h-5 w-36', slug: 'h-4 w-48' },
  }[size]

  return (
    <div className={cn('relative flex items-center gap-2 overflow-hidden p-0.5', className)}>
      <Skeleton className={cn('shrink-0 rounded-sm', sizeConfig.avatar)} />
      <div className="flex flex-col gap-1">
        <Skeleton className={sizeConfig.name} />
        <Skeleton className={sizeConfig.slug} />
      </div>
    </div>
  )
}

export function EntityBadge({
  name,
  slug,
  size = 'sm',
  clickToCopy = true,
  className,
  ...props
}: {
  name: string
  slug: string
  size?: 'sm' | 'lg'
  clickToCopy?: boolean
} & React.ComponentProps<'div'>) {
  const fallbackText = name || slug

  const handleCopySlug = async () => {
    try {
      await navigator.clipboard.writeText(slug)
      toast.success(`Copied to clipboard: ${slug}`)
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
  }

  const sizeClasses = {
    sm: {
      avatar: 'size-7',
      name: 'font-sans text-sm leading-none h-3.5 font-medium',
      slug: 'font-mono text-xs leading-tight h-3.5',
    },
    lg: {
      avatar: 'size-10 mr-1',
      name: 'font-sans text-lg leading-tight h-5.5 font-semibold',
      slug: 'font-mono text-sm leading-none h-4.5',
    },
  }

  const sizeConfig = sizeClasses[size]

  return (
    <div
      className={cn('flex items-center gap-2 overflow-hidden p-0.5 text-left', className)}
      {...props}
    >
      <EntityAvatar slug={slug} fallbackText={fallbackText} className={sizeConfig.avatar} />
      <div className="flex flex-col overflow-hidden">
        <div className={cn('truncate', sizeConfig.name)}>{name}</div>
        {clickToCopy ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              void handleCopySlug()
            }}
            className={cn(
              'cursor-pointer truncate text-left text-muted-foreground hover:text-primary/90',
              sizeConfig.slug,
            )}
            title="Click to copy"
          >
            {slug}
          </button>
        ) : (
          <div className={cn('truncate text-muted-foreground', sizeConfig.slug)}>{slug}</div>
        )}
      </div>
    </div>
  )
}
