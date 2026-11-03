import { Button } from '@orca/ui/components/button'
import { useHotkey } from '@tanstack/react-hotkeys'
import { FlexRender, functionalUpdate, useTable } from '@tanstack/react-table'
import type { Header, Row } from '@tanstack/react-table'
import { cn } from 'cn'
import { memo, useEffect, useRef } from 'react'
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react'

import {
  useEndpointSearch,
  useEndpointSearchActions,
  useFilteredRows,
} from '#features/endpoints/hooks'
import { setHoveredEndpoint } from '#features/endpoints/hover'
import type { EndpointRow } from '#features/endpoints/rows'

import { columns, features } from './columns'
import { tableOwnsKeys } from './key-scope'
import { steppedRowId } from './navigation'
import type { Step } from './navigation'
import { fromSortingState, sortDirection, toSortingState } from './sorting'

type TableRowModel = Row<typeof features, EndpointRow>

type TableHeader = Header<typeof features, EndpointRow>

const cellPadding = 'px-2 first:pl-5 last:pr-5'

function ariaSort(direction: false | 'asc' | 'desc') {
  if (direction === false) {
    return undefined
  }

  return direction === 'asc' ? 'ascending' : 'descending'
}

/**
 * The sort direction comes from the URL's key, not `column.getIsSorted()`: the React Compiler
 * cannot see table state read through builder methods, so a cached header would never update.
 */
function SortHeader({
  direction,
  header,
}: {
  direction: false | 'asc' | 'desc'
  header: TableHeader
}) {
  const { column } = header
  const numeric = column.columnDef.meta?.numeric === true
  const sortable = column.getCanSort()

  return (
    <th
      aria-sort={ariaSort(direction)}
      className={cn(
        'sticky top-0 z-10 h-[30px] border-b border-border bg-background font-mono text-[10px] leading-3.5 font-normal tracking-[0.06em] text-muted-foreground uppercase',
        cellPadding,
        numeric ? 'text-right' : 'text-left',
        direction !== false && 'text-foreground',
      )}
      scope="col"
    >
      {sortable ? (
        <button
          className={cn(
            'relative inline-flex h-full max-w-full items-center rounded-sm uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
            numeric && 'justify-end',
          )}
          onClick={column.getToggleSortingHandler()}
          type="button"
        >
          <FlexRender header={header} />
          {direction === false ? null : (
            <span
              aria-hidden="true"
              className={cn('absolute', numeric ? 'right-full pr-1' : 'left-full pl-1')}
            >
              {direction === 'asc' ? '↑' : '↓'}
            </span>
          )}
        </button>
      ) : (
        <FlexRender header={header} />
      )}
    </th>
  )
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
        'scroll-mt-[30px] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        selected ? 'bg-selection-surface' : 'hover:bg-muted-hover',
        row.original.unlisted && 'opacity-50',
      )}
      data-endpoint-id={row.id}
      tabIndex={tabbable ? 0 : -1}
    >
      {row.getAllCells().map((cell) => (
        <td
          className={cn(
            'h-8 border-b border-border align-middle',
            cellPadding,
            cell.column.columnDef.meta?.numeric === true &&
              'text-right font-mono text-xs tabular-nums',
            selected && 'first:shadow-[inset_2px_0_0_var(--selection)]',
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

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <tr>
      <td className="px-5 py-16 text-center" colSpan={columns.length}>
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
 */
export function EndpointTable() {
  const rows = useFilteredRows()
  const { endpoint: selectedId, sort } = useEndpointSearch()
  const { clearFilters, selectEndpoint, setSort } = useEndpointSearchActions()
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
    <table className="w-full min-w-190 table-fixed border-separate border-spacing-0">
      <colgroup>
        {table.getAllLeafColumns().map((column) => (
          <col key={column.id} style={{ width: column.columnDef.meta?.width }} />
        ))}
      </colgroup>
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => (
              <SortHeader
                direction={sortDirection(sort, header.column.id)}
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
          tableRows.map((row) => (
            <MemoTableRow
              key={row.id}
              row={row}
              selected={row.id === selectedId}
              tabbable={row.id === tabbableId}
            />
          ))
        )}
      </tbody>
    </table>
  )
}
