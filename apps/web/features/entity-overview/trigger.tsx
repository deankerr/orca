'use client'

import { cn } from '@/lib/utils'

import { useEntityOverview } from './context'

export function EntityOverviewTrigger({
  type,
  slug,
  className,
  ...props
}: {
  type: 'model' | 'provider'
  slug: string
} & Omit<React.ComponentProps<'button'>, 'type'>) {
  const { openOverview } = useEntityOverview()

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    openOverview({ type, slug })
    props.onClick?.(e)
  }

  return (
    <button
      {...props}
      type="button"
      data-slot="entity-overview-trigger"
      className={cn(
        'max-w-full min-w-0 cursor-pointer rounded-md text-start outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:hover:bg-muted/50',
        className,
      )}
      onClick={handleClick}
    />
  )
}
