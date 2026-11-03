import { entityLogoUrl } from '@orca/backend/entity-logo'
import { Avatar, AvatarFallback, AvatarImage } from '@orca/ui/components/avatar'
import { cn } from 'cn'
import type { ComponentProps } from 'react'

const configuredOrigin = import.meta.env.VITE_ORCA_LOGO_ORIGIN

const LOGO_SERVICE_ORIGIN =
  configuredOrigin === undefined || configuredOrigin === ''
    ? 'https://logos.orb.town'
    : configuredOrigin

/** A model or provider logo. Defaults to 16px; callers resize through `className`. */
export function EntityAvatar({
  slug,
  className,
  ...props
}: {
  slug: string
} & ComponentProps<typeof Avatar>) {
  const logoUrl = entityLogoUrl({ origin: LOGO_SERVICE_ORIGIN, slug, variant: 'avatar' })

  return (
    <Avatar
      data-slot="entity-avatar"
      className={cn('inline-flex size-4 overflow-hidden rounded-[3px] after:hidden', className)}
      {...props}
    >
      {/* `keepMounted` lets the browser's own lazy loading decide when to fetch; Base UI otherwise preloads
          every logo eagerly and mounts the image only once it has loaded. */}
      <AvatarImage
        alt=""
        className="peer rounded-none object-contain data-error:hidden"
        decoding="async"
        keepMounted
        loading="lazy"
        src={logoUrl}
      />
      {/* Hidden until the image has failed, so a logo still loading never flashes its letter. */}
      <AvatarFallback className="hidden rounded-none font-mono text-[10px] leading-none uppercase peer-data-error:flex">
        {slug.charAt(0)}
      </AvatarFallback>
    </Avatar>
  )
}
