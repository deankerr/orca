'use client'

import { Slot } from '@radix-ui/react-slot'

import { Sheet, SheetContent } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import { useEntitySheet } from './entity-sheet-context'
import { ModelSheet } from './model-sheet'
import { ProviderSheet } from './provider-sheet'

export { EntitySheetProvider } from './entity-sheet-context'

export function EntitySheet() {
  const { entity, close } = useEntitySheet()

  return (
    <Sheet
      open={entity !== null}
      onOpenChange={(open) => {
        if (!open) {
          close()
        }
      }}
    >
      <SheetContent className="overflow-y-auto" aria-describedby={undefined}>
        {entity?.type === 'model' && <ModelSheet slug={entity.slug} />}
        {entity?.type === 'provider' && <ProviderSheet slug={entity.slug} />}
      </SheetContent>
    </Sheet>
  )
}

export function EntitySheetTrigger({
  type,
  slug,
  className,
  asChild = false,
  ...props
}: {
  type: 'model' | 'provider'
  slug: string
  asChild?: boolean
} & Omit<React.ComponentProps<'button'>, 'type'>) {
  const { openModel, openProvider } = useEntitySheet()
  const Comp = asChild ? Slot : 'button'

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (type === 'model') {
      openModel(slug)
    } else {
      openProvider(slug)
    }
    props.onClick?.(e)
  }

  return (
    <Comp
      className={cn(
        'cursor-pointer rounded-md outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      tabIndex={0}
      onClick={handleClick}
      {...props}
    />
  )
}
