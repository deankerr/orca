import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from '@orca/ui/components/autocomplete'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@orca/ui/components/input-group'
import { Search } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ComponentProps, ReactNode, Ref } from 'react'

import { EntityAvatar } from '#components/entity-avatar'

import { FACET_COUNT_CLASS } from './facet'
import type { FacetOption } from './options'
import { optionKey } from './options'

type KeyDownHandler = NonNullable<ComponentProps<typeof AutocompleteInput>['onKeyDown']>

/**
 * The boxed search field at the top of the Filters panel: a Base UI Autocomplete over models and
 * providers whose list floats over the panel below it and is ours to filter. Arrow keys move
 * through matches, Enter picks one, Escape closes the list and then clears the text. Picking keeps
 * focus in the field, so several values can be added in a row. It is an Autocomplete rather than a
 * Combobox because the text is free-form and a pick acts on the option and starts over, instead of
 * becoming the field's remembered value.
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
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const groupRef = useRef<HTMLDivElement>(null)

  const showList = open && query.trim() !== ''

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

  return (
    <Autocomplete
      autoHighlight
      filter={null}
      itemToStringValue={(option) => option.name}
      items={search(query)}
      onOpenChange={setOpen}
      onValueChange={(next, details) => {
        // Picking acts on the option, so the text starts over rather than becoming the option's name.
        setQuery(details.reason === 'item-press' ? '' : next)
      }}
      open={showList}
      value={query}
    >
      <div className="shrink-0 px-3 pb-2.5">
        <InputGroup className="h-8" ref={groupRef}>
          <InputGroupAddon className="py-0">
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <AutocompleteInput
            aria-label={label}
            autoComplete="off"
            onFocus={() => {
              setOpen(true)
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            ref={inputRef}
            render={<InputGroupInput className="text-[13px] leading-4 md:text-[13px]" />}
            spellCheck={false}
          />
          {hint !== undefined && (
            <InputGroupAddon align="inline-end" className="py-0">
              {hint}
            </InputGroupAddon>
          )}
        </InputGroup>
        <AutocompleteContent anchor={groupRef} className="max-h-72">
          <AutocompleteEmpty>{noMatches}</AutocompleteEmpty>
          <AutocompleteList aria-label={label}>
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
        </AutocompleteContent>
      </div>
    </Autocomplete>
  )
}
