import { cn } from 'cn'
import { Search } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode, Ref } from 'react'

import { EntityAvatar } from '#components/entity-avatar'
import { FACET_COUNT_CLASS } from '#components/facet'
import type { FacetOption } from '#features/filters/options'
import { optionKey } from '#features/filters/options'

/**
 * A type-ahead over models and providers: an ARIA combobox with a listbox of matches. Arrow keys move
 * through matches, Enter picks one, Escape closes the list and then clears the text. Picking keeps
 * focus in the field, so several values can be added in a row.
 *
 * `bar` is the boxed search field whose list floats over the panel below it. `inline` is the quiet
 * "Find a …" field inside a facet, whose list takes its own space in the flow.
 */
export function OptionSearch({
  hint,
  inputRef,
  label,
  meta,
  noMatches,
  onSelect,
  placeholder,
  search,
  variant,
}: {
  /** Shown at the right of the bar, such as the shortcut that focuses it. */
  hint?: ReactNode
  inputRef?: Ref<HTMLInputElement>
  /** The field's accessible name. */
  label: string
  /** The right-hand figure for a match, such as its kind or its count. */
  meta: (option: FacetOption) => ReactNode
  noMatches: string
  onSelect: (option: FacetOption) => void
  placeholder: string
  search: (query: string) => FacetOption[]
  variant: 'bar' | 'inline'
}) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const results = search(query)
  const active = Math.min(activeIndex, results.length - 1)
  const showList = open && query.trim() !== ''
  const expanded = showList && results.length > 0
  const optionId = (index: number) => `${listId}-${index}`

  const choose = (option: FacetOption) => {
    onSelect(option)
    setQuery('')
    setActiveIndex(0)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)

      if (results.length > 0) {
        const step = event.key === 'ArrowDown' ? 1 : -1

        const next = (active + step + results.length) % results.length

        setActiveIndex(next)
        // Only the keyboard scrolls: hover also moves the active option, and must not shift the list.
        listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
      }
    } else if (event.key === 'Enter') {
      const option = results[active]

      if (expanded && option !== undefined) {
        event.preventDefault()
        choose(option)
      }
    } else if (event.key === 'Escape') {
      if (showList) {
        setOpen(false)
      } else {
        setQuery('')
      }
    }
  }

  const list = showList && (
    <div
      className={cn(
        'overflow-y-auto',
        variant === 'bar'
          ? 'absolute inset-x-3 top-[calc(100%-6px)] z-30 max-h-72 rounded-md border border-border-solid bg-popover p-1 shadow-lg'
          : 'max-h-40 pb-1',
      )}
    >
      {results.length === 0 ? (
        <output className="block px-2 py-1.5 text-xs text-muted-foreground">{noMatches}</output>
      ) : (
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A combobox popup needs a listbox of custom rows, which a native select cannot render.
        <div aria-label={label} id={listId} ref={listRef} role="listbox">
          {results.map((option, index) => (
            // Keyboard users act through the input, which owns focus; the options are for the pointer.
            // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- The combobox input handles keys.
            <div
              aria-selected={index === active}
              className={cn(
                'flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-[13px] leading-4',
                index === active && 'bg-muted',
              )}
              id={optionId(index)}
              key={optionKey(option)}
              onClick={() => {
                choose(option)
              }}
              onMouseDown={(event) => {
                // Keep focus in the field.
                event.preventDefault()
              }}
              onMouseMove={() => {
                setActiveIndex(index)
              }}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A native option cannot hold a logo.
              role="option"
              tabIndex={-1}
              title={option.id}
            >
              <EntityAvatar slug={option.id} />
              <span className="min-w-0 grow truncate">{option.name}</span>
              <span className={FACET_COUNT_CLASS}>{meta(option)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const input = (
    <input
      aria-activedescendant={expanded ? optionId(active) : undefined}
      aria-autocomplete="list"
      aria-controls={expanded ? listId : undefined}
      aria-expanded={expanded}
      aria-label={label}
      autoComplete="off"
      className={cn(
        'min-w-0 grow bg-transparent text-[13px] leading-4 outline-none placeholder:text-muted-foreground',
        variant === 'inline' && 'h-6 rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50',
      )}
      onBlur={() => {
        setOpen(false)
      }}
      onChange={(event) => {
        setQuery(event.target.value)
        setActiveIndex(0)
        setOpen(true)
      }}
      onFocus={() => {
        setOpen(true)
      }}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      ref={inputRef}
      role="combobox"
      spellCheck={false}
      type="text"
      value={query}
    />
  )

  if (variant === 'inline') {
    return (
      <div>
        {input}
        {list}
      </div>
    )
  }

  return (
    <div className="relative shrink-0 px-3 pb-2.5">
      <label className="flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
        <Search aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        {input}
        {hint}
      </label>
      {list}
    </div>
  )
}
