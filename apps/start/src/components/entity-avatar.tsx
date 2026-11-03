import { entityLogoUrl } from '@orca/backend/entity-logo'
import { cn } from 'cn'
import { useState } from 'react'
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
} & ComponentProps<'span'>) {
  const logoUrl = entityLogoUrl({ origin: LOGO_SERVICE_ORIGIN, slug, variant: 'avatar' })
  const [failedUrl, setFailedUrl] = useState<string>()
  const failed = failedUrl === logoUrl

  return (
    <span
      data-slot="entity-avatar"
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[3px] select-none',
        failed && 'bg-muted font-mono text-[10px] leading-none text-muted-foreground uppercase',
        className,
      )}
      {...props}
    >
      {failed ? (
        slug.charAt(0)
      ) : (
        <img
          src={logoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-contain"
          onError={() => {
            setFailedUrl(logoUrl)
          }}
        />
      )}
    </span>
  )
}
