// * Processes every archive bundle in ../input in crawl order, materializing each into
// * models/endpoints/providers (mirroring convex/snapshots/materialize/main.ts but without
// * validation/transformation), and writes an atomic changeset between consecutive bundles.
// * Results go to ../output. Run: bun run src/unbundle.ts
import { atomizeChangeset, diff } from 'json-diff-ts'
import prettyBytes from 'pretty-bytes'
import * as R from 'remeda'

// * loose shapes — we deliberately skip validation, so type only what we access
type RawEndpoint = Record<string, unknown> & {
  id: string
  model: Record<string, unknown> & { slug: string }
  provider_info: Record<string, unknown> & { slug: string }
}
type Bundle = {
  crawl_id: string
  data: {
    models: Array<{
      model: { permaslug: string; endpoint?: { variant?: string } }
      // non-array marks a failed endpoint fetch for that model
      endpoints: RawEndpoint[] | Record<string, unknown>
    }>
  }
}

const inputDir = new URL('../../input/', import.meta.url).pathname
const outputDir = new URL('../../output/', import.meta.url).pathname

// * bundles use the backend's archive-sync format: gzipped JSON (bundle_<crawl_id>.json.gz)
async function readBundle(filename: string) {
  const compressed = await Bun.file(inputDir + filename).bytes()
  const bytes = Bun.gunzipSync(compressed)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- deliberately unvalidated; shapes typed only as far as we access them
  return JSON.parse(new TextDecoder().decode(bytes)) as Bundle
}

function materialize(bundle: Bundle) {
  console.log(`[unbundle]`, { crawl_id: bundle.crawl_id })

  // * collect failed model keys before filtering
  const failedModelKeys = new Set<string>()
  for (const m of bundle.data.models) {
    if (!Array.isArray(m.endpoints)) {
      failedModelKeys.add(`${m.model.permaslug}:${m.model.endpoint?.variant}`)
    }
  }
  if (failedModelKeys.size > 0) {
    console.warn('[unbundle] endpoint fetch errors, skipping models:', [...failedModelKeys])
  }

  const rawEndpoints = bundle.data.models.flatMap((m) =>
    Array.isArray(m.endpoints) ? m.endpoints : [],
  )

  // * dedupe by natural keys, keeping descriptions on the model
  const modelsMap = new Map<string, unknown>()
  const endpointsMap = new Map<string, unknown>()
  const providersMap = new Map<string, unknown>()

  for (const endpoint of rawEndpoints) {
    endpointsMap.set(
      endpoint.id,
      R.omit(endpoint, [
        'model',
        'provider_info',
        'routing_heuristics_by_tier',
        'status',
        'status_heuristics',
        'status_heuristics_5m',
        'status_heuristics_1d',
        'stats',
        'statsByTier',
      ]),
    )
    providersMap.set(endpoint.provider_info.slug, endpoint.provider_info)
    modelsMap.set(endpoint.model.slug, R.omit(endpoint.model, ['endpoint']))
  }

  return {
    crawl_id: bundle.crawl_id,
    data: {
      endpoints: [...endpointsMap.values()],
      models: [...modelsMap.values()],
      providers: [...providersMap.values()],
    },
    failedModelKeys: [...failedModelKeys],
  }
}

// * process bundles in crawl order (filenames embed sortable crawl_ids)
const bundleFiles = [...new Bun.Glob('bundle_*.gz').scanSync(inputDir)].toSorted()
console.log(`[unbundle] found ${bundleFiles.length} bundles`, bundleFiles)

let previous: ReturnType<typeof materialize> | undefined

for (const filename of bundleFiles) {
  const current = materialize(await readBundle(filename))

  const outPath = `${outputDir}materialized_${current.crawl_id}.json`
  const written = await Bun.write(outPath, JSON.stringify(current, null, 2))
  console.log(`[unbundle] wrote ${outPath}`, {
    endpoints: current.data.endpoints.length,
    models: current.data.models.length,
    providers: current.data.providers.length,
    size: prettyBytes(written),
  })

  // * atomic changeset between consecutive data objects, keying array entries by natural ids
  if (previous) {
    const changeset = atomizeChangeset(
      diff(previous.data, current.data, {
        embeddedObjKeys: { endpoints: 'id', models: 'slug', providers: 'slug' },
      }),
    )
    const changesetPath = `${outputDir}changeset_${previous.crawl_id}_${current.crawl_id}.json`
    const changesetWritten = await Bun.write(changesetPath, JSON.stringify(changeset, null, 2))
    console.log(`[unbundle] wrote ${changesetPath}`, {
      changes: changeset.length,
      size: prettyBytes(changesetWritten),
    })
  }

  previous = current
}
