// * Canonical entity representations (Layer 1), produced from deduped capture passes in
// * ../input (pass_<captured_at>.json — the capture worker's /raw/<captured_at> view, saved
// * verbatim). One output file per entity per pass. Endpoints follow once their shape settles.
// * Run: bun run canonicalize
import { z } from 'zod'

import { canonicalizeEndpoints } from './endpoints.ts'
import { canonicalizeModels } from './models.ts'
import { canonicalizeProviders } from './providers.ts'

// * the deduped pass view, typed only as far as canonicalization currently reaches
const Pass = z.looseObject({
  captured_at: z.string(),
  providers: z.array(z.unknown()),
  scopes: z.array(z.looseObject({ endpoints: z.array(z.unknown()), model: z.unknown() })),
})

const inputDir = new URL('../../input/', import.meta.url).pathname
const outputDir = new URL('../../output/', import.meta.url).pathname

for (const filename of [...new Bun.Glob('pass_*.json').scanSync(inputDir)].toSorted()) {
  const pass = Pass.parse(await Bun.file(inputDir + filename).json())

  const entities = {
    endpoints: canonicalizeEndpoints(pass.scopes.flatMap((scope) => scope.endpoints)),
    models: canonicalizeModels(pass.scopes.map((scope) => scope.model)),
    providers: canonicalizeProviders(pass.providers),
  }

  for (const [entity, rows] of Object.entries(entities)) {
    const outPath = `${outputDir}${entity}_${pass.captured_at}.json`
    await Bun.write(
      outPath,
      JSON.stringify({ captured_at: pass.captured_at, [entity]: rows }, null, 2),
    )
    console.log(`[canonicalize] wrote ${outPath}`, { [entity]: rows.length })
  }
}
