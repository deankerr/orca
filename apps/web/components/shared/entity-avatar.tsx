import { entityLogoUrl } from '@orca/backend/convex/shared/entityLogo'

import { cn } from '@/lib/utils'

const LOGO_SERVICE_ORIGIN = 'https://logos.orb.town'

export function EntityAvatar({
  slug,
  className,
  ...props
}: {
  slug: string
} & React.ComponentProps<'span'>) {
  const logoPath = entityLogoUrl({ origin: LOGO_SERVICE_ORIGIN, slug, variant: 'avatar' })

  return (
    <span
      data-slot="entity-avatar"
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-sm border select-none',
        className,
      )}
      {...props}
    >
      {/* oxlint-disable-next-line nextjs/no-img-element -- The logo service serves pre-sized assets; Next image optimization is unnecessary. */}
      <img
        src={logoPath}
        alt=""
        width={28}
        height={28}
        loading="lazy"
        decoding="async"
        className="size-full object-contain"
      />
    </span>
  )
}
