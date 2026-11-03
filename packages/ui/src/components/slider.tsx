import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { cn } from 'cn'

/**
 * A slider whose parts the caller composes. There is no track or filled range: ORCA's sliders draw
 * their own visual (the histogram bars) inside the control. Thumbs are inset, so the thumb's edge, not
 * its centre, meets the control's edge, and a thumb as wide as one step sits exactly over that step.
 */
function Slider<Value extends number | readonly number[]>({
  className,
  ...props
}: SliderPrimitive.Root.Props<Value>) {
  return (
    <SliderPrimitive.Root
      className={cn('data-horizontal:w-full data-vertical:h-full', className)}
      data-slot="slider"
      thumbAlignment="edge"
      {...props}
    />
  )
}

/** The pressable area: it holds the visual and the thumbs. It never scrolls the page while dragged. */
function SliderControl({ className, ...props }: SliderPrimitive.Control.Props) {
  return (
    <SliderPrimitive.Control
      className={cn(
        'relative flex w-full touch-none items-center select-none data-disabled:opacity-50',
        className,
      )}
      data-slot="slider-control"
      {...props}
    />
  )
}

/** A thumb, with the focusable range input inside it; give it a size and anything to draw. */
function SliderThumb({ className, ...props }: SliderPrimitive.Thumb.Props) {
  return (
    <SliderPrimitive.Thumb
      className={cn('block shrink-0 outline-none select-none', className)}
      data-slot="slider-thumb"
      {...props}
    />
  )
}

export { Slider, SliderControl, SliderThumb }
