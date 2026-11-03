import { TabsContent } from '@orca/ui/components/tabs'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { TABLE_KEYS_ATTRIBUTE } from '#app/keyboard'
import type { EndpointRow } from '#endpoints/snapshot'
import { modelPageUrl, providerPageUrl } from '#lib/openrouter'

import { modelRows, providerRows } from './facts'
import { ClampedText, FactLine, PageLink, RowsSection, SectionBlock } from './parts'
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
      className="min-h-0 flex-none grow basis-0 overflow-y-auto"
      ref={body}
      value={value}
      {...{ [TABLE_KEYS_ATTRIBUTE]: '' }}
    >
      {children}
    </TabsContent>
  )
}

export function PanelTabs({ row }: { row: EndpointRow }) {
  const { description, id: modelId } = row.model

  return (
    <>
      <TabBody endpointId={row.id} value="Endpoint">
        {endpointSections(row).map((section) => (
          <RowsSection key={section.id} section={section} />
        ))}
      </TabBody>
      <TabBody endpointId={row.id} value="Model">
        <SectionBlock title="Model">
          {modelRows(row).map((fact) => (
            <FactLine key={fact.id} row={fact} />
          ))}
        </SectionBlock>
        {description.trim() === '' ? null : (
          <SectionBlock title="Description">
            <ClampedText text={description.trim()} />
          </SectionBlock>
        )}
        <SectionBlock title="Links">
          <PageLink href={modelPageUrl(modelId)}>OpenRouter model page</PageLink>
        </SectionBlock>
      </TabBody>
      <TabBody endpointId={row.id} value="Provider">
        <SectionBlock title="Provider">
          {providerRows(row).map((fact) => (
            <FactLine key={fact.id} row={fact} />
          ))}
        </SectionBlock>
        <SectionBlock title="Links">
          <PageLink href={providerPageUrl(row.provider.id)}>OpenRouter provider page</PageLink>
        </SectionBlock>
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
