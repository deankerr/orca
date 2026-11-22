import { cn } from 'cn'

/** What a no-cache mark means, as its accessible label and hover text. */
export const NO_CACHE_LABEL = 'No cache: all input billed at the input rate'

/**
 * A hollow ring: the mark for an endpoint whose lack of a cache raises its workload cost
 * (`isCostRaisedByNoCache`), the same in the Table's Cost cell and on the
 * plot (where the endpoint's dot is a ring). It draws in the surrounding text colour. Decorative unless
 * `label` names it, in which case it is an image.
 */
export function NoCacheMark({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      aria-hidden={label === undefined ? true : undefined}
      aria-label={label}
      className={cn('inline-block size-2 shrink-0', className)}
      fill="none"
      role={label === undefined ? undefined : 'img'}
      stroke="currentColor"
      strokeWidth={1.25}
      viewBox="0 0 8 8"
    >
      {label === undefined ? null : <title>{label}</title>}
      <circle cx="4" cy="4" r="3" />
    </svg>
  )
}
