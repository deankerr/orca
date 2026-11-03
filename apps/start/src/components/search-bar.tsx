import { formatForDisplay, useHotkey } from '@tanstack/react-hotkeys'
import { useRef } from 'react'

import { OptionSearch } from '#components/option-search'
import { useEndpointSearch, useEndpointSearchActions } from '#features/endpoints/hooks'
import { useCatalogOptions } from '#features/filters/hooks'

/** The Filters panel's search: finds a model or provider and adds it as a filter value. */
export function SearchBar() {
  const inputRef = useRef<HTMLInputElement>(null)
  const { search } = useCatalogOptions()
  const { update } = useEndpointSearchActions()
  const filters = useEndpointSearch()

  useHotkey('Mod+K', () => {
    inputRef.current?.focus()
    inputRef.current?.select()
  })

  return (
    <OptionSearch
      hint={
        <kbd className="rounded-sm border border-border px-1 py-px font-mono text-[10px] leading-3 text-muted-foreground">
          {formatForDisplay('Mod+K')}
        </kbd>
      }
      inputRef={inputRef}
      label="Search models, providers"
      meta={({ id, kind }) => (filters[kind].includes(id) ? 'added' : kind)}
      noMatches="No models or providers match."
      onSelect={({ id, kind }) => {
        if (!filters[kind].includes(id)) {
          update((current) => ({ [kind]: [...current[kind], id] }))
        }
      }}
      placeholder="Search models, providers"
      search={(query) => search.any(query, 8)}
      variant="bar"
    />
  )
}
