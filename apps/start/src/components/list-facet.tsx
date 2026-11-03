import { Checkbox } from '@orca/ui/components/checkbox'
import { cn } from 'cn'
import { useMemo } from 'react'

import { EntityAvatar } from '#components/entity-avatar'
import { FACET_COUNT_CLASS, Facet } from '#components/facet'
import { OptionSearch } from '#components/option-search'
import { useEndpointSearchActions, useFacetCounts } from '#features/endpoints/hooks'
import { toggleValue } from '#features/endpoints/search'
import { useCatalogOptions } from '#features/filters/hooks'
import { optionKey, visibleOptions } from '#features/filters/options'
import type { OptionKind } from '#features/filters/options'

/** Values listed before the type-ahead: selected ones, then the highest counts. */
const TOP_VALUES = 3

const COPY = {
  model: { find: 'Find a model…', plural: 'models', title: 'Model' },
  provider: { find: 'Find a provider…', plural: 'providers', title: 'Provider' },
} as const

/**
 * The Model or Provider facet. Checked values combine with OR. The count beside each value is the
 * endpoints with that value that match every other facet, ignoring this facet's own selection, so a
 * zero count is dim: choosing it would add nothing.
 */
export function ListFacet({
  inScope,
  kind,
  selected,
}: {
  kind: OptionKind
  /** Distinct values of this kind in the endpoints in scope. */
  inScope: number
  selected: readonly string[]
}) {
  const { options, search } = useCatalogOptions()
  const counts = useFacetCounts()[kind]
  const { update } = useEndpointSearchActions()
  const copy = COPY[kind]

  // Ranking every option is the facet's costly step, so it waits for the counts or selection to change.
  const shown = useMemo(
    () => visibleOptions(kind, options[kind], counts, selected, TOP_VALUES),
    [counts, kind, options, selected],
  )

  const shownKeys = new Set(shown.map(optionKey))

  const toggle = (id: string) => {
    update((current) => ({ [kind]: toggleValue(current[kind], id) }))
  }

  return (
    <Facet
      meta={
        <span aria-label={`In scope: ${inScope}`} className="tabular-nums">
          {inScope}
        </span>
      }
      title={copy.title}
    >
      {shown.map((option) => {
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
      })}
      <OptionSearch
        label={copy.find.replace('…', '')}
        meta={(option) => counts.get(option.id) ?? 0}
        noMatches={`No other ${copy.plural} match.`}
        onSelect={({ id }) => {
          toggle(id)
        }}
        placeholder={copy.find}
        search={(query) => search[kind](query, 8, shownKeys)}
        variant="inline"
      />
    </Facet>
  )
}
