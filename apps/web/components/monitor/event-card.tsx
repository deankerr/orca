'use client'

import { cn } from '@/lib/utils'

// -- Color bar mapping

// -- Card primitives

export function EventCard({ children, className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-none border bg-card/50', className)} {...props}>
      {children}
    </div>
  )
}

export function EventCardBody({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('px-6 py-2.5 empty:hidden', className)} {...props}>
      {children}
    </div>
  )
}
