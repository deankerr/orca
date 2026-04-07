import type { SortingState } from '@tanstack/react-table'
import { parseAsArrayOf, parseAsString, parseAsStringEnum, useQueryStates } from 'nuqs'
import posthogClient from 'posthog-js'

import { endpointModalityAttributes } from '@/lib/attribute-groups'
import type { EndpointModalityAttribute } from '@/lib/attribute-groups'
import type { AttributeKey } from '@/lib/attributes'
import { isAttributeKey } from '@/lib/attributes'

type FilterMode = 'include' | 'exclude' | 'any'

type ModalityName = EndpointModalityAttribute

type AttributeFilterState = Partial<Record<AttributeKey | ModalityName, FilterMode>>

type ModalityFilterState = Record<ModalityName, FilterMode>

// Parser for arrays of attribute/modality names
const parseAsAttributeArray = parseAsArrayOf(parseAsString).withDefault([])

const MODALITIES: ModalityName[] = [...endpointModalityAttributes]
const modalityNameSet = new Set<string>(MODALITIES)

function isModalityName(value: string): value is ModalityName {
  return modalityNameSet.has(value)
}

function resolveFilterMode(
  hasFilters: string[],
  notFilters: string[],
  key: ModalityName,
): FilterMode {
  if (hasFilters.includes(key)) {
    return 'include'
  }

  if (notFilters.includes(key)) {
    return 'exclude'
  }

  return 'any'
}

function getModalityFilters(hasFilters: string[], notFilters: string[]): ModalityFilterState {
  return {
    image_input: resolveFilterMode(hasFilters, notFilters, 'image_input'),
    file_input: resolveFilterMode(hasFilters, notFilters, 'file_input'),
    audio_input: resolveFilterMode(hasFilters, notFilters, 'audio_input'),
    video_input: resolveFilterMode(hasFilters, notFilters, 'video_input'),
    image_output: resolveFilterMode(hasFilters, notFilters, 'image_output'),
    audio_output: resolveFilterMode(hasFilters, notFilters, 'audio_output'),
    video_output: resolveFilterMode(hasFilters, notFilters, 'video_output'),
    embeddings_output: resolveFilterMode(hasFilters, notFilters, 'embeddings_output'),
    rerank_output: resolveFilterMode(hasFilters, notFilters, 'rerank_output'),
  }
}

export function useEndpointFilters() {
  const [filters, setFilters] = useQueryStates(
    {
      q: parseAsString.withDefault(''),
      uuid: parseAsString.withDefault(''),
      has: parseAsAttributeArray,
      not: parseAsAttributeArray,
      sort: parseAsString,
      order: parseAsStringEnum(['asc', 'desc']),
    },
    {
      history: 'push',
      shallow: true,
    },
  )

  // Extract modality filters from has/not lists
  const modalityFilters = getModalityFilters(filters.has, filters.not)

  // Build attribute filters from has/not lists
  const attributeFilters: AttributeFilterState = {}
  for (const attr of filters.has) {
    if (!isAttributeKey(attr)) {
      continue
    }
    attributeFilters[attr] = 'include'
  }
  for (const attr of filters.not) {
    if (!isAttributeKey(attr)) {
      continue
    }
    attributeFilters[attr] = 'exclude'
  }

  // Helper to update modality filters
  const setModalityFilter = (key: ModalityName, value: FilterMode) => {
    const currentHas = filters.has.filter((a) => a !== key)
    const currentNot = filters.not.filter((a) => a !== key)

    posthogClient.capture('filter_modality', { modality: key, mode: value })

    if (value === 'include') {
      void setFilters({
        has: [...currentHas, key],
        not: currentNot,
      })
    } else if (value === 'exclude') {
      void setFilters({
        has: currentHas,
        not: [...currentNot, key],
      })
    } else {
      // 'any' - remove from both lists
      void setFilters({
        has: currentHas,
        not: currentNot,
      })
    }
  }

  // Helper to update attribute filters
  const setAttributeFilter = (key: AttributeKey, value: FilterMode) => {
    const currentHas = filters.has.filter((a) => a !== key)
    const currentNot = filters.not.filter((a) => a !== key)

    posthogClient.capture('filter_attribute', { attribute: key, mode: value })

    if (value === 'include') {
      void setFilters({
        has: [...currentHas, key],
        not: currentNot,
      })
    } else if (value === 'exclude') {
      void setFilters({
        has: currentHas,
        not: [...currentNot, key],
      })
    } else {
      // 'any' - remove from both lists
      void setFilters({
        has: currentHas,
        not: currentNot,
      })
    }
  }

  // Helper to update search
  const setGlobalFilter = (value: string) => {
    void setFilters({ q: value })
  }

  // Convert URL state to TanStack SortingState
  const sorting: SortingState =
    filters.sort === null
      ? filters.q.length > 0
        ? []
        : [{ id: 'modelAddedAt', desc: true }]
      : [{ id: filters.sort, desc: filters.order === 'desc' }]

  // Helper to update sorting from TanStack's onSortingChange
  const onSortingChange = (
    updaterOrValue: SortingState | ((old: SortingState) => SortingState),
  ) => {
    const newSorting =
      typeof updaterOrValue === 'function' ? updaterOrValue(sorting) : updaterOrValue

    if (newSorting.length === 0) {
      posthogClient.capture('sort_cleared')
      void setFilters({ sort: null, order: null })
    } else {
      const [sort] = newSorting
      if (sort === undefined) {
        return
      }
      posthogClient.capture('sort_changed', {
        column: sort.id,
        direction: sort.desc ? 'desc' : 'asc',
      })
      void setFilters({
        sort: sort.id,
        order: sort.desc ? 'desc' : 'asc',
      })
    }
  }

  const clearAttributeFilters = () => {
    // Only keep modalities
    const currentModalities = filters.has.filter(isModalityName)

    void setFilters({
      has: currentModalities,
      not: [],
    })
  }

  const clearModalityFilters = () => {
    // Keep only non-modality attributes
    const currentAttributes = filters.has.filter((a) => !isModalityName(a))
    const currentNotAttributes = filters.not.filter((a) => !isModalityName(a))

    void setFilters({
      has: currentAttributes,
      not: currentNotAttributes,
    })
  }

  // Clear everything affecting the table except search
  const clearAllFilters = () => {
    void setFilters({
      uuid: '',
      has: [],
      not: [],
      sort: null,
      order: null,
    })
  }

  const setFocusSearch = (query: string) => {
    void setFilters({
      q: query,
      has: [],
      not: [],
      sort: null,
      order: null,
    })
  }

  // Derived counts
  const activeModalityCount = Object.values(modalityFilters).filter((mode) => mode !== 'any').length

  // Active attribute count = Total active filters - Modality filters
  const activeAttributeCount = filters.has.length + filters.not.length - activeModalityCount

  const hasActiveSorting = filters.sort !== null
  const hasActiveModalityFilters = activeModalityCount > 0
  const hasActiveAttributeFilters = activeAttributeCount > 0
  const hasAnyActiveFilters =
    hasActiveModalityFilters || hasActiveAttributeFilters || filters.q.length > 0

  return {
    globalFilter: filters.q,
    highlightUuid: filters.uuid,
    setGlobalFilter,
    sorting,
    onSortingChange,
    modalityFilters,
    attributeFilters,
    setModalityFilter,
    setAttributeFilter,
    clearAttributeFilters,
    clearModalityFilters,
    clearAllFilters,
    setFocusSearch,
    activeModalityCount,
    activeAttributeCount,
    hasActiveFilters: hasAnyActiveFilters,
    hasActiveAttributeFilters,
    hasActiveModalityFilters,
    hasActiveSorting,
  }
}

export type { FilterMode, AttributeFilterState, ModalityFilterState, ModalityName }
