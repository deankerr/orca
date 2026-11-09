import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area'
import { useRender } from '@base-ui/react/use-render'
import { cn } from 'cn'
import { useSyncExternalStore } from 'react'
import type { ReactElement, ReactNode, Ref } from 'react'

const COARSE_POINTER = '(pointer: coarse)'

function subscribeToPointer(onChange: () => void) {
  const query = matchMedia(COARSE_POINTER)

  query.addEventListener('change', onChange)

  return () => {
    query.removeEventListener('change', onChange)
  }
}

/** Whether the primary pointer is a finger. The server renders for a mouse. */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeToPointer,
    () => matchMedia(COARSE_POINTER).matches,
    () => false,
  )
}

interface ScrollAreaProps {
  children: ReactNode
  /** The root's classes: give it a size, such as `min-h-0 grow` in a flex column, or `h-full`. */
  className?: string
  /** Also shows a horizontal scrollbar, for content wider than the region. */
  horizontal?: boolean
  /** An element to render as the root in place of a `<div>`, as Base UI's `render` does. */
  render?: ReactElement
  viewportClassName?: string
  viewportRef?: Ref<HTMLDivElement>
}

const VIEWPORT_CLASS =
  'size-full overscroll-none rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset'

/**
 * A region that scrolls inside custom scrollbars, or natively on a touch screen. The root only clips
 * and positions: give it a size (`min-h-0 grow` in a flex column, or `h-full`), or bound the
 * viewport's own height with `viewportClassName="max-h-…"` for a list that grows to a limit.
 * Anything that acts on the scrolling element (`scrollTo`, `scrollIntoView`, an id for focus)
 * belongs on the viewport, so `viewportRef` reaches it.
 *
 * The viewport never chains a scroll to the page or bounces at its edges (`overscroll-none`), so
 * sticky content inside it holds still.
 *
 * A touch screen draws its own overlay scrollbars, so the custom ones add nothing there, and they
 * cost a great deal on WebKit, where every iOS browser runs: Base UI's viewport writes four
 * inherited CSS variables at every scroll event, which restyles everything inside it in every frame
 * of a fling. Base UI stops them inheriting everywhere else. Switching pointers remounts the content.
 */
function ScrollArea(props: ScrollAreaProps) {
  return useCoarsePointer() ? <NativeScrollArea {...props} /> : <CustomScrollArea {...props} />
}

function NativeScrollArea({
  children,
  className,
  render,
  viewportClassName,
  viewportRef,
}: ScrollAreaProps) {
  return useRender({
    props: {
      children: (
        <div
          data-slot="scroll-area-viewport"
          className={cn('overflow-auto', VIEWPORT_CLASS, viewportClassName)}
          ref={viewportRef}
        >
          {children}
        </div>
      ),
      className: cn('relative', className),
      'data-slot': 'scroll-area',
    },
    render,
  })
}

function CustomScrollArea({
  children,
  className,
  horizontal,
  render,
  viewportClassName,
  viewportRef,
}: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('relative', className)}
      render={render}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(VIEWPORT_CLASS, viewportClassName)}
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
