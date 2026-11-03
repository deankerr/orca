import { ScrollArea } from '@orca/ui/components/scroll-area'
import { TabsContent } from '@orca/ui/components/tabs'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { TABLE_KEYS_ATTRIBUTE } from '#app/keyboard'
import type { EndpointRow } from '#endpoints/snapshot'

import { modelSections, providerSections } from './facts'
import { RowsSection, SectionBlock } from './parts'
import { endpointSections } from './sections'

export const TAB_NAMES = ['Endpoint', 'Model', 'Provider', 'History'] as const

type TabName = (typeof TAB_NAMES)[number]

/**
 * A tab's scrolling body. It carries the Table's key marker, so ↑ and ↓ work from it; the tab list
 * does not, because tabs use the arrow keys themselves. Esc is the panel's own: see `EndpointPanel`. A different endpoint starts at the top.
 */
function TabBody({
  children,
  endpointId,
  value,
}: {
  children: ReactNode
  endpointId: string
  value: TabName
}) {
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Scrolls back to the top when the endpoint changes, though the effect reads no endpoint value.
  }, [endpointId])

  return (
    <TabsContent
      className="min-h-0 flex-none grow basis-0"
      value={value}
      {...{ [TABLE_KEYS_ATTRIBUTE]: '' }}
    >
      <ScrollArea className="h-full" viewportRef={body}>
        {children}
      </ScrollArea>
    </TabsContent>
  )
}

export function PanelTabs({ row }: { row: EndpointRow }) {
  return (
    <>
      <TabBody endpointId={row.id} value="Endpoint">
        {endpointSections(row).map((section) => (
          <RowsSection key={section.id} section={section} />
        ))}
      </TabBody>
      <TabBody endpointId={row.id} value="Model">
        {modelSections(row).map((section) => (
          <RowsSection key={section.id} section={section} />
        ))}
      </TabBody>
      <TabBody endpointId={row.id} value="Provider">
        {providerSections(row).map((section) => (
          <RowsSection key={section.id} section={section} />
        ))}
      </TabBody>
      <TabBody endpointId={row.id} value="History">
        <SectionBlock title="History">
          <p className="text-[13px]/[18px] text-muted-foreground">
            Price and stats history for this endpoint will appear here.
          </p>
        </SectionBlock>
      </TabBody>
    </>
  )
}
