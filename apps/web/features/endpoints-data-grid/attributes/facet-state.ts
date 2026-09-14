import { endpointModalityAttributes } from './attribute-groups'
import type { EndpointModalityAttribute } from './attribute-groups'
import type { AttributeKey } from './attributes'
import { isAttributeKey } from './attributes'

export type FilterMode = 'include' | 'exclude' | 'any'

export type FacetFilterState = Partial<Record<AttributeKey, FilterMode>>
type AttributeFilterState = Partial<Record<AttributeKey, FilterMode>>
type ModalityFilterState = Record<EndpointModalityAttribute, FilterMode>

const modalityNameSet = new Set<string>(endpointModalityAttributes)

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
    text_output: resolveFilterMode(has, not, 'text_output'),
    image_input: resolveFilterMode(has, not, 'image_input'),
    file_input: resolveFilterMode(has, not, 'file_input'),
    audio_input: resolveFilterMode(has, not, 'audio_input'),
    video_input: resolveFilterMode(has, not, 'video_input'),
    image_output: resolveFilterMode(has, not, 'image_output'),
    audio_output: resolveFilterMode(has, not, 'audio_output'),
  }
}

export function countActiveModalityFilters(has: string[], not: string[]) {
  return endpointModalityAttributes.filter((key) => resolveFilterMode(has, not, key) !== 'any')
    .length
}

export function countActiveAttributeFilters(has: string[], not: string[]) {
  return [...has, ...not].filter((key) => isAttributeKey(key) && !isModalityName(key)).length
}

export function retainModalityFilters(values: string[]) {
  return values.filter(isModalityName)
}

export function omitModalityFilters(values: string[]) {
  return values.filter((value) => !isModalityName(value))
}
