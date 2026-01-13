import { ExternalLink as ExternalLinkIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

function getDomain(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function ExternalLink({ href, children, className, ...props }: React.ComponentProps<'a'>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1 text-primary underline decoration-primary/40 decoration-dashed underline-offset-3',
        className,
      )}
      {...props}
    >
      {children ?? (href && getDomain(href))}
      <ExternalLinkIcon className="size-3" />
    </a>
  )
}

ExternalLink.displayName = 'ExternalLink'
