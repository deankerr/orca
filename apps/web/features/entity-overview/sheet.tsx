'use client'

import { Sheet, SheetContent } from '@/components/ui/sheet'

import { useEntityOverview } from './context'
import { ModelOverview } from './model'
import { ProviderOverview } from './provider'

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
        {entity?.type === 'model' && <ModelOverview key={entity.measurement.id} request={entity} />}
        {entity?.type === 'provider' && (
          <ProviderOverview key={entity.measurement.id} request={entity} />
        )}
      </SheetContent>
    </Sheet>
  )
}
