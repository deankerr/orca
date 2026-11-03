import { cn } from 'cn'
import type { ComponentProps } from 'react'

/** The ORCA orb. Defaults to the brand colours for light (#404040) and dark (#d4d4d4) surfaces. */
export function OrbMark({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <svg
      aria-hidden="true"
      className={cn('size-5 shrink-0 text-[#404040] dark:text-[#d4d4d4]', className)}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3.5" />
      <ellipse rx="13" ry="6" transform="translate(39 24) rotate(-33)" fill="currentColor" />
    </svg>
  )
}
