import { Button } from '@orca/ui/components/button'
import { Tabs, TabsList, TabsTrigger } from '@orca/ui/components/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@orca/ui/components/tooltip'
import { cn } from 'cn'
import { XIcon } from 'lucide-react'
import { useId, useLayoutEffect, useRef } from 'react'

import { returnFocusFromPanel, panelClosesOnEscape } from '#app/keyboard'
import { panelFrameClass, usePlacement } from '#app/panels'
import { EntityAvatar } from '#components/entity-avatar'
import { useScopeActions, useScopedRows } from '#endpoints/hooks'
import type { EndpointRow } from '#endpoints/snapshot'

import { CopyText } from './copy-text'
import { endpointTag, endpointTagDescription, slugParts, unlistedLine } from './header'
import { PanelTabs, TAB_NAMES } from './tabs'

/** The panel's eyebrow, which says when the filters exclude the selected endpoint. */
function Eyebrow({ id }: { id: string }) {
  const inScope = useScopedRows().some((row) => row.id === id)

  return inScope ? 'ENDPOINT' : <span className="text-foreground">NOT IN CURRENT FILTERS</span>
}

/** The selected endpoint: its curated facts, with its model and provider a tab away. */
export function EndpointPanel({ row }: { row: EndpointRow }) {
  const { selectEndpoint } = useScopeActions()
  const tag = endpointTag(row)
  const slug = slugParts(row)
  const unlisted = unlistedLine(row)
  const tagDescriptionId = useId()
  const placement = usePlacement()

  const panelRef = useRef<HTMLElement>(null)
  const endpointId = useRef(row.id)

  useLayoutEffect(() => {
    endpointId.current = row.id
  })

  // The panel unmounts whenever nothing is selected, however that came about, and takes the focused
  // element with it. A layout effect's cleanup runs before the DOM is removed, so focus is still
  // readable here. Empty deps: moving the selection between endpoints keeps the panel mounted.
  useLayoutEffect(() => {
    const panel = panelRef.current

    return () => {
      if (panel !== null) {
        returnFocusFromPanel(panel, document.activeElement, endpointId.current, (selector) =>
          document.querySelector<HTMLElement>(selector),
        )
      }
    }
  }, [])

  const close = () => {
    selectEndpoint(undefined)
  }

  return (
    <aside
      aria-label="Endpoint"
      ref={panelRef}
      className={cn('flex flex-col overflow-clip bg-popover', panelFrameClass(placement, 'w-85'))}
      // Esc closes the panel from anywhere inside it. The Table's document-level key rule skips the
      // tab list, so the panel owns Esc and keeps it from also reaching the Table. It listens in the
      // capture phase because a description tooltip's trigger stops Esc before it can bubble here.
      onKeyDownCapture={(event) => {
        if (panelClosesOnEscape(event.nativeEvent)) {
          event.stopPropagation()
          close()
        }
      }}
    >
      <TooltipProvider delay={250}>
        <Tabs className="min-h-0 grow gap-0" defaultValue="Endpoint">
          <header className="flex shrink-0 flex-col gap-2.5 border-b border-border px-4 pt-2">
            {/* The row clears the close button, which sits in the drawer's corner (below). */}
            <div className="-mb-1 flex h-7 items-center justify-between gap-2 pr-7 font-mono text-[10px] leading-3.5 text-muted-foreground pointer-coarse:h-8 pointer-coarse:pr-8">
              <span className="tracking-[0.08em]">
                <Eyebrow id={row.id} />
              </span>
              {/* Keyboard hints, which a touch screen has no keys for. */}
              <span className="pointer-coarse:hidden">↑↓ move · esc close</span>
            </div>
            {/*
              No ancestor between here and the drawer's popup is positioned, so this sits in the
              popup's corner, the Results header's inset from its top and right edges, and over the
              bottom drawer's swipe handle row. The right edge also clears a landscape phone's notch,
              which the popup pads for.
            */}
            <Button
              aria-label="Close endpoint panel"
              className="absolute top-(--drawer-corner-inset) right-[calc(var(--drawer-corner-inset)+env(safe-area-inset-right))] [--drawer-corner-inset:--spacing(2)]"
              onClick={close}
              size="icon"
              variant="ghost"
            >
              <XIcon aria-hidden data-icon="inline-start" />
            </Button>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <EntityAvatar className="size-8 rounded-md" slug={row.provider.id} />
                <div className="flex min-w-0 flex-col">
                  <div className="flex items-baseline gap-1.5">
                    <span className="truncate text-base/5 font-semibold tracking-[-0.01em]">
                      {row.provider.display_name}
                    </span>
                    {tag === null ? null : (
                      <>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span
                                aria-describedby={tagDescriptionId}
                                className={cn(
                                  'shrink-0 rounded-sm font-mono text-[11px] leading-[18px] text-muted-foreground',
                                  'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                                )}
                                // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The tag is the keyboard target for its description tooltip, which a screen reader reads through aria-describedby.
                                tabIndex={0}
                              />
                            }
                          >
                            {tag}
                          </TooltipTrigger>
                          <TooltipContent align="start">
                            {endpointTagDescription(row)}
                          </TooltipContent>
                        </Tooltip>
                        <span hidden id={tagDescriptionId}>
                          {endpointTagDescription(row)}
                        </span>
                      </>
                    )}
                  </div>
                  <span className="truncate text-xs/4 text-muted-foreground">{row.model.name}</span>
                </div>
              </div>
              <span className="flex min-w-0 flex-col items-start font-mono text-[11px]/4 text-muted-foreground">
                <CopyText className="min-w-0" label="Copy model ID" text={row.model.id}>
                  {row.model.id}
                </CopyText>
                <span className="flex max-w-full min-w-0 items-center gap-1.5">
                  <CopyText className="min-w-0" label="Copy provider tag" text={slug.tag}>
                    {slug.tag}
                  </CopyText>
                  ·
                  <CopyText label="Copy endpoint ID" text={slug.id}>
                    {slug.shortId}
                  </CopyText>
                </span>
              </span>
              {unlisted === null ? null : (
                <span className="text-xs/4 text-muted-foreground">{unlisted}</span>
              )}
            </div>
            <TabsList className="h-auto gap-4 p-0" variant="line">
              {TAB_NAMES.map((tab) => (
                <TabsTrigger
                  className="h-auto flex-none rounded-none px-0 pt-0 pb-2 text-[13px] leading-4 after:bottom-0"
                  key={tab}
                  value={tab}
                >
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </header>
          <PanelTabs row={row} />
        </Tabs>
      </TooltipProvider>
    </aside>
  )
}
