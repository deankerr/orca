export type ArtifactKind = 'archive' | 'database' | 'snapshot'
export type RunStatus = 'failed' | 'running' | 'succeeded'

export interface ArtifactDescriptor {
  readonly format: string
  readonly formatVersion: number
  readonly kind: ArtifactKind
  readonly path: string
}

export interface ArtifactReference extends ArtifactDescriptor {
  readonly runId?: string
}

export interface RunReport {
  readonly artifact?: ArtifactDescriptor
  readonly completedAt?: string
  readonly durationMs?: number
  readonly failure?: string
  readonly format: 'orca-labs-run-report'
  readonly formatVersion: 1
  readonly inputs: readonly ArtifactReference[]
  readonly metrics: Readonly<Record<string, unknown>>
  readonly options: Readonly<Record<string, unknown>>
  readonly program: string
  readonly runId: string
  readonly startedAt: string
  readonly status: RunStatus
}

export interface ArtifactRun {
  readonly artifactPath: string
  readonly kind: ArtifactKind
  readonly logPath: string
  readonly reportPath: string
  readonly runDirectory: string
  readonly runId: string
  readonly startedAt: string
  readonly startedAtMillis: number
}

export interface ArtifactProgramResult<A> {
  readonly artifact: Omit<ArtifactDescriptor, 'kind' | 'path'>
  readonly inputs: readonly ArtifactReference[]
  readonly metrics: Readonly<Record<string, unknown>>
  readonly value: A
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isArtifactKind = (value: unknown): value is ArtifactKind =>
  value === 'archive' || value === 'database' || value === 'snapshot'

const isArtifactDescriptor = (value: unknown): value is ArtifactDescriptor =>
  isRecord(value) &&
  isArtifactKind(value.kind) &&
  typeof value.format === 'string' &&
  typeof value.formatVersion === 'number' &&
  typeof value.path === 'string'

const isArtifactReference = (value: unknown): value is ArtifactReference => {
  if (!isRecord(value) || !isArtifactDescriptor(value)) {
    return false
  }
  return value.runId === undefined || typeof value.runId === 'string'
}

const hasValidOptionalReportFields = (value: Readonly<Record<string, unknown>>) =>
  (value.artifact === undefined || isArtifactDescriptor(value.artifact)) &&
  (value.completedAt === undefined || typeof value.completedAt === 'string') &&
  (value.durationMs === undefined || typeof value.durationMs === 'number') &&
  (value.failure === undefined || typeof value.failure === 'string')

/** Narrow validator for the durable report files used as the local artifact index. */
export const isRunReport = (value: unknown): value is RunReport =>
  isRecord(value) &&
  value.format === 'orca-labs-run-report' &&
  value.formatVersion === 1 &&
  Array.isArray(value.inputs) &&
  value.inputs.every(isArtifactReference) &&
  isRecord(value.metrics) &&
  isRecord(value.options) &&
  typeof value.program === 'string' &&
  typeof value.runId === 'string' &&
  typeof value.startedAt === 'string' &&
  (value.status === 'failed' || value.status === 'running' || value.status === 'succeeded') &&
  hasValidOptionalReportFields(value)
