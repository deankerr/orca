import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area'
import { cn } from 'cn'
import type { Ref } from 'react'

/**
 * A region that scrolls inside custom scrollbars. The root only clips and positions: give it a size
 * (`min-h-0 grow` in a flex column, or `h-full`), or bound the viewport's own height with
 * `viewportClassName="max-h-…"` for a list that grows to a limit. Anything that acts on the
 * scrolling element (`scrollTo`, `scrollIntoView`, an id for focus) belongs on the viewport, so
 * `viewportRef` reaches it.
 *
 * The viewport never chains a scroll to the page or bounces at its edges (`overscroll-none`), so
 * sticky content inside it holds still.
 */
function ScrollArea({
  children,
  className,
  horizontal,
  viewportClassName,
  viewportRef,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  /** Also shows a horizontal scrollbar, for content wider than the region. */
  horizontal?: boolean
  viewportClassName?: string
  viewportRef?: Ref<HTMLDivElement>
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('relative', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          'size-full overscroll-none rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
          viewportClassName,
        )}
        ref={viewportRef}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      {horizontal === true ? <ScrollBar orientation="horizontal" /> : null}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation: orientationProp,
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  const orientation = orientationProp ?? 'vertical'

  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        'z-20 flex touch-none p-px transition-opacity duration-150 select-none data-horizontal:h-2.5 data-horizontal:flex-col data-vertical:h-full data-vertical:w-2.5',
        // Idle scrollbars fade out, leaving the dense data uncluttered.
        'opacity-0 data-hovering:opacity-100 data-scrolling:opacity-100',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-foreground/20 hover:bg-foreground/30"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }
