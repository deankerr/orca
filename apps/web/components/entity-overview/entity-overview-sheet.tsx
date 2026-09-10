'use client'

import { Sheet, SheetContent } from '@/components/ui/sheet'

import { useEntityOverview } from './entity-overview-context'
import { ModelOverview } from './model-overview'
import { ProviderOverview } from './provider-overview'

export { EntityOverviewProvider } from './entity-overview-context'

export function EntityOverviewSheet() {
  const { entity, close } = useEntityOverview()

  return (
    <Sheet
      open={entity !== null}
      onOpenChange={(open) => {
        if (!open) {
          close()
        }
      }}
    >
      <SheetContent className="overflow-y-auto sm:max-w-[420px]" aria-describedby={undefined}>
        {entity?.type === 'model' && <ModelOverview key={entity.slug} slug={entity.slug} />}
        {entity?.type === 'provider' && <ProviderOverview key={entity.slug} slug={entity.slug} />}
      </SheetContent>
    </Sheet>
  )
}
