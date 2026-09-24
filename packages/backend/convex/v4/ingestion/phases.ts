import { ConvexError } from 'convex/values'

const OUTPUTS = [
  'records',
  'readings',
  'prices',
  'listings',
  'models',
  'providers',
  'endpoints',
] as const
export type Output = (typeof OUTPUTS)[number]

/** Each observation commits these outputs in order; the first pair also populates its baseline. */
export const INGESTION_PLAN = ['baseline', 'forward'].flatMap((stage) =>
  OUTPUTS.map((output) => `${stage}_${output}`),
)
export const BASELINE_PHASE = 'baseline_records'
export const FORWARD_PHASE = 'forward_records'
export const COMPLETE_PHASE = 'complete'

export function isBaselinePhase(phase: string): boolean {
  return phase.startsWith('baseline_')
}

/** Advance exactly one mutation boundary. */
export function nextPhase(phase: string): string {
  const index = INGESTION_PLAN.indexOf(phase)
  if (index === -1) {
    throw new ConvexError(`Unknown ingestion phase: ${phase}`)
  }
  return INGESTION_PLAN[index + 1] ?? COMPLETE_PHASE
}

/** Resolve a phase to its table-owning writer. */
export function phaseOutput(phase: string): Output {
  const output = OUTPUTS.find((name) => phase === `baseline_${name}` || phase === `forward_${name}`)
  if (output === undefined) {
    throw new ConvexError(`Unknown ingestion phase: ${phase}`)
  }
  return output
}
