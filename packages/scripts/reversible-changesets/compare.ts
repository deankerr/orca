// oxlint-disable sort-keys -- Persisted envelopes follow the replay lifecycle.
// oxlint-disable typescript/no-unsafe-type-assertion -- The heterogeneous codec registry erases third-party payload types at its validated boundary.

import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'

import { diff as objectDiff, patch as objectPatch } from '@opentf/obj-diff'
import type { DiffResult } from '@opentf/obj-diff'
import { Glob } from 'bun'
import { immutableJSONPatch, revertJSONPatch } from 'immutable-json-patch'
import { diffAtom } from 'json-diff-ts'
import type { IJsonAtom } from 'json-diff-ts'
import { create as createJsonDiffPatch } from 'jsondiffpatch'
import type { Delta } from 'jsondiffpatch'
import { createPatch } from 'rfc6902'
import type { Operation } from 'rfc6902'

import { loadBundle } from '../model-endpoints-v1.ts'
import { applyReversibleAtom, revertReversibleAtom, semanticHash } from './canonical.ts'
import { NORMALIZATION_POLICY_VERSION, normalizeBundleToObjectMaps } from './normalization.ts'
import type { NormalizedModelEndpointsV1 } from './normalization.ts'

const encoder = new TextEncoder()
const jsonDiffPatcher = createJsonDiffPatch({ cloneDiffValues: true })

type CodecName = 'json-diff-ts' | 'jsondiffpatch' | 'rfc6902-paired' | 'obj-diff-paired'

interface Codec<Payload> {
  applyForward: (before: NormalizedModelEndpointsV1, payload: Payload) => unknown
  applyReverse: (after: NormalizedModelEndpointsV1, payload: Payload) => unknown
  create: (before: NormalizedModelEndpointsV1, after: NormalizedModelEndpointsV1) => Payload
  name: CodecName
  operationCount: (payload: Payload) => number
  version: string
}

interface TransitionMeasurement {
  compressed_bytes: number
  from: string
  operations: number
  to: string
  uncompressed_bytes: number
}

interface CodecSummary {
  compressed_bytes: number
  generation_ms: number
  name: CodecName
  operations: number
  transitions: TransitionMeasurement[]
  uncompressed_bytes: number
  version: string
}

export interface ComparisonSummary {
  checkpoint_compressed_bytes: number
  codecs: CodecSummary[]
  corpus: {
    first_crawl_at: string
    last_crawl_at: string
    normalized_snapshot_gzip_bytes: number
    snapshots: number
    transitions: number
  }
  format: 'orca-reversible-codec-comparison-v1'
  normalization_policy: typeof NORMALIZATION_POLICY_VERSION
}

export interface PersistedReplayResult {
  codecs: Record<CodecName, { forward: true; reverse: true; transitions: number }>
  final_hash: string
  initial_hash: string
}

const codecs: Codec<unknown>[] = [
  {
    name: 'json-diff-ts',
    version: '5.0.0-alpha.9',
    create: (before, after) => diffAtom(before, after),
    applyForward: (before, atom) => applyReversibleAtom(before, requireAtom(atom)),
    applyReverse: (after, atom) => revertReversibleAtom(after, requireAtom(atom)),
    operationCount: (atom) => requireAtom(atom).operations.length,
  },
  {
    name: 'jsondiffpatch',
    version: '0.7.6',
    create: (before, after) => jsonDiffPatcher.diff(before, after),
    applyForward: (before, delta) => jsonDiffPatcher.patch(structuredClone(before), delta as Delta),
    applyReverse: (after, delta) => jsonDiffPatcher.unpatch(structuredClone(after), delta as Delta),
    operationCount: countJsonDiffPatchLeaves,
  },
  {
    name: 'rfc6902-paired',
    version: 'rfc6902@5.3.0+immutable-json-patch@6.0.3',
    create: (before, after) => {
      const forward = createPatch(before, after)
      return { forward, reverse: revertJSONPatch(before, forward) }
    },
    applyForward: (before, payload) =>
      immutableJSONPatch(before, (payload as PairedRfc6902).forward),
    applyReverse: (after, payload) => immutableJSONPatch(after, (payload as PairedRfc6902).reverse),
    operationCount: (payload) => {
      const paired = payload as PairedRfc6902
      return paired.forward.length + paired.reverse.length
    },
  },
  {
    name: 'obj-diff-paired',
    version: '0.18.0',
    create: (before, after) => ({
      forward: objectDiff(before, after),
      reverse: objectDiff(after, before),
    }),
    applyForward: (before, payload) => objectPatch(before, (payload as PairedObjectDiff).forward),
    applyReverse: (after, payload) => objectPatch(after, (payload as PairedObjectDiff).reverse),
    operationCount: (payload) => {
      const paired = payload as PairedObjectDiff
      return paired.forward.length + paired.reverse.length
    },
  },
]

type PairedRfc6902 = { forward: Operation[]; reverse: Operation[] }
type PairedObjectDiff = { forward: DiffResult[]; reverse: DiffResult[] }

export async function compareReversibleCodecs(
  bundlePaths: readonly string[],
  outputDirectory: string,
): Promise<ComparisonSummary> {
  if (bundlePaths.length < 2) {
    throw new Error('The comparison requires at least two bundle snapshots.')
  }
  const [firstPath] = bundlePaths
  if (firstPath === undefined) {
    throw new Error('The comparison is missing its first bundle.')
  }

  const output = path.resolve(outputDirectory)
  await mkdir(output, { recursive: true })
  for (const codec of codecs) {
    await mkdir(path.join(output, codec.name, 'transitions'), { recursive: true })
  }

  let previous = normalizeBundleToObjectMaps(await loadBundle(firstPath), firstPath)
  const checkpointBytes = encoder.encode(JSON.stringify(previous))
  const checkpointGzip = Bun.gzipSync(checkpointBytes, { level: 9 })
  await Bun.write(path.join(output, 'checkpoint.normalized.json.gz'), checkpointGzip)
  let normalizedSnapshotGzipBytes = checkpointGzip.byteLength
  const summaries = codecs.map<CodecSummary>((codec) => ({
    compressed_bytes: 0,
    generation_ms: 0,
    name: codec.name,
    operations: 0,
    transitions: [],
    uncompressed_bytes: 0,
    version: codec.version,
  }))

  for (const [transitionIndex, currentPath] of bundlePaths.slice(1).entries()) {
    const current = normalizeBundleToObjectMaps(await loadBundle(currentPath), currentPath)
    normalizedSnapshotGzipBytes += Bun.gzipSync(encoder.encode(JSON.stringify(current)), {
      level: 9,
    }).byteLength

    for (const [codecIndex, codec] of codecs.entries()) {
      const summary = summaries[codecIndex]
      if (summary === undefined) {
        throw new Error(`Missing summary for ${codec.name}.`)
      }
      const startedAt = performance.now()
      const payload = codec.create(previous, current)
      summary.generation_ms += performance.now() - startedAt
      const persistedPayload = jsonRoundTrip(payload)
      verifyReplay(codec, previous, current, persistedPayload)

      const envelope = {
        format: 'orca-reversible-codec-transition-v1',
        codec: { name: codec.name, version: codec.version },
        normalization_policy: NORMALIZATION_POLICY_VERSION,
        from: { crawl_at: previous.crawl_at, crawl_id: previous.crawl_id },
        to: { crawl_at: current.crawl_at, crawl_id: current.crawl_id },
        state_hashes: { before: semanticHash(previous), after: semanticHash(current) },
        payload: persistedPayload,
      }
      const json = encoder.encode(JSON.stringify(envelope))
      const gzip = Bun.gzipSync(json, { level: 9 })
      const filename = `${previous.crawl_id}--${current.crawl_id}.json.gz`
      await writeAtomic(path.join(output, codec.name, 'transitions', filename), gzip)
      const measurement = {
        compressed_bytes: gzip.byteLength,
        from: previous.crawl_id,
        operations: codec.operationCount(persistedPayload),
        to: current.crawl_id,
        uncompressed_bytes: json.byteLength,
      }
      summary.compressed_bytes += measurement.compressed_bytes
      summary.operations += measurement.operations
      summary.transitions.push(measurement)
      summary.uncompressed_bytes += measurement.uncompressed_bytes
    }

    console.error(
      `[${transitionIndex + 1}/${bundlePaths.length - 1}] verified ${previous.crawl_at} -> ${current.crawl_at}`,
    )
    previous = current
  }

  const result: ComparisonSummary = {
    checkpoint_compressed_bytes: checkpointGzip.byteLength,
    codecs: summaries,
    corpus: {
      first_crawl_at: normalizeDateFromPath(firstPath),
      last_crawl_at: previous.crawl_at,
      normalized_snapshot_gzip_bytes: normalizedSnapshotGzipBytes,
      snapshots: bundlePaths.length,
      transitions: bundlePaths.length - 1,
    },
    format: 'orca-reversible-codec-comparison-v1',
    normalization_policy: NORMALIZATION_POLICY_VERSION,
  }
  await Bun.write(path.join(output, 'analysis.json'), `${JSON.stringify(result, null, 2)}\n`)
  return result
}

export async function verifyPersistedComparison(
  outputDirectory: string,
): Promise<PersistedReplayResult> {
  const output = path.resolve(outputDirectory)
  const checkpointPath = path.join(output, 'checkpoint.normalized.json.gz')
  const checkpoint = requireNormalizedBundle(await readGzipJson(checkpointPath))
  const initialHash = semanticHash(checkpoint)
  const results = {} as PersistedReplayResult['codecs']
  let finalHash = initialHash

  for (const codec of codecs) {
    const transitionDirectory = path.join(output, codec.name, 'transitions')
    const transitionPaths: string[] = []
    for await (const filename of new Glob('*.json.gz').scan({
      cwd: transitionDirectory,
      onlyFiles: true,
    })) {
      transitionPaths.push(path.join(transitionDirectory, filename))
    }
    transitionPaths.sort((left, right) => path.basename(left).localeCompare(path.basename(right)))

    let state = checkpoint
    for (const transitionPath of transitionPaths) {
      const envelope = requirePersistedEnvelope(await readGzipJson(transitionPath), codec.name)
      if (semanticHash(state) !== envelope.state_hashes.before) {
        throw new Error(`${codec.name} persisted forward chain broke at ${transitionPath}.`)
      }
      state = requireNormalizedBundle(codec.applyForward(state, envelope.payload))
      if (semanticHash(state) !== envelope.state_hashes.after) {
        throw new Error(`${codec.name} persisted forward replay failed at ${transitionPath}.`)
      }
    }
    finalHash = semanticHash(state)

    for (const transitionPath of transitionPaths.toReversed()) {
      const envelope = requirePersistedEnvelope(await readGzipJson(transitionPath), codec.name)
      if (semanticHash(state) !== envelope.state_hashes.after) {
        throw new Error(`${codec.name} persisted reverse chain broke at ${transitionPath}.`)
      }
      state = requireNormalizedBundle(codec.applyReverse(state, envelope.payload))
      if (semanticHash(state) !== envelope.state_hashes.before) {
        throw new Error(`${codec.name} persisted reverse replay failed at ${transitionPath}.`)
      }
    }
    if (semanticHash(state) !== initialHash) {
      throw new Error(`${codec.name} did not return to the persisted checkpoint.`)
    }
    results[codec.name] = {
      forward: true,
      reverse: true,
      transitions: transitionPaths.length,
    }
    console.error(`Verified persisted ${codec.name} chain in both directions.`)
  }

  return { codecs: results, final_hash: finalHash, initial_hash: initialHash }
}

function verifyReplay<Payload>(
  codec: Codec<Payload>,
  before: NormalizedModelEndpointsV1,
  after: NormalizedModelEndpointsV1,
  payload: Payload,
): void {
  const beforeHash = semanticHash(before)
  const afterHash = semanticHash(after)
  if (semanticHash(codec.applyForward(before, payload)) !== afterHash) {
    throw new Error(`${codec.name} forward replay failed for ${before.crawl_at}.`)
  }
  if (semanticHash(codec.applyReverse(after, payload)) !== beforeHash) {
    throw new Error(`${codec.name} reverse replay failed for ${after.crawl_at}.`)
  }
}

function countJsonDiffPatchLeaves(value: unknown): number {
  if (Array.isArray(value)) {
    return 1
  }
  if (value === null || typeof value !== 'object') {
    return 0
  }
  let total = 0
  for (const key of Reflect.ownKeys(value)) {
    total += countJsonDiffPatchLeaves(Reflect.get(value, key))
  }
  return total
}

function requireAtom(value: unknown): IJsonAtom {
  if (
    value === null ||
    typeof value !== 'object' ||
    Reflect.get(value, 'format') !== 'json-atom' ||
    Reflect.get(value, 'version') !== 1 ||
    !Array.isArray(Reflect.get(value, 'operations'))
  ) {
    throw new Error('json-diff-ts returned an invalid Atom.')
  }
  return value as IJsonAtom
}

function jsonRoundTrip(value: unknown): unknown {
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- This deliberately verifies the persisted JSON representation, not only cloneability.
  return JSON.parse(JSON.stringify(value)) as unknown
}

async function readGzipJson(inputPath: string): Promise<unknown> {
  const bytes = Bun.gunzipSync(await Bun.file(inputPath).bytes())
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

function requireNormalizedBundle(value: unknown): NormalizedModelEndpointsV1 {
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof Reflect.get(value, 'crawl_at') !== 'string' ||
    typeof Reflect.get(value, 'crawl_id') !== 'string' ||
    !isRecord(Reflect.get(value, 'data'))
  ) {
    throw new Error('Persisted normalized bundle has an invalid envelope.')
  }
  return value as NormalizedModelEndpointsV1
}

function requirePersistedEnvelope(
  value: unknown,
  codec: CodecName,
): { payload: unknown; state_hashes: { after: string; before: string } } {
  if (value === null || typeof value !== 'object') {
    throw new Error(`Invalid persisted ${codec} transition envelope.`)
  }
  const codecValue: unknown = Reflect.get(value, 'codec')
  const hashes: unknown = Reflect.get(value, 'state_hashes')
  if (
    !isRecord(codecValue) ||
    codecValue.name !== codec ||
    !isRecord(hashes) ||
    typeof hashes.before !== 'string' ||
    typeof hashes.after !== 'string' ||
    !Reflect.has(value, 'payload')
  ) {
    throw new Error(`Invalid persisted ${codec} transition envelope.`)
  }
  return {
    payload: Reflect.get(value, 'payload'),
    state_hashes: { after: hashes.after, before: hashes.before },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function writeAtomic(outputPath: string, bytes: Uint8Array): Promise<void> {
  const temporaryPath = `${outputPath}.${process.pid}.${Bun.randomUUIDv7()}.tmp`
  try {
    await Bun.write(temporaryPath, bytes)
    await rename(temporaryPath, outputPath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

function normalizeDateFromPath(bundlePath: string): string {
  return path.basename(bundlePath).split('.me1.orca.json')[0] ?? path.basename(bundlePath)
}
