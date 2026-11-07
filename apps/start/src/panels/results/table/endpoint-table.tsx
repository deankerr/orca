import { Button } from '@orca/ui/components/button'
import { useHotkey } from '@tanstack/react-hotkeys'
import { FlexRender, functionalUpdate, useTable } from '@tanstack/react-table'
import type { Header, Row } from '@tanstack/react-table'
import { cn } from 'cn'
import { memo, useEffect, useRef } from 'react'
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react'

import { tableOwnsKeys } from '#app/keyboard'
import { useDeferredScopedRows, useScopeActions, useSelectedId, useSort } from '#endpoints/hooks'
import { setHoveredEndpoint } from '#endpoints/hover'
import type { EndpointRow } from '#endpoints/snapshot'
import type { SortKey } from '#endpoints/sort'
import { StaleVeil } from '#panels/results/stale-veil'

import { columns, features } from './columns'
import { steppedRowId } from './navigation'
import type { Step } from './navigation'
import { fromSortingState, sortDirection, toSortingState } from './sorting-state'

type TableRowModel = Row<typeof features, EndpointRow>

type TableHeader = Header<typeof features, EndpointRow>

/** The classes the table's cells share, which the loading skeleton reuses so the two line up. */
export const CELL_PADDING_CLASS = 'px-2 first:pl-(--results-inset) last:pr-(--results-inset)'

/**
 * The Model column stays put while the figures scroll under it. A panel too narrow for the whole table
 * scrolls it sideways, and there the column's edge shows as a rule.
 */
const STICKY_MODEL_CLASS = 'first:sticky first:left-0 @max-3xl/results:first:border-r'

export const HEADER_CELL_CLASS = `sticky top-0 z-10 h-[30px] border-b border-border bg-background font-mono text-[10px] leading-3.5 font-normal tracking-[0.06em] text-muted-foreground uppercase first:z-20 ${STICKY_MODEL_CLASS}`

/** Rows grow to a touch target where the pointer is a finger. */
export const BODY_CELL_CLASS = `h-8 border-b border-border align-middle pointer-coarse:h-10 first:z-[1] first:bg-background ${STICKY_MODEL_CLASS}`

/**
 * The table's own wrapper: as wide as the region, and no narrower than its columns need. Its padding
 * falls outside that width, so trailing padding widens what scrolls without widening the table.
 */
export const TABLE_WRAPPER_CLASS = 'relative box-content w-full min-w-190 @max-lg/results:min-w-144'

/**
 * Hides a folding column (`meta.folds`) in a Results panel narrower than 32rem, a phone's. Its column,
 * header, and cells all go, and the table's minimum width drops by its 184px (see `TABLE_WRAPPER_CLASS`),
 * so the figures start beside the sticky Model column instead of a screen's width away.
 */
export const FOLDED_CLASS = '@max-lg/results:hidden'

/** Shown only in a Results panel narrow enough to fold a column; the folded column's stand-in. */
export const FOLDED_ONLY_CLASS = 'hidden @max-lg/results:inline-flex'

export const TABLE_CLASS = 'w-full table-fixed border-separate border-spacing-0'

function ariaSort(direction: false | 'asc' | 'desc') {
  if (direction === false) {
    return undefined
  }

  return direction === 'asc' ? 'ascending' : 'descending'
}

type Direction = false | 'asc' | 'desc'

/**
 * A header's sort button. The active direction's arrow hangs off the label's outer edge, so sorting
 * never moves the label.
 *
 * The arrow is decorative. `<th aria-sort>` tells assistive tech a column's sort, but a button inside
 * another column's header (see `SortHeader`'s `folded`) has no `<th>` of its own, so `announceSort`
 * has the button say its sort state in its name.
 */
function SortButton({
  announceSort,
  className,
  direction,
  header,
}: {
  announceSort?: boolean
  className?: string
  direction: Direction
  header: TableHeader
}) {
  const numeric = header.column.columnDef.meta?.numeric === true

  return (
    <button
      className={cn(
        'relative inline-flex h-full max-w-full items-center rounded-sm uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
        numeric && 'justify-end',
        direction !== false && 'text-foreground',
        className,
      )}
      onClick={header.column.getToggleSortingHandler()}
      type="button"
    >
      <FlexRender header={header} />
      {announceSort === true && direction !== false && (
        <span className="sr-only">, sorted {ariaSort(direction)}</span>
      )}
      {direction === false ? null : (
        <span
          aria-hidden="true"
          className={cn('absolute', numeric ? 'right-full pr-1' : 'left-full pl-1')}
        >
          {direction === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </button>
  )
}

/**
 * The sort direction comes from the URL's key, not `column.getIsSorted()`: the React Compiler
 * cannot see table state read through builder methods, so a cached header would never update.
 *
 * `folded` is the header of a column folded into this one (see `FOLDED_CLASS`). Its own header is
 * hidden where it folds (`display: none`, so it is out of the accessibility tree and its `aria-sort`
 * with it), so this one carries a sort button for it, shown only there, that names its own sort state.
 */
function SortHeader({
  direction,
  folded,
  header,
}: {
  direction: Direction
  folded?: { direction: Direction; header: TableHeader } | undefined
  header: TableHeader
}) {
  const { column } = header
  const numeric = column.columnDef.meta?.numeric === true

  return (
    <th
      aria-sort={ariaSort(direction)}
      className={cn(
        HEADER_CELL_CLASS,
        CELL_PADDING_CLASS,
        column.columnDef.meta?.folds === true && FOLDED_CLASS,
        numeric ? 'text-right' : 'text-left',
      )}
      scope="col"
    >
      {column.getCanSort() ? (
        <>
          <SortButton direction={direction} header={header} />
          {folded !== undefined && (
            <>
              {/* Wide enough for the Model arrow, which hangs off the label's trailing edge. */}
              <span aria-hidden="true" className={cn('mx-3', FOLDED_ONLY_CLASS)}>
                /
              </span>
              <SortButton
                announceSort
                className={FOLDED_ONLY_CLASS}
                direction={folded.direction}
                header={folded.header}
              />
            </>
          )}
        </>
      ) : (
        <FlexRender header={header} />
      )}
    </th>
  )
}

/** The Provider header and its sort direction, for the Model header that carries it where it folds. */
function foldedProvider(headers: TableHeader[], sort: SortKey) {
  const header = headers.find((candidate) => candidate.column.id === 'provider')

  return header === undefined ? undefined : { direction: sortDirection(sort, 'provider'), header }
}

function TableRow({
  row,
  selected,
  tabbable,
}: {
  row: TableRowModel
  selected: boolean
  tabbable: boolean
}) {
  return (
    <tr
      aria-selected={selected}
      className={cn(
        'group cursor-pointer scroll-mt-[30px] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        selected ? 'bg-selection-surface' : 'hover:bg-muted-hover',
        row.original.unlisted && 'opacity-50',
      )}
      data-endpoint-id={row.id}
      tabIndex={tabbable ? 0 : -1}
    >
      {row.getAllCells().map((cell) => (
        <td
          className={cn(
            BODY_CELL_CLASS,
            CELL_PADDING_CLASS,
            cell.column.columnDef.meta?.folds === true && FOLDED_CLASS,
            cell.column.columnDef.meta?.numeric === true &&
              'text-right font-mono text-xs tabular-nums',
            // The sticky Model cell paints its own background, so it repeats the row's.
            selected
              ? 'first:bg-selection-surface first:shadow-[inset_2px_0_0_var(--selection)]'
              : 'group-hover:first:bg-muted-hover',
          )}
          key={cell.id}
        >
          <FlexRender cell={cell} />
        </td>
      ))}
    </tr>
  )
}

/**
 * Rows render again only when their endpoint, selection, or tab stop changes. Table rebuilds its
 * row objects whenever the data array changes, as it does on every sort, but a row's cells depend
 * on nothing except its endpoint, so a re-sort only moves the existing elements.
 */
const MemoTableRow = memo(
  TableRow,
  (previous, next) =>
    previous.row.original === next.row.original &&
    previous.selected === next.selected &&
    previous.tabbable === next.tabbable,
)

/**
 * The body's rows, apart from the Table so that a render that leaves them alone skips them. The
 * compiler cannot memoise them in `EndpointTable`: they come from the table object's methods. This
 * is what lets the pass that only marks the Table stale, which keeps the old rows, cost nothing.
 */
function TableRowList({
  rows,
  selectedId,
  tabbableId,
}: {
  rows: TableRowModel[]
  selectedId: string | undefined
  tabbableId: string | undefined
}) {
  return rows.map((row) => (
    <MemoTableRow
      key={row.id}
      row={row}
      selected={row.id === selectedId}
      tabbable={row.id === tabbableId}
    />
  ))
}

const TableRows = memo(TableRowList)

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <tr>
      <td className="px-(--results-inset) py-16 text-center" colSpan={columns.length}>
        <div className="flex flex-col items-center gap-3">
          <p className="text-[13px] text-muted-foreground">No endpoints match these filters</p>
          <Button aria-label="Clear filters" onClick={onClear} size="sm" variant="outline">
            Clear filters
          </Button>
        </div>
      </td>
    </tr>
  )
}

/** The endpoint ID of the row an event came from. */
function eventRowId(event: { target: EventTarget }): string | undefined {
  return event.target instanceof Element
    ? event.target.closest<HTMLElement>('tr[data-endpoint-id]')?.dataset.endpointId
    : undefined
}

/**
 * Options for the keys the Table binds at document level. A widget that claims a key (a text field,
 * slider, or other ARIA widget) is skipped by `ignoreInputs`; `tableOwnsKeys` then limits the keys
 * to focus in the Table's region. The library would prevent the default and stop propagation for
 * every match, which would swallow the key before a widget outside the region could use it, so both
 * wait until the Table has taken the key.
 */
const tableKeyOptions = {
  ignoreInputs: true,
  preventDefault: false,
  stopPropagation: false,
} as const

function ifTableOwnsKeys(event: globalThis.KeyboardEvent, act: () => void) {
  if (tableOwnsKeys(document.activeElement, document.body)) {
    event.preventDefault()
    act()
  }
}

/**
 * Endpoints as a table, sorted by the URL. The rows arrive filtered and sorted, so the table only
 * lays them out; its sorting state mirrors the URL and header clicks write back to it.
 *
 * The rows trail the filters (see `useDeferredFilteredRows`). While they catch up the body dims
 * (see `StaleVeil`) and the table is `aria-busy`. The header, selection, and sort stay current: keys
 * step through the rows on screen, and the selection is in the URL, so it can name a row the next
 * pass removes.
 *
 * `trailingInset` is the width, in pixels, of a drawer floating over the Table's end.
 */
export function EndpointTable({ trailingInset }: { trailingInset: number }) {
  const { rows, stale } = useDeferredScopedRows()
  const selectedId = useSelectedId()
  const sort = useSort()
  const { clearFilters, selectEndpoint, setSort } = useScopeActions()
  const body = useRef<HTMLTableSectionElement>(null)

  const sorting = toSortingState(sort)

  const table = useTable({
    columns,
    data: rows,
    enableMultiSort: false,
    enableSortingRemoval: false,
    features,
    getRowId: (row) => row.id,
    manualSorting: true,
    onSortingChange: (updater) => {
      const next = fromSortingState(functionalUpdate(updater, sorting))

      if (next !== null) {
        setSort(next)
      }
    },
    state: { sorting },
  })

  const tableRows = table.getRowModel().rows
  const selectedVisible = rows.some((row) => row.id === selectedId)
  const tabbableId = selectedVisible ? selectedId : rows[0]?.id

  const moveSelection = (step: Step) => {
    const id = steppedRowId(
      rows.map((row) => row.id),
      selectedId,
      step,
    )

    if (id !== null) {
      selectEndpoint(id)
    }
  }

  useHotkey(
    'ArrowDown',
    (event) => {
      ifTableOwnsKeys(event, () => {
        moveSelection('next')
      })
    },
    tableKeyOptions,
  )
  useHotkey(
    'ArrowUp',
    (event) => {
      ifTableOwnsKeys(event, () => {
        moveSelection('previous')
      })
    },
    tableKeyOptions,
  )
  useHotkey(
    'Escape',
    (event) => {
      ifTableOwnsKeys(event, () => {
        selectEndpoint(undefined)
      })
    },
    { ...tableKeyOptions, enabled: selectedId !== undefined },
  )

  // Keep the selection in view below the sticky header, and keep keyboard focus on it when the
  // selection moves between rows.
  useEffect(() => {
    if (selectedId === undefined) {
      return
    }

    const row = body.current?.querySelector<HTMLElement>(
      `tr[data-endpoint-id="${CSS.escape(selectedId)}"]`,
    )

    if (row === null || row === undefined) {
      return
    }

    if (body.current?.contains(document.activeElement) === true) {
      row.focus({ preventScroll: true })
    }

    row.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  useEffect(
    () => () => {
      setHoveredEndpoint(null)
    },
    [],
  )

  const select = (event: MouseEvent) => {
    const id = eventRowId(event)

    if (id !== undefined) {
      selectEndpoint(id)
    }
  }

  const selectFromKey = (event: KeyboardEvent) => {
    const id = eventRowId(event)

    if ((event.key === 'Enter' || event.key === ' ') && id !== undefined) {
      event.preventDefault()
      selectEndpoint(id)
    }
  }

  const hover = (event: PointerEvent) => {
    setHoveredEndpoint(eventRowId(event) ?? null)
  }

  return (
    <div
      aria-busy={stale}
      className={TABLE_WRAPPER_CLASS}
      // Room after the last column, so it can scroll out from under a drawer floating over it.
      style={{ paddingRight: trailingInset }}
    >
      <table className={TABLE_CLASS}>
        <colgroup>
          {table.getAllLeafColumns().map((column) => (
            <col
              className={cn(column.columnDef.meta?.folds === true && FOLDED_CLASS)}
              key={column.id}
              style={{ width: column.columnDef.meta?.width }}
            />
          ))}
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <SortHeader
                  direction={sortDirection(sort, header.column.id)}
                  // The Model cell shows the Provider column where it folds, so its header does too.
                  folded={
                    header.column.id === 'model' ? foldedProvider(group.headers, sort) : undefined
                  }
                  header={header}
                  key={header.id}
                />
              ))}
            </tr>
          ))}
        </thead>
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Rows are the interactive elements; one delegated handler serves ~1,500 of them, and keys reach them through onKeyDown. */}
        <tbody
          onClick={select}
          onKeyDown={selectFromKey}
          onPointerLeave={() => {
            setHoveredEndpoint(null)
          }}
          onPointerOver={hover}
          ref={body}
        >
          {tableRows.length === 0 ? (
            <EmptyState onClear={clearFilters} />
          ) : (
            <TableRows rows={tableRows} selectedId={selectedId} tabbableId={tabbableId} />
          )}
        </tbody>
      </table>
      {/* Below the sticky header, which keeps its place. */}
      <StaleVeil className="inset-x-0 top-[30px] bottom-0" stale={stale} />
    </div>
  )
}
