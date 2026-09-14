import { cn } from '@/lib/utils'

export function DataGridCard({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-1 flex-col overflow-hidden', className)} {...props} />
}

export function DataGridCardToolbar({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div className={cn('shrink-0 overflow-x-auto', className)} {...props}>
      {children}
    </div>
  )
}

export function DataGridCardContent({
  children,
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="data-grid"
      className={cn(
        'flex min-h-0 min-w-0 flex-1 overflow-hidden border-t border-b border-border-solid',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function DataGridCardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex h-7 shrink-0 items-center justify-center px-3 font-mono text-xs text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}
