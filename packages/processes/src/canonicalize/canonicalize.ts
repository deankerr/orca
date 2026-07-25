// * Canonical entity representations (Layer 1), produced from Layer 0 passes mirrored into
// * ../input/raw by `bun run mirror` (apps/capture). One output file per entity per pass.
// * Run: bun run canonicalize
import { canonicalizeEndpoints } from './endpoints.ts'
import { canonicalizeModels } from './models.ts'
import { mirroredPasses, readPass } from './pass.ts'
import { canonicalizeProviders } from './providers.ts'

const outputDir = new URL('../../output/', import.meta.url).pathname

for (const captured_at of mirroredPasses()) {
  const pass = await readPass(captured_at)

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
