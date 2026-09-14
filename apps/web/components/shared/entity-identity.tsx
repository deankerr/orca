'use client'

import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

export function EntityIdentity({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="entity-identity"
      className={cn(
        'flex min-w-0 items-center gap-1.5 px-1 py-1 [&>[data-slot=entity-avatar]]:size-6',
        className,
      )}
      {...props}
    />
  )
}

export function EntityIdentityContent({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="entity-identity-content"
      className={cn('flex min-w-0 flex-col', className)}
      {...props}
    />
  )
}

export function EntityIdentityName({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="entity-identity-name"
      className={cn(
        'block truncate font-sans text-xs leading-tight font-medium empty:hidden',
        className,
      )}
      {...props}
    />
  )
}

const slugClassName = 'block truncate font-mono text-xs leading-none text-muted-foreground'

export function EntityIdentitySlug({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span data-slot="entity-identity-slug" className={cn(slugClassName, className)} {...props} />
  )
}

export function EntityIdentityCopySlug({
  children,
  className,
  ...props
}: { children: string } & Omit<React.ComponentProps<'button'>, 'children' | 'onClick' | 'type'>) {
  const copy = useCopyToClipboard()

  return (
    <button
      {...props}
      type="button"
      data-slot="entity-identity-slug"
      aria-label={`Copy identifier: ${children}`}
      title={children}
      className={cn(
        slugClassName,
        'max-w-full cursor-pointer self-start rounded-xs text-start underline-offset-2 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
      onClick={() => {
        void copy(children, `Copied: ${children}`)
      }}
    >
      {children}
    </button>
  )
}
