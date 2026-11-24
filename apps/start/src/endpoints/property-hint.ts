import { properties } from '@orca/properties'
import type { PropertyId } from '@orca/properties'

/** Hover text for a property shown as a bare value: its name, then what it means. */
export function propertyHint(id: PropertyId): string {
  return `${properties[id].name}: ${properties[id].description}`
}
