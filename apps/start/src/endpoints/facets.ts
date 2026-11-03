import { properties } from '@orca/properties'
import type { Group, PropertyDefinition, PropertyId } from '@orca/properties'
import * as R from 'remeda'

import type { EndpointRow } from './snapshot'

/**
 * Value properties offered as presence facets: being active is itself a trait worth filtering on,
 * whatever the value. Other value properties, such as quantization or headquarters, need value facets.
 */
const PRESENCE_FACETS = new Set<PropertyId>([
  'deprecating',
  'discount',
  'image_token_limit',
  'input_limit',
  'limit_rpd',
  'limit_rpm',
  'native_web_search',
  'passthrough',
  'prompt_retention',
  'reasoning_effort',
  'sampling_defaults',
  'warning',
])

/** `unlisted` has its own toggle, because unlisted endpoints are hidden by default. */
const EXCLUDED = new Set<PropertyId>(['unlisted'])

const GROUP_LABELS: Record<Group, string> = {
  commercial: 'Commercial',
  'data-policy': 'Data Policy',
  facet: 'Facets',
  limits: 'Limits',
  modality: 'Modality',
  model: 'Model',
  output: 'Output',
  parameter: 'Parameters',
  pricing: 'Pricing',
  protocol: 'Protocol',
  provider: 'Provider',
  reasoning: 'Reasoning',
  status: 'Status',
  tools: 'Tools',
}

export interface PropertyFacet {
  id: PropertyId
  definition: PropertyDefinition
}

export interface PropertyFacetGroup {
  group: Group
  label: string
  facets: PropertyFacet[]
}

const offered = (id: PropertyId, definition: PropertyDefinition) =>
  !EXCLUDED.has(id) && (definition.kind === 'flag' || PRESENCE_FACETS.has(id))

/**
 * Property facets in catalogue order, grouped by property group in order of first appearance.
 * Properties never active on any row are skipped, and so are groups left empty.
 */
export function propertyFacetGroups(rows: readonly EndpointRow[]): PropertyFacetGroup[] {
  const seen = new Set(rows.flatMap((row) => [...row.properties.keys()]))

  const facets = R.entries(properties).flatMap(([id, definition]) =>
    offered(id, definition) && seen.has(id) ? [{ definition, id }] : [],
  )

  return Object.values(R.groupBy(facets, ({ definition }) => definition.group)).map((members) => ({
    facets: members,
    group: members[0].definition.group,
    label: GROUP_LABELS[members[0].definition.group],
  }))
}
