import { cn } from '@/lib/utils'

function Shimmer({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="shimmer"
      className={cn(
        'animate-skeleton rounded-sm [--shimmer-highlight:--alpha(var(--color-white)/64%)] [background:linear-gradient(120deg,transparent_40%,var(--shimmer-highlight),transparent_60%)_var(--color-muted)_0_0_/_200%_100%_fixed] dark:[--shimmer-highlight:--alpha(var(--color-white)/4%)]',
        className,
      )}
      {...props}
    />
  )
}

export { Shimmer }
