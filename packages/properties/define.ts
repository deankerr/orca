import type { Endpoint } from '@orca/contract/endpoint'
import type { Model } from '@orca/contract/model'
import type { Provider } from '@orca/contract/provider'

/** Everything known about one endpoint when its properties resolve. */
export interface Scope {
  endpoint: Endpoint
  model: Model
  provider: Provider
  /** Reference time for recency, normally the scan the facts come from. */
  at: string
}

/**
 * The entity a property belongs to. Model and provider properties read only their entity and hold for
 * each of its endpoints. Endpoint properties can also read their model and provider, because upstream states
 * some endpoint facts at model level.
 */
interface Inputs {
  endpoint: [endpoint: Endpoint, scope: Scope]
  model: [model: Model, scope: Pick<Scope, 'at'>]
  provider: [provider: Provider]
}

export type Entity = keyof Inputs

/** Selects each entity's resolver input from a scope. */
type InputReaders = { [E in Entity]: (scope: Scope) => Inputs[E] }

const inputs: InputReaders = {
  endpoint: (scope) => [scope.endpoint, scope],
  model: (scope) => [scope.model, { at: scope.at }],
  provider: (scope) => [scope.provider],
}

/** Display tone: a property is named for its notable state, which can be good, bad, or neither. */
export type Polarity = 'negative' | 'neutral' | 'positive'

export type Group =
  | 'commercial'
  | 'data-policy'
  | 'facet'
  | 'limits'
  | 'modality'
  | 'model'
  | 'output'
  | 'parameter'
  | 'pricing'
  | 'protocol'
  | 'provider'
  | 'reasoning'
  | 'status'
  | 'tools'

export type Value = number | string | readonly string[]

/**
 * A property is active, optionally with a value, or inactive. There is no unknown: false, null, and
 * undefined are all inactive, so resolvers can return Contract nulls as they are.
 */
type Resolution<V extends Value> = V | boolean | null | undefined

interface Description {
  name: string
  group: Group
  polarity: Polarity
  /** Hover text. Backticks mark code. */
  description: string
}

export interface PropertyDefinition<V extends Value = Value> extends Description {
  entity: Entity
  /** A flag is only active or inactive; a value property usually carries a value while active. */
  kind: 'flag' | 'value'
  /** The value while active, `true` when active without one, else null. */
  resolve: (scope: Scope) => V | true | null
}

function define<E extends Entity, V extends Value>(
  entity: E,
  kind: PropertyDefinition['kind'],
  { resolve, ...description }: Description & { resolve: (...input: Inputs[E]) => Resolution<V> },
): PropertyDefinition<V> {
  return {
    ...description,
    entity,
    kind,
    resolve: (scope) => {
      const resolution = resolve(...inputs[entity](scope))

      return resolution === false || resolution === null || resolution === undefined
        ? null
        : resolution
    },
  }
}

/** A property that is only active or inactive. */
export const flag = <E extends Entity>(
  entity: E,
  definition: Description & { resolve: (...input: Inputs[E]) => boolean | null | undefined },
) => define<E, never>(entity, 'flag', definition)

/** A property that carries a raw value while active; display formats it. */
export const value = <E extends Entity, V extends Value>(
  entity: E,
  definition: Description & { resolve: (...input: Inputs[E]) => Resolution<V> },
) => define(entity, 'value', definition)

export function defineProperties<T extends Record<string, PropertyDefinition>>(definitions: T): T {
  return definitions
}
