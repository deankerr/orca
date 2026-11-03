import { Autocomplete as AutocompletePrimitive } from '@base-ui/react/autocomplete'
import { cn } from 'cn'

import { ScrollArea } from '#components/scroll-area'

/**
 * A text field that suggests items as you type. Unlike a Combobox, the text stays free-form and no
 * item is remembered as selected, which suits a search that acts on an item and starts over.
 */
const Autocomplete = AutocompletePrimitive.Root

/**
 * The text field. It carries no `data-slot` and no classes of its own, so it can render as another
 * control: `render={<InputGroupInput />}` keeps that control's `input-group-control` slot, which its
 * group reads for the focus ring.
 */
const AutocompleteInput = AutocompletePrimitive.Input

/** The floating list: a popup anchored below `anchor`, as wide as it, scrolling when its list is long. */
function AutocompleteContent({
  anchor,
  children,
  className,
  side = 'bottom',
  sideOffset = 4,
  ...props
}: AutocompletePrimitive.Popup.Props &
  Pick<AutocompletePrimitive.Positioner.Props, 'anchor' | 'side' | 'sideOffset'>) {
  return (
    <AutocompletePrimitive.Portal>
      <AutocompletePrimitive.Positioner
        anchor={anchor}
        className="isolate z-50 outline-none"
        side={side}
        sideOffset={sideOffset}
      >
        <AutocompletePrimitive.Popup
          data-slot="autocomplete-content"
          className={cn(
            'flex max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) flex-col overflow-hidden rounded-md border border-border-solid bg-popover p-1 text-popover-foreground shadow-lg outline-none',
            className,
          )}
          {...props}
        >
          {/* The popup's own limit (`max-h-…`) bounds the viewport, which then shrinks to the padding. */}
          <ScrollArea className="min-h-0" viewportClassName="max-h-[inherit]">
            {children}
          </ScrollArea>
        </AutocompletePrimitive.Popup>
      </AutocompletePrimitive.Positioner>
    </AutocompletePrimitive.Portal>
  )
}

function AutocompleteList({ className, ...props }: AutocompletePrimitive.List.Props) {
  return (
    <AutocompletePrimitive.List
      data-slot="autocomplete-list"
      className={cn('outline-none', className)}
      {...props}
    />
  )
}

function AutocompleteItem({ className, ...props }: AutocompletePrimitive.Item.Props) {
  return (
    <AutocompletePrimitive.Item
      data-slot="autocomplete-item"
      className={cn(
        'flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-[13px] leading-4 outline-none select-none data-highlighted:bg-muted',
        className,
      )}
      {...props}
    />
  )
}

function AutocompleteEmpty({ className, ...props }: AutocompletePrimitive.Empty.Props) {
  return (
    <AutocompletePrimitive.Empty
      data-slot="autocomplete-empty"
      className={cn('px-2 py-1.5 text-xs text-muted-foreground empty:p-0', className)}
      {...props}
    />
  )
}

export {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
}
