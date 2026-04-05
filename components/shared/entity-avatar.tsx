import Image from 'next/image'

import { getLogo } from '@/convex/shared/logos'
import { cn } from '@/lib/utils'

export function EntityAvatar({
  slug,
  fallbackText,
  className,
  ...props
}: {
  slug: string
  fallbackText?: string
} & React.ComponentProps<'span'>) {
  const { avatarPath, style } = getLogo(slug)

  return (
    <span
      data-slot="entity-avatar"
      className={cn(
        '@container relative inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-neutral-700/30 text-sm select-none',
        className,
      )}
      style={{ background: style?.background }}
      {...props}
    >
      {avatarPath ? (
        <Image
          src={avatarPath}
          alt=""
          fill
          sizes="40px"
          className="object-contain"
          style={{ scale: style?.scale ?? 1 }}
        />
      ) : (
        <span className="font-mono text-[55cqi] text-foreground/90 uppercase">
          {(fallbackText || slug).replace(/[^a-zA-Z0-9]/g, '').slice(0, 2)}
        </span>
      )}
    </span>
  )
}
