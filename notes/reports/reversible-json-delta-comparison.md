# Reversible JSON delta comparison on normalized ORCA bundles

## Outcome

Normalizing ORCA's model and endpoint collections to object maps materially improves the choice of
available JSON delta libraries. On the complete valid dense corpus, `jsondiffpatch@0.7.6` is the
clear demonstration winner: one normalized checkpoint plus 280 reversible deltas occupies
42,572,766 bytes, or 20.56% of independently gzipped normalized snapshots.

The comparison covers 281 valid snapshots from `2026-08-16T00:30:09.313Z` through
`2026-08-27T17:30:09.457Z`. The dev deployment exposed 283 crawls in that interval. Two were rejected
by the existing server formatter with HTTP 422 and are not valid `model-endpoints-v1` inputs:

- `2026-08-24T18:30:09.261Z` (`1787596209261`);
- `2026-08-25T21:30:09.264Z` (`1787693409264`).

The transitions spanning those gaps were generated against the next valid observation and replayed
successfully. An additional off-cadence crawl at `2026-08-20T21:15:45.530Z` is included. A local
plain/gzip duplicate of the August 24 14:30 crawl is deduplicated by crawl timestamp, preferring the
gzip file.

## Representation boundary

After ordinary `ModelEndpointsV1` parsing, the shared normalizer converts only:

- root `data: Model[]` to `data: Record<model_id, Model>`;
- each non-null `endpoints: Endpoint[]` to `endpoints: Record<id, Endpoint>`.

The identity fields remain inside their records. A `null` endpoint collection stays `null`, and all
other arrays retain their original order and index semantics. Duplicate identities fail generation.
The policy is versioned as `orca-model-endpoint-object-maps-v1`.

This boundary removes model and endpoint reorder behavior from every library rather than relying on
one package's keyed-array feature. Reconstruction is semantic rather than byte-identical: consumers
that require arrays can denormalize maps in a deterministic order.

## Storage results

The common checkpoint is 725,487 bytes. Independently gzip-9-compressed normalized snapshots total
207,101,468 bytes. Each archive total below is that checkpoint plus its independently gzipped
transitions.

| Codec                            | Transition bytes | Archive bytes | Snapshot baseline | Savings |
| -------------------------------- | ---------------: | ------------: | ----------------: | ------: |
| `jsondiffpatch@0.7.6`            |       41,847,279 |    42,572,766 |            20.56% |  79.44% |
| `json-diff-ts@5.0.0-alpha.9`     |       66,716,395 |    67,441,882 |            32.56% |  67.44% |
| paired RFC 6902                  |       91,806,372 |    92,531,859 |            44.68% |  55.32% |
| paired `@opentf/obj-diff@0.18.0` |       97,331,126 |    98,056,613 |            47.35% |  52.65% |

`jsondiffpatch` has a median compressed transition of 150,800 bytes, versus 239,989 for
`json-diff-ts`, 330,814 for paired RFC 6902, and 351,708 for paired `obj-diff`. Its advantage is even
larger before gzip: 229 MB of transition JSON versus 1.01 GB for JSON Atom and roughly 1.7–1.8 GB for
the paired formats.

The nested `jsondiffpatch` representation carries old and new values once without repeating a full
path for every leaf. JSON Atom repeats flat path strings. The other two libraries require independent
forward and reverse payloads, nearly doubling both operation count and path/value representation.
Gzip reduces that repetition but does not erase it.

The local source gzip files for the same 281 snapshots total 211,769,032 bytes. That is close to the
207.1 MB normalized gzip-9 baseline, but is not a controlled measure of normalization alone: the
server files and the comparison baseline use different compressors/settings.

## Generation behavior

Generation timings below cover only each library's diff creation, accumulated across 280 adjacent
pairs. They exclude parsing, normalization, serialization, gzip, file writes, and forward/reverse
verification.

| Codec             | Diff generation | Approx. per transition |
| ----------------- | --------------: | ---------------------: |
| `jsondiffpatch`   |         10.38 s |                  37 ms |
| paired `obj-diff` |         16.55 s |                  59 ms |
| `json-diff-ts`    |         38.93 s |                 139 ms |
| paired RFC 6902   |        254.95 s |                 911 ms |

These are workstation demonstration timings, not serverless memory or latency predictions. They are
still useful for comparing the same process and inputs. RFC generation was much slower, and its
persisted full-chain replay was also visibly the slowest because `immutable-json-patch` performs
structural immutable application for two large patches per transition.

The generator retains the previous and current normalized bundles and one codec payload at a time.
It writes every transition immediately and retains only compact measurements across the corpus. It
does not accumulate bundles, payloads, or formatted archive data.

## Integrity result

Every transition was verified forward and backward during generation. A separate persisted replay
then read all 1,120 gzip transition files back from disk one at a time. For each codec it:

1. started from the stored normalized checkpoint;
2. applied all 280 parsed payloads and checked every recorded target hash;
3. read the same transitions in reverse order;
4. applied their reverse representation and checked every predecessor hash;
5. returned to the initial checkpoint hash.

All four codecs passed. The initial semantic hash is
`767131e1a5c2519f272eae5ddebe1a95518388cfb19b7bbde306d9bdbe9ab14b`; the final hash is
`6b385fe03f6aae2b13874b2fbae5d7c2ad2215056f92445d0cad1dd934487bc9`.

## Assessment by codec

### `jsondiffpatch`

This is now the strongest candidate for a further archival prototype. It produced the smallest
archive by a large margin, was fastest to generate, and passed complete persisted patch/unpatch
replay. Object-map normalization avoids its sequence-oriented model/endpoint array behavior.

The remaining cost is format ownership. Its compact nested delta is library-specific, including
special array encodings. ORCA should pin the version, retain its own normalization and envelope
versions, keep periodic checkpoints, and preserve replay fixtures if adopting it.

### `json-diff-ts`

JSON Atom remains viable and is still more convenient for direct touched-path inspection. With
object maps, its keyed-array feature is no longer needed for the two largest collections, but the
flat paths make the archive 58% larger than `jsondiffpatch` after gzip. The existing ORCA apply
adapter remains necessary for Alpha 9 path/application defects.

The object-map result is 32.56% of normalized snapshots.

### Paired RFC 6902

This has the strongest standardized operation format, and both directions replay correctly. It is
not competitive in this demonstration: the archive is more than twice `jsondiffpatch`'s size, diff
generation is roughly 25 times slower, and persisted immutable replay is slow. Portability would
need to be valuable enough to justify storing and applying two large patches.

### Paired `obj-diff`

Diff generation is fast and its format is simple, but storing a separately generated reverse diff
makes it the largest candidate after compression. It offers neither RFC portability nor the
single-payload compactness of `jsondiffpatch`, so it is useful as a control rather than the next
prototype choice.

## Recommendation

Use the object-map normalizer as the shared demonstration boundary and take `jsondiffpatch` forward
first. The next focused experiment should add a practical checkpoint cadence and measure replay from
the nearest checkpoint, rather than expanding the codec list again. Keep JSON Atom as the comparison
when direct path-oriented projections matter; the storage premium is now quantified.

No production serverless memory conclusion should be inferred from this local run. If the archive
prototype moves into Convex, measure the actual two parsed values plus normalization, diff, and replay
overlap there, then reduce only the allocations that breach the real limit.

## Artifacts

- `data/reversible-codec-comparison/analysis.json`: compact measurements and persisted replay result;
- `data/reversible-codec-comparison/checkpoint.normalized.json.gz`: shared normalized checkpoint;
- `data/reversible-codec-comparison/<codec>/transitions/`: independently gzipped transition envelopes;
- `packages/scripts/reversible-changesets/normalization.ts`: shared post-parse normalizer;
- `packages/scripts/reversible-changesets/compare.ts`: pairwise generator and persisted verifier;
- `packages/scripts/sync-bundles/`: resumable dev-deployment bundle sync.
