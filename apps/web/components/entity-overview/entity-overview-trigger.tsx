'use client'

import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'

import { cn } from '@/lib/utils'

import { useEntityOverview } from './entity-overview-context'

export function EntityOverviewTrigger({
  type,
  slug,
  className,
  render,
  ...props
}: {
  type: 'model' | 'provider'
  slug: string
  render?: useRender.ComponentProps<'button'>['render']
} & Omit<React.ComponentProps<'button'>, 'type'>) {
  const { openOverview } = useEntityOverview()

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    openOverview({ type, slug })
    props.onClick?.(e)
  }

  return useRender({
    defaultTagName: 'button',
    render,
    props: mergeProps<'button'>(
      {
        type: 'button',
        className: cn(
          'cursor-pointer rounded-md outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:hover:bg-muted/50',
          className,
        ),
        tabIndex: 0,
        onClick: handleClick,
      },
      props,
    ),
  })
}
