import { entityLogoUrl } from '@orca/backend/shared/entity-logo'
import Image from 'next/image'

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
        '@container relative inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-neutral-700/30 text-sm select-none',
        className,
      )}
      {...props}
    >
      <Image src={logoPath} alt="" fill unoptimized sizes="40px" className="object-contain" />
    </span>
  )
}
