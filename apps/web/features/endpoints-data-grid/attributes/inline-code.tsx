import { cn } from '@/lib/utils'

export function InlineCode({ className, ...props }: React.ComponentProps<'code'>) {
  return (
    <code
      className={cn('rounded bg-muted px-1 py-0.5 font-mono text-[0.95em]', className)}
      {...props}
    />
  )
}
