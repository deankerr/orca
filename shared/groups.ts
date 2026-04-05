// Groups flat EntityChange[] into message-level buckets.
//
// Used by both Discord messages and the monitor UI. The grouping logic
// determines which changes appear together as a visual unit.
//
// Bucketing rules:
// - Model lifecycle (available/unavailable) claims matching endpoint lifecycles
// - Unavailable groups show endpoints first, then the model
// - Everything else is standalone
// - Each group carries a slug for subscription/pattern matching
// - Provider groups use "*" as slug (only matched by wildcard subscriptions)

import type {
  EndpointChange,
  EntityChange,
  ModelChange,
  ProviderChange,
} from '@/convex/db/or/views/changes'

export type ChangeGroup = {
  slug: string
  changes: EntityChange[]
}

export function groupChanges(changes: EntityChange[]): ChangeGroup[] {
  const groups: ChangeGroup[] = []

  const models = changes.filter((c): c is ModelChange => c.entity_type === 'model')
  const endpoints = changes.filter((c): c is EndpointChange => c.entity_type === 'endpoint')
  const providers = changes.filter((c): c is ProviderChange => c.entity_type === 'provider')

  // index endpoints by model slug + event kind
  const epByModelAndKind = Map.groupBy(endpoints, (c) => `${c.model.slug}:${c.event.kind}`)
  const claimed = new Set<EndpointChange>()

  // model lifecycle claims matching endpoint lifecycle
  for (const model of models) {
    if (model.event.kind === 'entity_available') {
      const eps = epByModelAndKind.get(`${model.model.slug}:entity_available`) ?? []
      for (const ep of eps) {
        claimed.add(ep)
      }
      groups.push({ slug: model.model.slug, changes: [model, ...eps] })
      continue
    }

    if (model.event.kind === 'entity_unavailable') {
      const eps = epByModelAndKind.get(`${model.model.slug}:entity_unavailable`) ?? []
      for (const ep of eps) {
        claimed.add(ep)
      }
      // endpoint unavailables first, then model
      groups.push({ slug: model.model.slug, changes: [...eps, model] })
      continue
    }

    // model updates standalone
    groups.push({ slug: model.model.slug, changes: [model] })
  }

  // unclaimed endpoints
  for (const ep of endpoints) {
    if (claimed.has(ep)) {
      continue
    }
    groups.push({ slug: ep.model.slug, changes: [ep] })
  }

  // providers — slug "*" so they only match wildcard subscriptions
  for (const provider of providers) {
    groups.push({ slug: '*', changes: [provider] })
  }

  return groups
}
