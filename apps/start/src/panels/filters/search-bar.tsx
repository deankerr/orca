import { Kbd } from '@orca/ui/components/kbd'
import { formatForDisplay, useHotkey } from '@tanstack/react-hotkeys'
import { useRef } from 'react'

import { useScope, useScopeActions } from '#endpoints/hooks'

import { useSnapshotOptions } from './hooks'
import { OptionSearch } from './option-search'

/** The Filters panel's search: finds a model or provider and adds it as a filter value. */
export function SearchBar() {
  const inputRef = useRef<HTMLInputElement>(null)
  const { search } = useSnapshotOptions()
  const { update } = useScopeActions()
  const filters = useScope()

  useHotkey('Mod+K', () => {
    inputRef.current?.focus()
    inputRef.current?.select()
  })

  return (
    <OptionSearch
      hint={<Kbd>{formatForDisplay('Mod+K')}</Kbd>}
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
    />
  )
}
