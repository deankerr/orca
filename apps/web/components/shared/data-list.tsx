import { cn } from '@/lib/utils'

export function DataList({ className, ...props }: React.ComponentProps<'dl'>) {
  return <dl className={cn('space-y-2', className)} {...props} />
}

export function DataListItem({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex justify-between gap-4', className)} {...props} />
}

export function DataListLabel({ className, ...props }: React.ComponentProps<'dt'>) {
  return <dt className={cn('text-sm text-muted-foreground', className)} {...props} />
}

export function DataListValue({ className, ...props }: React.ComponentProps<'dd'>) {
  return <dd className={cn('text-right font-mono text-sm', className)} {...props} />
}
