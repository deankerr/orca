import * as Effect from 'effect/Effect'

import type { EncodedBundle } from './storage.ts'

export type CompressionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/** Narrows user input to the Zstandard levels supported by Bun's native codec. */
export const isCompressionLevel = (value: number): value is CompressionLevel =>
  Number.isInteger(value) && value >= 0 && value <= 9

const sha256 = (bytes: Uint8Array) => {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(bytes)
  return hasher.digest('hex')
}

/**
 * Losslessly replaces one source gzip envelope with an independently compressed zstd payload.
 * Optional expected sizes make upstream metadata part of the import integrity boundary.
 */
export const encodeGzipBundle = Effect.fn('labs.encodeGzipBundle')(
  function* encodeGzipBundle(options: {
    readonly compressionLevel: number
    readonly crawlId: string
    readonly expectedRawBytes?: number
    readonly expectedSourceBytes?: number
    readonly source: Uint8Array<ArrayBuffer>
    readonly sourceKind: EncodedBundle['sourceKind']
    readonly sourceMetadataJson: string
    readonly sourceRef: string
  }) {
    return yield* Effect.tryPromise({
      catch: (cause) => new Error(`could not encode source bundle ${options.crawlId}`, { cause }),
      try: async () => {
        if (
          options.expectedSourceBytes !== undefined &&
          options.source.byteLength !== options.expectedSourceBytes
        ) {
          throw new Error(
            `source size is ${options.source.byteLength}, expected ${options.expectedSourceBytes}`,
          )
        }
        const raw = Bun.gunzipSync(options.source)
        if (options.expectedRawBytes !== undefined && raw.byteLength !== options.expectedRawBytes) {
          throw new Error(`raw size is ${raw.byteLength}, expected ${options.expectedRawBytes}`)
        }
        const payload = await Bun.zstdCompress(raw, { level: options.compressionLevel })
        return {
          compressedBytes: payload.byteLength,
          compressionLevel: options.compressionLevel,
          crawlId: options.crawlId,
          payload,
          rawBytes: raw.byteLength,
          rawSha256: sha256(raw),
          sourceCompressedBytes: options.source.byteLength,
          sourceKind: options.sourceKind,
          sourceMetadataJson: options.sourceMetadataJson,
          sourceRef: options.sourceRef,
          sourceSha256: sha256(options.source),
        } satisfies EncodedBundle
      },
    })
  },
)
