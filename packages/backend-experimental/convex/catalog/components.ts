import { createContentHash } from './hash'

export type ComponentState = {
  version: number
  contentHash: string
}

export type ProcessedComponent<TStateFields> = {
  action: 'stable' | 'append'
  stateFields: TStateFields
}

// Write-path helper: compare incoming Component Content with the Component State
// stored on the Entity State Row, append a Component Row when needed, and return
// the mergeable state fields for the next Entity State Row.
export async function processComponent<
  TContent extends Record<string, unknown>,
  TStateFields,
>(args: {
  state?: ComponentState
  content: TContent
  firstSeenAt: number
  toStateFields: (state: ComponentState) => TStateFields
  appendComponentRow: (
    row: TContent & {
      firstSeenAt: number
      version: number
      contentHash: string
    },
  ) => Promise<unknown>
}): Promise<ProcessedComponent<TStateFields>> {
  const contentHash = await createContentHash(args.content)

  if (args.state?.contentHash === contentHash) {
    return {
      action: 'stable',
      stateFields: args.toStateFields(args.state),
    }
  }

  const state = {
    version: (args.state?.version ?? 0) + 1,
    contentHash,
  }

  await args.appendComponentRow({
    ...args.content,
    firstSeenAt: args.firstSeenAt,
    version: state.version,
    contentHash: state.contentHash,
  })

  return {
    action: 'append',
    stateFields: args.toStateFields(state),
  }
}

// Read-path helper: keep Component Content at the top level while moving catalog
// bookkeeping into an explicit container for debugging and historical views.
export function withCatalogMetadata<
  T extends {
    _id: unknown
    _creationTime: number
    firstSeenAt: number
    version: number
    contentHash: string
  },
>(component: T) {
  const { _id, _creationTime, firstSeenAt, version, contentHash, ...content } = component

  return {
    ...content,
    _catalog: {
      _id,
      _creationTime,
      firstSeenAt,
      version,
      contentHash,
    },
  }
}
