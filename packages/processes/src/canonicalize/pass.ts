// * Front of canonicalization: reads a mirrored Layer 0 pass (input/raw/<captured_at>/, put
// * there by `bun run mirror` in apps/capture) and reduces it to the deduped view the entity
// * canonicalizers consume. This used to live in the capture worker — it is interpretation,
// * so it belongs in a layer we can version and re-run over history.
// *
// * Upstream embeds the same entities in each other repeatedly with careless hygiene (copies
// * differ in insignificant ways); nothing downstream should ever see those duplicates.
// * - models: catalog reduced to variant slug -> "has at least one endpoint right now"
// * - providers: provider_info deduped globally across the observation set
// * - scopes: one entry per observation, model recovered once from its embedded copies,
// *   endpoints kept clustered with their scope, stripped of embedded copies

import { z } from 'zod'

// * loose shapes — typed only as far as the dedupe reaches. Everything else passes through
// * untouched; the strict parse of the raw entity shapes happens in the per-entity modules.
// * `body` is absent on error records; any body that isn't the endpoint envelope fails loudly
// * rather than being quietly skipped.
const Observation = z.looseObject({
  body: z
    .looseObject({
      data: z.array(
        z.looseObject({
          model: z.record(z.string(), z.unknown()),
          provider_info: z.looseObject({ slug: z.string() }),
        }),
      ),
    })
    .optional(),
})

const rawDir = new URL('../../input/raw/', import.meta.url).pathname

const readTextGz = async (path: string) =>
  new TextDecoder().decode(Bun.gunzipSync(await Bun.file(path).bytes()))

// * the catalog is read only to answer "does this slug have endpoints right now" — the model
// * records themselves are recovered from the observations, where they're parsed strictly
const Catalog = z.looseObject({
  data: z.array(
    z.looseObject({
      endpoint: z.looseObject({ model_variant_slug: z.string() }).nullable(),
      slug: z.string(),
    }),
  ),
})

// * capture.json is written last, so its presence is what makes a mirrored pass readable
export const mirroredPasses = () =>
  [...new Bun.Glob('*/capture.json').scanSync(rawDir)]
    .map((path) => path.split('/')[0] ?? '')
    .toSorted()

export const readPass = async (captured_at: string) => {
  const passDir = `${rawDir}${captured_at}/`

  // * keyed by the endpoint's variant slug when one exists (preserves e.g. "x/y:free" vs
  // * "x/y"); bare catalog slug otherwise
  const catalog = Catalog.parse(JSON.parse(await readTextGz(`${passDir}models.json.gz`)))
  const models: Record<string, boolean> = {}
  for (const m of catalog.data) {
    models[m.endpoint?.model_variant_slug ?? m.slug] = m.endpoint !== null
  }

  const providers = new Map<string, Record<string, unknown>>()
  const scopes: Array<Record<string, unknown>> = []
  for (const part of [
    ...new Bun.Glob('*.jsonl.gz').scanSync(`${passDir}observations/`),
  ].toSorted()) {
    const jsonl = await readTextGz(`${passDir}observations/${part}`)
    for (const line of jsonl.trim().split('\n')) {
      const { body, ...scope } = Observation.parse(JSON.parse(line))
      let model: Record<string, unknown> | null = null
      const endpoints = (body?.data ?? []).map((endpoint) => {
        const { model: embeddedModel, provider_info, ...rest } = endpoint
        model ??= embeddedModel
        providers.set(provider_info.slug, provider_info)
        return rest
      })
      scopes.push({ ...scope, endpoints, model })
    }
  }

  return { captured_at, models, providers: [...providers.values()], scopes }
}
