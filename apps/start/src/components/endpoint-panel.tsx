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

import { EntityAvatar } from '#components/entity-avatar'
import { FOCUS_RING } from '#components/facet'
import { useEndpointSearchActions, useFilteredRows } from '#features/endpoints/hooks'
import type { EndpointRow } from '#features/endpoints/rows'
import { returnFocusFromPanel } from '#features/table/focus'
import { panelClosesOnEscape } from '#features/table/key-scope'

import {
  endpointTag,
  endpointTagDescription,
  slugLine,
  unlistedLine,
} from '../features/endpoint-panel/identity'
import { NOT_IN_FILTERS, positionText } from '../features/endpoint-panel/position'
import { PanelTabs, TAB_NAMES } from '../features/endpoint-panel/tabs'

function Position({ id }: { id: string }) {
  const text = positionText(useFilteredRows(), id)

  return <span className={text === NOT_IN_FILTERS ? 'text-foreground' : undefined}>{text}</span>
}

/** The selected endpoint: its curated facts, with its model and provider a tab away. */
export function EndpointPanel({ row }: { row: EndpointRow }) {
  const { selectEndpoint } = useEndpointSearchActions()
  const tag = endpointTag(row)
  const unlisted = unlistedLine(row)
  const tagDescriptionId = useId()

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
      className="flex w-85 shrink-0 flex-col overflow-clip rounded-xl border border-border bg-popover"
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
          <header className="flex shrink-0 flex-col gap-2.5 border-b border-border px-4 pt-3">
            <div className="flex h-5 items-center justify-between font-mono text-[10px] leading-3.5 text-muted-foreground">
              <span className="tracking-[0.08em]">
                <Position id={row.id} />
              </span>
              <span className="flex items-center gap-1.5">
                ↑↓ move · esc close
                <Button
                  aria-label="Close endpoint panel"
                  onClick={close}
                  size="icon-xs"
                  variant="ghost"
                >
                  <XIcon aria-hidden />
                </Button>
              </span>
            </div>
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
                                  FOCUS_RING,
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
              <span className="truncate font-mono text-[11px]/4 text-muted-foreground">
                {slugLine(row)}
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
