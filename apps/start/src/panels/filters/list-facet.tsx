import { Checkbox } from '@orca/ui/components/checkbox'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@orca/ui/components/input-group'
import { ScrollArea } from '@orca/ui/components/scroll-area'
import { cn } from 'cn'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'

import { EntityAvatar } from '#components/entity-avatar'
import { useScopeActions, useFacetCounts } from '#endpoints/hooks'
import { toggleValue } from '#endpoints/scope'

import { FACET_COUNT_CLASS, Facet } from './facet'
import { filterKeyAction } from './filter-keys'
import { useSnapshotOptions } from './hooks'
import { listMeta, orderOptions } from './options'
import type { FacetOption, OptionKind } from './options'
import { expectSelection, observeSelection, repin, setEngaged, startPin } from './pin-state'

const COPY = {
  model: {
    empty: 'No models match.',
    filter: 'Filter models',
    noun: { plural: 'models', singular: 'model' },
    title: 'Model',
  },
  provider: {
    empty: 'No providers match.',
    filter: 'Filter providers',
    noun: { plural: 'providers', singular: 'provider' },
    title: 'Provider',
  },
} as const

/** Rows the list shows before it scrolls. */
const VISIBLE_ROWS = 8

/**
 * The Model or Provider facet: a filter field over every value. Checked values combine with OR. The
 * count beside each value is the endpoints with that value that match every other facet, ignoring
 * this facet's own selection, so a zero count is dim: choosing it would add nothing.
 *
 * Selected values are pinned first, but only as of when the user last settled: ticking a row never
 * moves it, and the order catches up once the pointer and focus have both left the facet, or the
 * filter text changes, or the selection changes from outside (see `pin-state.ts`).
 */
export function ListFacet({ kind, selected }: { kind: OptionKind; selected: readonly string[] }) {
  const { options, search } = useSnapshotOptions()
  const counts = useFacetCounts()[kind]
  const { update } = useScopeActions()
  const copy = COPY[kind]

  const [query, setQuery] = useState('')
  const [storedPin, setStoredPin] = useState(() => startPin(selected))

  // A selection that changed from outside is taken in while rendering, so no frame shows it unpinned.
  const pin = observeSelection(storedPin, selected)

  if (pin !== storedPin) {
    setStoredPin(pin)
  }

  const filtering = query.trim() !== ''

  // Ranking every option is the facet's costly step, so it waits for its inputs to change.
  const all = useMemo(
    () => orderOptions(kind, options[kind], counts, pin.pinned),
    [counts, kind, options, pin.pinned],
  )

  const matches = useMemo(
    () => (filtering ? search[kind](query) : undefined),
    [filtering, kind, query, search],
  )

  const shown = useMemo(
    () =>
      matches === undefined ? all : orderOptions(kind, options[kind], counts, pin.pinned, matches),
    [all, counts, kind, matches, options, pin.pinned],
  )

  const total = all.pinned.length + all.rest.length
  const rowCount = shown.pinned.length + shown.rest.length
  const meta = listMeta(selected.length, total, copy.noun)

  const toggle = (id: string) => {
    const next = toggleValue(selected, id)

    setStoredPin((current) => expectSelection(current, next))
    update((current) => ({ [kind]: toggleValue(current[kind], id) }))
  }

  const changeQuery = (next: string) => {
    setQuery(next)
    setStoredPin((current) => repin(current, selected))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const action = filterKeyAction(
      { isComposing: event.nativeEvent.isComposing, key: event.key },
      query,
    )

    if (action === 'clear') {
      event.preventDefault()
      event.stopPropagation()
      changeQuery('')
    } else if (action === 'toggle-first') {
      event.preventDefault()

      const first = shown.pinned[0] ?? shown.rest[0]

      if (first !== undefined) {
        toggle(first.id)
      }
    }
  }

  const renderRow = (option: FacetOption) => {
    const count = counts.get(option.id) ?? 0
    const checked = selected.includes(option.id)

    return (
      <label
        className={cn(
          'flex h-6 cursor-pointer items-center gap-2 text-[13px] leading-4',
          count === 0 && !checked && 'opacity-50',
        )}
        key={option.id}
        title={option.id}
      >
        <Checkbox
          checked={checked}
          className="size-3.5 after:hidden"
          onCheckedChange={() => {
            toggle(option.id)
          }}
        />
        <EntityAvatar slug={option.id} />
        <span className="min-w-0 grow truncate">{option.name}</span>
        <span className={FACET_COUNT_CLASS}>{count}</span>
      </label>
    )
  }

  return (
    <Facet
      meta={
        <span className="tabular-nums">
          <span aria-hidden="true">{meta.text}</span>
          <span className="sr-only">{meta.label}</span>
        </span>
      }
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setStoredPin((current) => setEngaged(current, 'focus', false, selected))
        }
      }}
      onFocus={() => {
        setStoredPin((current) => setEngaged(current, 'focus', true, selected))
      }}
      onPointerEnter={() => {
        setStoredPin((current) => setEngaged(current, 'pointer', true, selected))
      }}
      onPointerLeave={() => {
        setStoredPin((current) => setEngaged(current, 'pointer', false, selected))
      }}
      title={copy.title}
    >
      <InputGroup className="mb-1 h-6">
        <InputGroupAddon className="py-0">
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={copy.filter}
          autoComplete="off"
          className="text-[13px] leading-4 md:text-[13px]"
          onChange={(event) => {
            changeQuery(event.target.value)
          }}
          onKeyDown={onKeyDown}
          placeholder={copy.filter}
          spellCheck={false}
          value={query}
        />
      </InputGroup>
      {rowCount === 0 ? (
        <output className="block py-1 text-[13px] leading-4 text-muted-foreground">
          {copy.empty}
        </output>
      ) : (
        <ScrollArea viewportClassName="max-h-48">
          <div
            aria-label={copy.title}
            className={cn(rowCount > VISIBLE_ROWS && 'pr-2.5')}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A fieldset would add a border and legend to a plain list of rows.
            role="group"
          >
            {shown.pinned.map(renderRow)}
            {shown.pinned.length > 0 && shown.rest.length > 0 && (
              <hr className="my-1 border-0 border-t border-border" />
            )}
            {shown.rest.map(renderRow)}
          </div>
        </ScrollArea>
      )}
    </Facet>
  )
}
