import { cn } from 'cn'
import type { ComponentProps } from 'react'

/**
 * A placeholder block for content that has not loaded. It is decorative, so it is hidden from
 * assistive tech (give the loading region its own status text), and it pulses only when the user has
 * not asked for reduced motion.
 */
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn('rounded-md bg-muted motion-safe:animate-pulse', className)}
      {...props}
    />
  )
}

export { Skeleton }
