import { cn } from 'cn'
import type { ComponentProps } from 'react'

/**
 * The ORCA mark: the orca's head (dark disc) with its eye patch (light ellipse) on a light tile.
 * The app is dark-only, so the fills are fixed. Never invert the polarity: the head stays dark and
 * the patch stays light.
 */
export function OrbMark({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <svg
      aria-hidden="true"
      className={cn('size-6 shrink-0', className)}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect width="64" height="64" rx="16" fill="#fafafa" />
      <g transform="translate(8 8) scale(0.75)">
        <circle cx="32" cy="32" r="32" fill="#0a0a0a" />
        <ellipse rx="13" ry="6" transform="translate(39 24) rotate(-33)" fill="#fafafa" />
      </g>
    </svg>
  )
}
