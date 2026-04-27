import { resolveLogo } from '@orca/entity-logos'
import Image from 'next/image'

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
  const logo = resolveLogo(slug)
  const logoPath = logo?.avatarPath ?? logo?.colorPath

  return (
    <span
      data-slot="entity-avatar"
      className={cn(
        '@container relative inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-neutral-700/30 text-sm select-none',
        className,
      )}
      {...props}
    >
      {logoPath === undefined ? (
        <span className="font-mono text-[55cqi] text-foreground/90 uppercase">
          {(fallbackText ?? slug).replaceAll(/[^a-zA-Z0-9]/g, '').slice(0, 2)}
        </span>
      ) : (
        <Image src={logoPath} alt="" fill sizes="40px" className="object-contain" />
      )}
    </span>
  )
}
