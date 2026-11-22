// PROTOTYPE, throwaway (issue #260). The four placements. Each composes Results or the left column its
// own way; they share only the Alert rows in `parts.tsx`.
import { ScrollArea } from '@orca/ui/components/scroll-area'
import { cn } from 'cn'
import type { ReactNode } from 'react'

import { tableTrailingInset } from '#app/panel-layout'
import { usePanelLayout } from '#app/panels'
import { StatusBar } from '#app/status-bar'
import { EntityAvatar } from '#components/entity-avatar'
import { useSelectedId, useSnapshot } from '#endpoints/hooks'
import { FiltersPanel } from '#panels/filters/filters-panel'
import { PlotRegion } from '#panels/results/plot/price-plot'
import { ResultsFrame, ResultsPanel, TableRegion } from '#panels/results/results-panel'
import { ScopeBar } from '#panels/results/scope-bar'

import { byScan, scanLabel, useAlerts } from './data'
import type { AlertItem } from './data'
import { AlertsList, AlertsNote, FollowToggle, MovementMark, useSelectAlert } from './parts'
import { useProto, useSetProto } from './proto'

function Segment({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      aria-pressed={on}
      className={cn(
        'h-6 rounded-sm px-2 text-xs whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        on
          ? 'bg-background font-medium text-foreground shadow-xs'
          : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

/** How many Alerts the loaded window holds, and how far back it reaches. */
function useWindowText(): string {
  const { all, shown } = useAlerts()
  const { at: now } = useSnapshot()
  const oldest = all.at(-1)
  const reach = oldest === undefined ? '' : ` · back to ${scanLabel(oldest.at, now).ago}`

  return `${shown.length} Alert${shown.length === 1 ? '' : 's'}${reach}`
}

// ───────────────────────────── A: a mode of Results ─────────────────────────────

function ModeSwitch() {
  const { alerts } = useProto()
  const setProto = useSetProto()
  const { shown } = useAlerts()

  return (
    <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
      <Segment
        on={!alerts}
        onClick={() => {
          setProto({ alerts: false })
        }}
      >
        Endpoints
      </Segment>
      <Segment
        on={alerts}
        onClick={() => {
          setProto({ alerts: true })
        }}
      >
        Alerts <span className="font-mono text-[10px] text-muted-foreground">{shown.length}</span>
      </Segment>
    </div>
  )
}

/** The Alerts list in the Table's place. It pads clear of the Endpoint drawer, as the Table's scroll area does. */
function AlertsMode() {
  const inset = tableTrailingInset(usePanelLayout(), useSelectedId() !== undefined)

  return (
    <>
      <div className="flex h-8 shrink-0 items-center justify-between gap-3 border-y border-border px-(--results-inset)">
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {useWindowText()}
        </span>
        <FollowToggle />
      </div>
      <ScrollArea className="min-h-0 grow">
        <div style={{ paddingRight: inset }}>
          <AlertsList layout="line" />
        </div>
      </ScrollArea>
    </>
  )
}

function ModeResults() {
  const { alerts } = useProto()

  return (
    <ResultsFrame>
      <ScopeBar extra={<ModeSwitch />} />
      {alerts ? (
        <AlertsMode />
      ) : (
        <>
          <PlotRegion />
          <TableRegion />
        </>
      )}
      <StatusBar />
    </ResultsFrame>
  )
}

// ───────────────────────────── B: a Panel in the left column ─────────────────────────────

function ColumnTabs() {
  const { alerts } = useProto()
  const setProto = useSetProto()
  const { shown } = useAlerts()

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-1.5">
      <div className="flex grow items-center gap-0.5 rounded-md bg-muted p-0.5">
        <span className="flex grow *:grow">
          <Segment
            on={!alerts}
            onClick={() => {
              setProto({ alerts: false })
            }}
          >
            Filters
          </Segment>
        </span>
        <span className="flex grow *:grow">
          <Segment
            on={alerts}
            onClick={() => {
              setProto({ alerts: true })
            }}
          >
            Alerts{' '}
            <span className="font-mono text-[10px] text-muted-foreground">{shown.length}</span>
          </Segment>
        </span>
      </div>
    </div>
  )
}

function ColumnAlerts() {
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {useWindowText()}
        </span>
        <FollowToggle />
      </div>
      <AlertsList layout="stack" />
    </>
  )
}

// ───────────────────────────── C: a band inside Results ─────────────────────────────

function BandToggle() {
  const { alerts } = useProto()
  const setProto = useSetProto()
  const { shown } = useAlerts()

  return (
    <div className="flex items-center rounded-md bg-muted p-0.5">
      <Segment
        on={alerts}
        onClick={() => {
          setProto({ alerts: !alerts })
        }}
      >
        Alerts <span className="font-mono text-[10px] text-muted-foreground">{shown.length}</span>
      </Segment>
    </div>
  )
}

/** One Alert on one line of a scan column: who, and the first two movements or the label. */
function BandEntry({ item }: { item: AlertItem }) {
  const select = useSelectAlert()(item)
  const selected = useSelectedId() === item.endpointId && item.endpointId !== null
  const moves = item.lines.filter((line) => line.movement !== null).slice(0, 2)

  const body = (
    <>
      {item.model !== null && <EntityAvatar className="size-3.5" slug={item.model.id} />}
      <span className="min-w-0 grow truncate text-[12px] leading-4">
        {item.model?.name ?? item.provider?.name}
        {item.provider !== null && item.model !== null && (
          <span className="text-muted-foreground">
            {' '}
            · {item.provider.tag ?? item.provider.name}
          </span>
        )}
      </span>
      <span className="flex shrink-0 gap-1.5 font-mono text-[10px] leading-4">
        {moves.length === 0 ? (
          <span className="text-muted-foreground uppercase">{item.label}</span>
        ) : (
          moves.map((line) => (
            <span key={line.label}>
              <span className="text-muted-foreground">{line.label.slice(0, 3)}</span>{' '}
              <MovementMark line={line} />
            </span>
          ))
        )}
      </span>
    </>
  )

  const title = item.lines.map((line) => `${line.label} ${line.text}`).join('\n')

  return select === null ? (
    <div className="flex h-5 items-center gap-1.5 px-2 opacity-70" title={title}>
      {body}
    </div>
  ) : (
    <button
      className={cn(
        'flex h-5 w-full items-center gap-1.5 px-2 text-left hover:bg-muted/60',
        selected && 'bg-muted',
      )}
      data-alert-row=""
      onClick={select}
      title={title}
      type="button"
    >
      {body}
    </button>
  )
}

/** How many Alerts a scan column shows before it says how many more there are. */
const BAND_ROWS = 4

/** Scans as columns, newest on the left, between the plot and the Table. It scrolls sideways through time. */
function AlertsBand() {
  const { shown } = useAlerts()
  const { at: now } = useSnapshot()

  return (
    <div className="shrink-0 border-t border-border">
      <div className="flex h-7 items-center justify-between gap-3 px-(--results-inset)">
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {useWindowText()}
        </span>
        <FollowToggle />
      </div>
      <div className="flex overflow-x-auto border-t border-border">
        {byScan(shown).map((group) => {
          const { ago, clock } = scanLabel(group.at, now)

          return (
            <section className="w-72 shrink-0 border-r border-border pb-1" key={group.at}>
              <div className="flex h-5 items-center gap-2 bg-muted px-2 font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">
                <span className="text-foreground">{clock}</span>
                <span>{ago}</span>
                <span className="ml-auto">{group.items.length}</span>
              </div>
              {group.items.slice(0, BAND_ROWS).map((item) => (
                <BandEntry item={item} key={item.key} />
              ))}
              {group.items.length > BAND_ROWS && (
                <div className="px-2 font-mono text-[10px] leading-5 text-muted-foreground">
                  +{group.items.length - BAND_ROWS} more
                </div>
              )}
            </section>
          )
        })}
        {shown.length === 0 && (
          <div className="grow">
            <AlertsNote />
          </div>
        )}
      </div>
    </div>
  )
}

function BandResults() {
  const { alerts } = useProto()

  return (
    <ResultsFrame>
      <ScopeBar extra={<BandToggle />} />
      <PlotRegion />
      {alerts && <AlertsBand />}
      <TableRegion />
      <StatusBar />
    </ResultsFrame>
  )
}

// ───────────────────────────── D: marks on Table rows ─────────────────────────────

function ChangedToggle() {
  const { alerts } = useProto()
  const setProto = useSetProto()
  const { byEndpoint } = useAlerts()

  return (
    <div className="flex items-center rounded-md bg-muted p-0.5">
      <Segment
        on={alerts}
        onClick={() => {
          setProto({ alerts: !alerts })
        }}
      >
        Changed{' '}
        <span className="font-mono text-[10px] text-muted-foreground">{byEndpoint.size}</span>
      </Segment>
    </div>
  )
}

function MarksResults() {
  return (
    <ResultsFrame>
      <ScopeBar extra={<ChangedToggle />} />
      <PlotRegion />
      <TableRegion />
      <StatusBar />
    </ResultsFrame>
  )
}

// ───────────────────────────── the two slots the page renders ─────────────────────────────

export function ProtoResults() {
  const { variant } = useProto()

  switch (variant) {
    case 'A': {
      return <ModeResults />
    }

    case 'C': {
      return <BandResults />
    }

    case 'D': {
      return <MarksResults />
    }

    case 'B': {
      return <ResultsPanel />
    }

    default: {
      return variant satisfies never
    }
  }
}

export function ProtoColumn() {
  const { alerts, variant } = useProto()

  return variant === 'B' ? (
    <FiltersPanel body={alerts ? <ColumnAlerts /> : undefined} subheader={<ColumnTabs />} />
  ) : (
    <FiltersPanel />
  )
}
