'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

import { Slot } from '@radix-ui/react-slot'

import { Sheet, SheetContent } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import { ModelSheet } from './model-sheet'
import { ProviderSheet } from './provider-sheet'

type EntityState = { type: 'model'; slug: string } | { type: 'provider'; slug: string } | null

type EntitySheetContextValue = {
  entity: EntityState
  openModel: (slug: string) => void
  openProvider: (slug: string) => void
  close: () => void
}

const EntitySheetContext = createContext<EntitySheetContextValue | null>(null)

export function EntitySheetProvider({ children }: { children: ReactNode }) {
  const [entity, setEntity] = useState<EntityState>(null)

  return (
    <EntitySheetContext.Provider
      value={{
        entity,
        openModel: (slug) => setEntity({ type: 'model', slug }),
        openProvider: (slug) => setEntity({ type: 'provider', slug }),
        close: () => setEntity(null),
      }}
    >
      {children}
    </EntitySheetContext.Provider>
  )
}

export function useEntitySheet() {
  const context = useContext(EntitySheetContext)
  if (!context) {
    throw new Error('useEntitySheet must be used within EntitySheetProvider')
  }
  return context
}

export function EntitySheet() {
  const { entity, close } = useEntitySheet()

  return (
    <Sheet open={entity !== null} onOpenChange={(open) => !open && close()}>
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
