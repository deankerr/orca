import { describe, expect, it } from 'vitest'

import type { JsonValue } from '../../json'
import { endpointFields } from './endpoints'
import { facts } from './projection'

const read = (name: keyof typeof endpointFields, metadata: JsonValue) =>
  facts({ [name]: endpointFields[name] }, { metadata })[0]?.value

describe('endpoint fields', () => {
  it('reads tool-choice modes under their upstream names', () => {
    const features = { supports_tool_choice: { literal_required: true, type_function: true } }

    expect(read('tool_choice.function', { features })).toBe(true)
    expect(read('tool_choice.required', { features })).toBe(true)
    expect(read('tool_choice.auto', { features })).toBeNull()
  })

  it('reads the service tier label from the derived tier', () => {
    expect(read('service_tier_label', { derived_service_tier: 'fast' })).toBe('fast')
  })

  it('treats placeholder and invalid deprecation dates as unknown', () => {
    const deprecation = (deprecation_date: string) => read('deprecation_date', { deprecation_date })

    expect(deprecation('2027-01-15')).toBe('2027-01-15T00:00:00.000Z')
    expect(deprecation('2098-01-01')).toBeNull()
    expect(deprecation('soon')).toBeNull()
  })
})
