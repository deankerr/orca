/** Hand-built test doubles for Convex contexts and registered function internals. */

/** Presents a partial fake as the full contract a test drives; the test owns its fidelity. */
// oxlint-disable-next-line no-unnecessary-type-parameters, anti-slop/no-unknown-parameters -- A double is any partial fake; each call names the contract it stands in for.
export function testDouble<T>(value: unknown): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Each double implements only what its test exercises.
  return value as T
}
