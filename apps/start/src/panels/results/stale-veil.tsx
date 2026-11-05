import { cn } from 'cn'

/**
 * A wash of the page background over a view that is catching up to the filters. It fades in only
 * after a delay, so an update that lands quickly never flickers, and fades out as soon as it is done.
 *
 * It is a sibling that covers the view, not an opacity on it. Fading a view of thousands of nodes
 * makes it a stacking context, and the browser repaints every node under it, which costs tens of
 * milliseconds inside the very frame that is meant to paint the filter control.
 */
export function StaleVeil({ className, stale }: { className: string; stale: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute bg-background opacity-0 transition-opacity duration-100',
        stale && 'opacity-40 delay-150',
        className,
      )}
    />
  )
}
