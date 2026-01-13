'use client'

import * as React from 'react'

import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'

import { useTouchPrimary } from '@/hooks/use-has-primary-touch'
import { cn } from '@/lib/utils'

// Lina https://lina.sameer.sh/

const ScrollAreaContext = React.createContext<boolean>(false)
type Mask = {
  top: boolean
  bottom: boolean
  left: boolean
  right: boolean
}

function ScrollArea({
  className,
  children,
  scrollHideDelay = 0,
  viewportClassName,
  maskClassName,
  maskHeight = 10,
  ref,
  viewportRef: viewportRefProp,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportClassName?: string
  /**
   * `maskHeight` is the height of the mask in pixels.
   * pass `0` to disable the mask
   * @default 30
   */
  maskHeight?: number
  maskClassName?: string
  viewportRef?: React.RefObject<HTMLDivElement | null>
  orientation?: 'vertical' | 'horizontal'
}) {
  const [showMask, setShowMask] = React.useState<Mask>({
    top: false,
    bottom: false,
    left: false,
    right: false,
  })
  const internalViewportRef = React.useRef<HTMLDivElement>(null)
  const viewportRef = viewportRefProp ?? internalViewportRef
  const isTouch = useTouchPrimary()

  const checkScrollability = React.useCallback(() => {
    const element = viewportRef.current
    if (!element) return

    const { scrollTop, scrollLeft, scrollWidth, clientWidth, scrollHeight, clientHeight } = element
    setShowMask((prev) => ({
      ...prev,
      top: scrollTop > 0,
      bottom: scrollTop + clientHeight < scrollHeight - 1,
      left: scrollLeft > 0,
      right: scrollLeft + clientWidth < scrollWidth - 1,
    }))
    // viewportRef causes infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') return

    const element = viewportRef.current
    if (!element) return

    const controller = new AbortController()
    const { signal } = controller

    const resizeObserver = new ResizeObserver(checkScrollability)
    resizeObserver.observe(element)

    element.addEventListener('scroll', checkScrollability, { signal })
    window.addEventListener('resize', checkScrollability, { signal })

    // Run an initial check whenever dependencies change (including pointer mode)
    checkScrollability()

    return () => {
      controller.abort()
      resizeObserver.disconnect()
    }
  }, [checkScrollability, isTouch, viewportRef])

  return (
    <ScrollAreaContext.Provider value={isTouch}>
      {isTouch ? (
        <div
          ref={ref}
          role="group"
          data-slot="scroll-area"
          aria-roledescription="scroll area"
          className={cn('relative overflow-hidden', className)}
          {...props}
        >
          <div
            ref={viewportRef}
            data-slot="scroll-area-viewport"
            className={cn('size-full overflow-auto rounded-[inherit]', viewportClassName)}
            tabIndex={0}
          >
            {children}
          </div>

          {maskHeight > 0 && (
            <ScrollMask showMask={showMask} className={maskClassName} maskHeight={maskHeight} />
          )}
        </div>
      ) : (
        <ScrollAreaPrimitive.Root
          ref={ref}
          data-slot="scroll-area"
          scrollHideDelay={scrollHideDelay}
          className={cn('relative overflow-hidden', className)}
          {...props}
        >
          <ScrollAreaPrimitive.Viewport
            ref={viewportRef}
            data-slot="scroll-area-viewport"
            className={cn('size-full rounded-[inherit]', viewportClassName)}
          >
            {children}
          </ScrollAreaPrimitive.Viewport>

          {maskHeight > 0 && (
            <ScrollMask showMask={showMask} className={maskClassName} maskHeight={maskHeight} />
          )}
          <ScrollBar orientation={orientation} />
          <ScrollAreaPrimitive.Corner />
        </ScrollAreaPrimitive.Root>
      )}
    </ScrollAreaContext.Provider>
  )
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ref,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  const isTouch = React.useContext(ScrollAreaContext)

  if (isTouch) return null

  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      ref={ref}
      orientation={orientation}
      data-slot="scroll-area-scrollbar"
      className={cn(
        'z-20 flex touch-none p-px transition-[colors] duration-150 select-none hover:bg-muted data-[state=hidden]:animate-out data-[state=hidden]:fade-out-0 data-[state=visible]:animate-in data-[state=visible]:fade-in-0 dark:hover:bg-muted/50',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent px-1 pr-1.25',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className={cn(
          'relative flex-1 origin-center rounded-full bg-border transition-[scale]',
          orientation === 'vertical' && 'my-1 active:scale-y-95',
          orientation === 'horizontal' && 'active:scale-x-98',
        )}
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

const ScrollMask = ({
  showMask,
  maskHeight,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  showMask: Mask
  maskHeight: number
}) => {
  return (
    <>
      <div
        {...props}
        aria-hidden="true"
        style={
          {
            '--top-fade-height': showMask.top ? `${maskHeight}px` : '0px',
            '--bottom-fade-height': showMask.bottom ? `${maskHeight}px` : '0px',
          } as React.CSSProperties
        }
        className={cn(
          'pointer-events-none absolute inset-0 z-10',
          "before:absolute before:inset-x-0 before:top-0 before:transition-[height,opacity] before:duration-300 before:content-['']",
          "after:absolute after:inset-x-0 after:bottom-0 after:transition-[height,opacity] after:duration-300 after:content-['']",
          'before:h-(--top-fade-height) after:h-(--bottom-fade-height)',
          showMask.top ? 'before:opacity-100' : 'before:opacity-0',
          showMask.bottom ? 'after:opacity-100' : 'after:opacity-0',
          'before:bg-linear-to-b before:from-background before:to-transparent',
          'after:bg-linear-to-t after:from-background after:to-transparent',
          className,
        )}
      />
      <div
        {...props}
        aria-hidden="true"
        style={
          {
            '--left-fade-width': showMask.left ? `${maskHeight}px` : '0px',
            '--right-fade-width': showMask.right ? `${maskHeight}px` : '0px',
          } as React.CSSProperties
        }
        className={cn(
          'pointer-events-none absolute inset-0 z-10',
          "before:absolute before:inset-y-0 before:left-0 before:transition-[width,opacity] before:duration-300 before:content-['']",
          "after:absolute after:inset-y-0 after:right-0 after:transition-[width,opacity] after:duration-300 after:content-['']",
          'before:w-(--left-fade-width) after:w-(--right-fade-width)',
          showMask.left ? 'before:opacity-100' : 'before:opacity-0',
          showMask.right ? 'after:opacity-100' : 'after:opacity-0',
          'before:bg-linear-to-r before:from-background before:to-transparent',
          'after:bg-linear-to-l after:from-background after:to-transparent',
          className,
        )}
      />
    </>
  )
}

export { ScrollArea, ScrollBar }
