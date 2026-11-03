import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from '@orca/ui/components/autocomplete'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@orca/ui/components/input-group'
import { cn } from 'cn'
import { Search } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ComponentProps, ReactNode, Ref } from 'react'

import { EntityAvatar } from '#components/entity-avatar'
import { FACET_COUNT_CLASS } from '#components/facet'
import type { FacetOption } from '#features/filters/options'
import { optionKey } from '#features/filters/options'

type KeyDownHandler = NonNullable<ComponentProps<typeof AutocompleteInput>['onKeyDown']>

/**
 * A type-ahead over models and providers: a Base UI Autocomplete whose list is ours to filter.
 * Arrow keys move through matches, Enter picks one, Escape closes the list and then clears the text.
 * Picking keeps focus in the field, so several values can be added in a row. It is an Autocomplete
 * rather than a Combobox because the text is free-form and a pick acts on the option and starts
 * over, instead of becoming the field's remembered value.
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
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const groupRef = useRef<HTMLDivElement>(null)

  const inline = variant === 'inline'
  const showList = open && query.trim() !== ''

  const list = (
    <>
      <AutocompleteEmpty>{noMatches}</AutocompleteEmpty>
      <AutocompleteList
        aria-label={label}
        className={cn(inline && 'max-h-40 overflow-y-auto pb-1')}
      >
        {(option: FacetOption) => (
          <AutocompleteItem
            key={optionKey(option)}
            onClick={() => {
              onSelect(option)
              setQuery('')
            }}
            title={option.id}
            value={option}
          >
            <EntityAvatar slug={option.id} />
            <span className="min-w-0 grow truncate">{option.name}</span>
            <span className={FACET_COUNT_CLASS}>{meta(option)}</span>
          </AutocompleteItem>
        )}
      </AutocompleteList>
    </>
  )

  const fieldProps = {
    'aria-label': label,
    autoComplete: 'off',
    placeholder,
    spellCheck: false,
  }

  const onKeyDown: KeyDownHandler = (event) => {
    if (event.key === 'Escape') {
      // The first Esc closes the list, the next clears the text.
      event.preventBaseUIHandler()

      if (showList) {
        setOpen(false)
      } else {
        setQuery('')
      }
    }
  }

  const onFocus = () => {
    setOpen(true)
  }

  return (
    <Autocomplete
      autoHighlight
      filter={null}
      inline={inline}
      itemToStringValue={(option) => option.name}
      items={search(query)}
      onOpenChange={setOpen}
      onValueChange={(next, details) => {
        // Picking acts on the option, so the text starts over rather than becoming the option's name.
        setQuery(details.reason === 'item-press' ? '' : next)

        if (details.reason === 'input-change') {
          // An inline list has no popup to report this, so typing reopens it after an Esc.
          setOpen(true)
        }
      }}
      open={inline || showList}
      value={query}
    >
      {inline ? (
        <div>
          <AutocompleteInput
            {...fieldProps}
            // The inline list is always "open" to Base UI, so the field reports it itself.
            aria-expanded={showList}
            className="h-6 w-full min-w-0 rounded-sm bg-transparent text-[13px] leading-4 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            onBlur={() => {
              setOpen(false)
            }}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            ref={inputRef}
          />
          {showList && list}
        </div>
      ) : (
        <div className="shrink-0 px-3 pb-2.5">
          <InputGroup className="h-8" ref={groupRef}>
            <InputGroupAddon className="py-0">
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <AutocompleteInput
              {...fieldProps}
              onFocus={onFocus}
              onKeyDown={onKeyDown}
              ref={inputRef}
              render={<InputGroupInput className="text-[13px] leading-4 md:text-[13px]" />}
            />
            {hint !== undefined && (
              <InputGroupAddon align="inline-end" className="py-0">
                {hint}
              </InputGroupAddon>
            )}
          </InputGroup>
          <AutocompleteContent anchor={groupRef} className="max-h-72">
            {list}
          </AutocompleteContent>
        </div>
      )}
    </Autocomplete>
  )
}
