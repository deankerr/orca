/** Hand-built test doubles for Convex contexts and registered function internals. */

/** Presents a partial fake as the full contract a test drives; the test owns its fidelity. */
// oxlint-disable-next-line no-unnecessary-type-parameters -- Each call names the contract it fakes.
export function testDouble<T>(value: unknown): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Each double implements only what its test exercises.
  return value as T
}
