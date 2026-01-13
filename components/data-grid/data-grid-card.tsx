import { cn } from '@/lib/utils'

import { ScrollArea } from '../ui/scroll-area'

export function DataGridCard({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-1 flex-col overflow-hidden', className)} {...props} />
}

export function DataGridCardToolbar({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollArea>) {
  return (
    <ScrollArea
      className={cn('shrink-0', className)}
      maskHeight={10}
      orientation="horizontal"
      {...props}
    >
      {children}
    </ScrollArea>
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
      className={cn('flex flex-1 overflow-hidden border', className)}
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
