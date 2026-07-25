// * Analysis helper: split a deduped pass into one raw file per model output-modality group
// * (model.output_modalities joined with "_"). OR forces non-LLM offerings (embeddings,
// * rerank, speech, transcription, …) through the same endpoint pipeline, which is a big
// * source of endpoint/pricing weirdness — this separates the species for study. Scopes are
// * kept verbatim; providers are irrelevant here. Run: bun run split-modalities
import { z } from 'zod'

const Pass = z.looseObject({
  captured_at: z.string(),
  scopes: z.array(
    z.looseObject({ model: z.looseObject({ output_modalities: z.array(z.string()) }) }),
  ),
})

const inputDir = new URL('../../input/', import.meta.url).pathname
const outputDir = new URL('../../output/', import.meta.url).pathname

for (const filename of [...new Bun.Glob('pass_*.json').scanSync(inputDir)].toSorted()) {
  const pass = Pass.parse(await Bun.file(inputDir + filename).json())

  const groups = new Map<string, unknown[]>()
  for (const scope of pass.scopes) {
    const key = scope.model.output_modalities.join('_')
    groups.set(key, [...(groups.get(key) ?? []), scope])
  }

  for (const [key, scopes] of [...groups].toSorted(([a], [b]) => a.localeCompare(b))) {
    const outPath = `${outputDir}modality_${key}_${pass.captured_at}.json`
    await Bun.write(
      outPath,
      JSON.stringify({ captured_at: pass.captured_at, output_modalities: key, scopes }, null, 2),
    )
    console.log(`[split-modalities] wrote ${outPath}`, { scopes: scopes.length })
  }
}
