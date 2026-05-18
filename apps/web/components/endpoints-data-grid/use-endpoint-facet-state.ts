import { parseAsArrayOf, parseAsString, useQueryStates } from 'nuqs'

import { endpointModalityAttributes } from '@/lib/attribute-groups'
import type { EndpointModalityAttribute } from '@/lib/attribute-groups'
import type { AttributeKey } from '@/lib/attributes'
import { isAttributeKey } from '@/lib/attributes'

const endpointGridStateOptions = {
  history: 'push' as const,
  shallow: true,
}

const parseAsAttributeArray = parseAsArrayOf(parseAsString).withDefault([])

type FilterMode = 'include' | 'exclude' | 'any'

export type FacetFilterState = Partial<Record<AttributeKey, FilterMode>>
type AttributeFilterState = Partial<Record<AttributeKey, FilterMode>>
type ModalityFilterState = Record<EndpointModalityAttribute, FilterMode>

const MODALITIES = [...endpointModalityAttributes]
const modalityNameSet = new Set<string>(MODALITIES)

function isModalityName(value: string): value is EndpointModalityAttribute {
  return modalityNameSet.has(value)
}

function resolveFilterMode(hasFilters: string[], notFilters: string[], key: string): FilterMode {
  if (hasFilters.includes(key)) {
    return 'include'
  }

  if (notFilters.includes(key)) {
    return 'exclude'
  }

  return 'any'
}

export function applyFilterMode({
  has,
  not,
  key,
  mode,
}: {
  has: string[]
  not: string[]
  key: string
  mode: FilterMode
}) {
  const nextHas = has.filter((value) => value !== key)
  const nextNot = not.filter((value) => value !== key)

  if (mode === 'include') {
    return {
      has: [...nextHas, key],
      not: nextNot,
    }
  }

  if (mode === 'exclude') {
    return {
      has: nextHas,
      not: [...nextNot, key],
    }
  }

  return {
    has: nextHas,
    not: nextNot,
  }
}

export function toFacetFilters(has: string[], not: string[]): FacetFilterState {
  const filters: FacetFilterState = {}

  for (const key of has) {
    if (!isAttributeKey(key)) {
      continue
    }
    filters[key] = 'include'
  }

  for (const key of not) {
    if (!isAttributeKey(key)) {
      continue
    }
    filters[key] = 'exclude'
  }

  return filters
}

export function toAttributeFilters(has: string[], not: string[]): AttributeFilterState {
  const filters: AttributeFilterState = {}

  for (const key of has) {
    if (!isAttributeKey(key) || isModalityName(key)) {
      continue
    }
    filters[key] = 'include'
  }

  for (const key of not) {
    if (!isAttributeKey(key) || isModalityName(key)) {
      continue
    }
    filters[key] = 'exclude'
  }

  return filters
}

export function toModalityFilters(has: string[], not: string[]): ModalityFilterState {
  return {
    image_input: resolveFilterMode(has, not, 'image_input'),
    file_input: resolveFilterMode(has, not, 'file_input'),
    audio_input: resolveFilterMode(has, not, 'audio_input'),
    video_input: resolveFilterMode(has, not, 'video_input'),
    text_output: resolveFilterMode(has, not, 'text_output'),
    image_output: resolveFilterMode(has, not, 'image_output'),
    audio_output: resolveFilterMode(has, not, 'audio_output'),
    speech_output: resolveFilterMode(has, not, 'speech_output'),
    video_output: resolveFilterMode(has, not, 'video_output'),
    embeddings_output: resolveFilterMode(has, not, 'embeddings_output'),
    rerank_output: resolveFilterMode(has, not, 'rerank_output'),
    transcription_output: resolveFilterMode(has, not, 'transcription_output'),
  }
}

export function countActiveModalityFilters(has: string[], not: string[]) {
  return MODALITIES.filter((key) => resolveFilterMode(has, not, key) !== 'any').length
}

export function countActiveAttributeFilters(has: string[], not: string[]) {
  return [...has, ...not].filter((key) => isAttributeKey(key) && !isModalityName(key)).length
}

function retainModalityFilters(values: string[]) {
  return values.filter(isModalityName)
}

function omitModalityFilters(values: string[]) {
  return values.filter((value) => !isModalityName(value))
}

export function useEndpointFacetState() {
  const [params, setParams] = useQueryStates(
    {
      has: parseAsAttributeArray,
      not: parseAsAttributeArray,
    },
    endpointGridStateOptions,
  )

  const activeAttributeCount = countActiveAttributeFilters(params.has, params.not)
  const activeModalityCount = countActiveModalityFilters(params.has, params.not)

  const setAttributeFilter = (key: AttributeKey, value: FilterMode) => {
    void setParams(applyFilterMode({ has: params.has, not: params.not, key, mode: value }))
  }

  const setModalityFilter = (key: EndpointModalityAttribute, value: FilterMode) => {
    void setParams(applyFilterMode({ has: params.has, not: params.not, key, mode: value }))
  }

  const clearAttributeFilters = () => {
    void setParams({
      has: retainModalityFilters(params.has),
      not: retainModalityFilters(params.not),
    })
  }

  const clearModalityFilters = () => {
    void setParams({
      has: omitModalityFilters(params.has),
      not: omitModalityFilters(params.not),
    })
  }

  const clearFacets = () => {
    void setParams({
      has: [],
      not: [],
    })
  }

  return {
    facetFilters: toFacetFilters(params.has, params.not),
    attributeFilters: toAttributeFilters(params.has, params.not),
    modalityFilters: toModalityFilters(params.has, params.not),
    activeAttributeCount,
    activeModalityCount,
    hasActiveFacets: activeAttributeCount > 0 || activeModalityCount > 0,
    setAttributeFilter,
    setModalityFilter,
    clearAttributeFilters,
    clearModalityFilters,
    clearFacets,
  }
}

export type { FilterMode }
