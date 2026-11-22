// PROTOTYPE, throwaway (issue #260).
import { useSelector } from '@tanstack/react-store'
import { createAtom } from '@tanstack/store'
import { cn } from 'cn'
import type { ReactNode } from 'react'

import { EntityAvatar } from '#components/entity-avatar'
import { useScopeActions, useSelectedId, useSnapshot } from '#endpoints/hooks'

import { byScan, scanLabel, useAlerts } from './data'
import type { AlertItem, ChangeLine } from './data'
import { useProto, useSetProto } from './proto'

/** The Endpoint panel's tab, lifted so selecting an Alert can open the panel on History. */
const panelTab = createAtom<string>('Endpoint')

export function usePanelTab(): [string, (tab: string) => void] {
  return [
    useSelector(panelTab),
    (tab) => {
      panelTab.set(tab)
    },
  ]
}

const TONE_CLASS = {
  added: 'text-emerald-700 dark:text-emerald-400',
  removed: 'text-destructive',
  updated: 'text-muted-foreground',
} as const

export function MovementMark({ line }: { line: ChangeLine }) {
  if (line.movement === null) {
    return null
  }

  return (
    <span
      className={
        line.movement.isFavorable ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'
      }
    >
      {line.movement.isUp ? '▲' : '▼'}
      {line.movement.percent}
    </span>
  )
}

function Changes({ item, wrap }: { item: AlertItem; wrap: boolean }) {
  return (
    <span
      className={cn(
        'flex min-w-0 gap-x-3 font-mono text-[11px] leading-4',
        wrap ? 'flex-col' : 'flex-wrap',
      )}
    >
      {item.lines.map((line) => (
        <span className="min-w-0 break-words" key={line.label}>
          <span className="text-muted-foreground">{line.label}</span> {line.text}{' '}
          <MovementMark line={line} />
        </span>
      ))}
    </span>
  )
}

function KindLabel({ item }: { item: AlertItem }) {
  return (
    <span
      className={cn(
        'shrink-0 font-mono text-[10px] leading-4 tracking-[0.06em] uppercase',
        TONE_CLASS[item.tone],
      )}
    >
      {item.kind === 'endpoint' ? item.label : `${item.kind} ${item.label}`}
    </span>
  )
}

/** Selects an Alert's endpoint and opens the Endpoint panel on History. Null when it has no row to select. */
export function useSelectAlert(): (item: AlertItem) => (() => void) | null {
  const { byId } = useSnapshot()
  const { selectEndpoint } = useScopeActions()
  const [, setTab] = usePanelTab()

  return (item) => {
    const id = item.endpointId

    return id !== null && byId.has(id)
      ? () => {
          setTab('History')
          selectEndpoint(id)
        }
      : null
  }
}

function RowShell({
  children,
  className,
  item,
}: {
  children: ReactNode
  className: string
  item: AlertItem
}) {
  const select = useSelectAlert()(item)
  const selected = useSelectedId() === item.endpointId && item.endpointId !== null

  return select === null ? (
    <div className={cn(className, 'opacity-70')} title="Not in the Catalog snapshot">
      {children}
    </div>
  ) : (
    <button
      aria-pressed={selected}
      data-alert-row=""
      className={cn(
        className,
        'w-full text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
        selected && 'bg-muted',
      )}
      onClick={select}
      type="button"
    >
      {children}
    </button>
  )
}

/** One line where the list is wide: model, provider, label, changes. Stacks where it is not. */
function LineRow({ item }: { item: AlertItem }) {
  return (
    <RowShell
      className="flex flex-col gap-x-4 gap-y-0.5 border-b border-border px-(--results-inset) py-1.5 @min-[680px]/alerts:flex-row @min-[680px]/alerts:items-baseline"
      item={item}
    >
      <span className="flex min-w-0 items-center gap-2 @min-[680px]/alerts:w-56 @min-[680px]/alerts:shrink-0">
        {item.model !== null && <EntityAvatar slug={item.model.id} />}
        <span className="truncate text-[13px] leading-4">
          {item.model?.name ?? item.provider?.name}
        </span>
      </span>
      {item.model !== null && item.provider !== null && (
        <span className="flex min-w-0 items-center gap-2 @min-[680px]/alerts:w-44 @min-[680px]/alerts:shrink-0">
          <EntityAvatar slug={item.provider.id} />
          <span className="truncate text-[12px] leading-4 text-muted-foreground">
            {item.provider.tag ?? item.provider.name}
          </span>
        </span>
      )}
      <span className="@min-[680px]/alerts:w-20 @min-[680px]/alerts:shrink-0">
        <KindLabel item={item} />
      </span>
      <Changes item={item} wrap={false} />
    </RowShell>
  )
}

/** A narrow column's row: identity, then the label, then each change on its own line. */
function StackRow({ item }: { item: AlertItem }) {
  return (
    <RowShell className="flex flex-col gap-0.5 border-b border-border px-3 py-1.5" item={item}>
      <span className="flex min-w-0 items-center gap-2">
        {item.model !== null && <EntityAvatar slug={item.model.id} />}
        <span className="min-w-0 grow truncate text-[13px] leading-4">
          {item.model?.name ?? item.provider?.name}
        </span>
        <KindLabel item={item} />
      </span>
      {item.model !== null && item.provider !== null && (
        <span className="truncate pl-6 text-[11px] leading-3.5 text-muted-foreground">
          {item.provider.tag ?? item.provider.name}
        </span>
      )}
      <span className="pl-6">
        <Changes item={item} wrap />
      </span>
    </RowShell>
  )
}

function ScanHeader({ at, count, inset }: { at: string; count: number; inset: string }) {
  const { at: now } = useSnapshot()
  const { ago, clock } = scanLabel(at, now)

  return (
    <div
      className={cn(
        'sticky top-0 z-10 flex h-6 items-center gap-2 border-b border-border bg-muted font-mono text-[10px] leading-3.5 tracking-[0.06em] text-muted-foreground uppercase',
        inset,
      )}
    >
      <span className="text-foreground">{clock}</span>
      <span>{ago}</span>
      <span className="ml-auto">{count}</span>
    </div>
  )
}

export function AlertsNote() {
  const { all, filtered, loading, shown, untestable } = useAlerts()

  if (loading) {
    return <p className="p-3 text-xs text-muted-foreground">Loading Alerts…</p>
  }

  return (
    <>
      {shown.length === 0 && (
        <p className="p-3 text-xs text-muted-foreground">
          {filtered ? 'No Alerts for the endpoints in scope.' : 'No Alerts.'}
        </p>
      )}
      {filtered && untestable > 0 && (
        <p className="p-3 text-[11px] leading-4 text-muted-foreground">
          {untestable} of {all.length} Alerts hidden: their endpoints have left the Catalog
          snapshot, so the filters cannot be tested against them.
        </p>
      )}
    </>
  )
}

/** The Alerts shown, grouped by scan, newest first. */
export function AlertsList({ layout }: { layout: 'line' | 'stack' }) {
  const { shown } = useAlerts()
  const Row = layout === 'line' ? LineRow : StackRow

  return (
    <div className="@container/alerts">
      {byScan(shown).map((group) => (
        <section key={group.at}>
          <ScanHeader
            at={group.at}
            count={group.items.length}
            inset={layout === 'line' ? 'px-(--results-inset)' : 'px-3'}
          />
          {group.items.map((item) => (
            <Row item={item} key={item.key} />
          ))}
        </section>
      ))}
      <AlertsNote />
    </div>
  )
}

/** Whether the Endpoints filters narrow the Alerts: the ticket's second question, as a control. */
export function FollowToggle({ className }: { className?: string }) {
  const { all, filtered, shown } = useAlerts()
  const { follow } = useProto()
  const setProto = useSetProto()

  const option = (value: boolean, text: string) => (
    <button
      aria-pressed={follow === value}
      className={cn(
        'h-5 rounded-sm px-1.5 font-mono text-[10px] leading-4 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        follow === value
          ? 'bg-background text-foreground shadow-xs'
          : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={() => {
        setProto({ follow: value })
      }}
      type="button"
    >
      {text}
    </button>
  )

  return (
    <div className={cn('flex shrink-0 items-center gap-0.5 rounded-md bg-muted p-0.5', className)}>
      {option(true, filtered ? `In scope ${shown.length}` : 'In scope')}
      {option(false, `All ${all.length}`)}
    </div>
  )
}

/** One endpoint's Alerts, for the Endpoint panel's History tab. */
export function EndpointAlerts({ id }: { id: string }) {
  const items = useAlerts().byEndpoint.get(id) ?? []
  const { at: now } = useSnapshot()

  if (items.length === 0) {
    return (
      <p className="px-4 py-3 text-[13px]/[18px] text-muted-foreground">
        No Alerts for this endpoint in the loaded window.
      </p>
    )
  }

  return (
    <ul>
      {items.map((item) => {
        const { ago, clock } = scanLabel(item.at, now)

        return (
          <li className="flex flex-col gap-1 border-b border-border px-4 py-2" key={item.key}>
            <span className="flex items-baseline gap-2 font-mono text-[10px] leading-4 tracking-[0.06em] text-muted-foreground uppercase">
              <span className="text-foreground">{clock}</span>
              <span>{ago}</span>
              <span className="ml-auto">
                <KindLabel item={item} />
              </span>
            </span>
            <Changes item={item} wrap />
          </li>
        )
      })}
    </ul>
  )
}
