import { cn } from 'cn'
import { useId } from 'react'
import type { ComponentProps, ReactNode } from 'react'

/** The dense type shared by facet headings and counts. */
export const FACET_HEADING_CLASS = 'font-mono text-[10px] leading-3.5 text-muted-foreground'

/** The right-aligned figure on a facet row. */
export const FACET_COUNT_CLASS =
  'shrink-0 font-mono text-xs leading-4 text-muted-foreground tabular-nums'

/** One filter dimension in the Filters panel: a heading, with its own figure at the right, over rows. */
export function Facet({
  children,
  className,
  heading,
  headingId,
  meta,
  title,
  ...props
}: {
  /** Replaces the plain heading, such as a button that collapses the facet; give it `headingId`. */
  heading?: ReactNode
  /** The id of the replacement heading, which names the section. */
  headingId?: string
  /** The figure at the right of the heading row, such as an in-scope count. */
  meta?: ReactNode
  title: string
} & Omit<ComponentProps<'section'>, 'title'>) {
  const ownId = useId()
  const labelId = headingId ?? ownId

  return (
    <section
      aria-labelledby={labelId}
      className={cn('flex flex-col gap-0.5 border-b border-border px-3 pt-2.5 pb-2', className)}
      {...props}
    >
      {heading === undefined ? (
        <div className={cn('flex h-5 items-center justify-between', FACET_HEADING_CLASS)}>
          <h2 className="font-normal tracking-[0.08em] uppercase" id={labelId}>
            {title}
          </h2>
          {meta}
        </div>
      ) : (
        heading
      )}
      {children}
    </section>
  )
}
