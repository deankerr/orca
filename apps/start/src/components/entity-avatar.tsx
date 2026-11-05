import { entityLogoUrl } from '@orca/backend/entity-logo'
import { cn } from 'cn'
import type { ComponentProps } from 'react'

const configuredOrigin = import.meta.env.VITE_ORCA_LOGO_ORIGIN

const LOGO_SERVICE_ORIGIN =
  configuredOrigin === undefined || configuredOrigin === ''
    ? 'https://logos.orb.town'
    : configuredOrigin

/** Marks a logo that failed to load; the sibling fallback shows through `peer-data-error`. */
function markFailed(image: HTMLImageElement) {
  image.dataset.error = ''
}

/**
 * A model or provider logo. Defaults to 16px; callers resize through `className`.
 *
 * A plain `<img>` with no React state: a successful load costs no React work, which matters when a
 * page holds thousands of logos. Only a failure touches the DOM, by setting `data-error` on the image.
 */
export function EntityAvatar({
  slug,
  className,
  ...props
}: {
  slug: string
} & ComponentProps<'span'>) {
  const logoUrl = entityLogoUrl({ origin: LOGO_SERVICE_ORIGIN, slug, variant: 'avatar' })

  return (
    <span
      data-slot="entity-avatar"
      className={cn(
        'inline-flex size-4 shrink-0 overflow-hidden rounded-[3px] select-none',
        className,
      )}
      {...props}
    >
      {/* Keyed by slug, so a reused avatar showing another entity starts without a stale failure. */}
      <img
        alt=""
        className="peer aspect-square size-full object-contain data-error:hidden"
        decoding="async"
        key={slug}
        loading="lazy"
        onError={(event) => {
          markFailed(event.currentTarget)
        }}
        // A logo that failed before hydration attached `onError` is already broken when the ref runs.
        ref={(image) => {
          if (image?.complete === true && image.naturalWidth === 0) {
            markFailed(image)
          }
        }}
        src={logoUrl}
      />
      {/* Hidden until the image has failed, so a logo still loading never flashes its letter. */}
      <span className="hidden size-full items-center justify-center bg-muted font-mono text-[10px] leading-none text-muted-foreground uppercase peer-data-error:flex">
        {slug.charAt(0)}
      </span>
    </span>
  )
}
