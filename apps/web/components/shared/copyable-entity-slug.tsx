'use client'

import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

export function CopyableEntitySlug({
  slug,
  className,
  onClick,
  title = 'Click to copy',
  ...props
}: { slug: string } & Omit<React.ComponentProps<'button'>, 'children' | 'type'>) {
  const copyToClipboard = useCopyToClipboard()

  return (
    <button
      {...props}
      type="button"
      onClick={(event) => {
        void copyToClipboard(slug, `Copied: ${slug}`)
        onClick?.(event)
      }}
      title={title}
      className={cn(
        'relative block max-w-full cursor-pointer rounded-sm text-left font-mono text-xs leading-5 text-muted-foreground transition-colors after:absolute after:inset-x-0 after:-inset-y-2 hover:text-primary/90 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none',
        className,
      )}
    >
      {slug}
    </button>
  )
}
