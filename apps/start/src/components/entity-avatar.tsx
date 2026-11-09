import { entityLogoUrl } from '@orca/backend/entity-logo'
import { cn } from 'cn'
import type { ComponentProps } from 'react'

const configuredOrigin = import.meta.env.VITE_ORCA_LOGO_ORIGIN

const LOGO_SERVICE_ORIGIN =
  configuredOrigin === undefined || configuredOrigin === ''
    ? 'https://logos.orb.town'
    : configuredOrigin

/**
 * A model or provider logo. Defaults to 16px; callers resize through `className`.
 *
 * One element, with the logo as its background: a page holds thousands of logos but only dozens of
 * distinct ones, so each costs no `<img>`, lazy-load tracking, or React work beyond the span. The
 * logo service answers an unknown slug with its own fallback image, so there is no failure state
 * to render.
 */
export function EntityAvatar({
  slug,
  className,
  style,
  ...props
}: {
  slug: string
} & ComponentProps<'span'>) {
  const logoUrl = entityLogoUrl({ origin: LOGO_SERVICE_ORIGIN, slug, variant: 'avatar' })

  return (
    <span
      aria-hidden="true"
      data-slot="entity-avatar"
      className={cn(
        'inline-block size-4 shrink-0 rounded-[3px] bg-contain bg-center bg-no-repeat select-none',
        className,
      )}
      // JSON's quoting is a valid CSS string, so any URL is safe inside `url()`.
      style={{ ...style, backgroundImage: `url(${JSON.stringify(logoUrl)})` }}
      {...props}
    />
  )
}
