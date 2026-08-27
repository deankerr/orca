import path from 'node:path'

import { Glob } from 'bun'
import { z } from 'zod'

/**
 * Mirrors the producer contract in
 * packages/backend/convex/snapshots/bundles/format.ts.
 *
 * Keep the definitions aligned until the format has a permanent shared-package home.
 */
export const ModelEndpointsV1Schema = z.object({
  bundle_format: z.literal('model-endpoints-v1'),
  crawl_at: z.iso.datetime(),
  crawl_id: z.string(),
  data: z
    .object({
      endpoints: z
        .looseObject({
          id: z.uuid(),
          model_variant_slug: z.string(),
        })
        .array()
        .nullable(),
      model: z.looseObject({
        permaslug: z.string(),
        slug: z.string(),
      }),
      model_id: z.string(),
      variant: z.string(),
    })
    .array(),
})

export type ModelEndpointsV1 = z.infer<typeof ModelEndpointsV1Schema>

export type LoadedModelEndpointsV1 = {
  bundle: ModelEndpointsV1
  path: string
}

export async function findBundlePaths(
  filters: readonly string[],
  bundlesPath: string | undefined,
): Promise<string[]> {
  const matches = new Set<string>()
  const fragments: string[] = []

  for (const filter of filters) {
    const directPath = path.resolve(filter)
    if (await Bun.file(directPath).exists()) {
      matches.add(directPath)
    } else {
      fragments.push(filter)
    }
  }

  const shouldSearchDirectory = fragments.length > 0 || filters.length === 0
  if (shouldSearchDirectory && (bundlesPath === undefined || bundlesPath === '')) {
    throw new Error('Set BUNDLES_PATH or provide bundle files directly.')
  }

  if (shouldSearchDirectory && bundlesPath !== undefined && bundlesPath !== '') {
    const directory = path.resolve(bundlesPath)
    const glob = new Glob('*.me1.orca.json*')

    for await (const filename of glob.scan({ cwd: directory, onlyFiles: true })) {
      if (!isBundleFilename(filename)) {
        continue
      }
      if (fragments.length > 0 && !fragments.some((fragment) => filename.includes(fragment))) {
        continue
      }
      matches.add(path.resolve(directory, filename))
    }
  }

  const paths = [...matches].toSorted((left, right) =>
    path.basename(left).localeCompare(path.basename(right)),
  )
  if (paths.length === 0) {
    throw new Error('No bundle files matched the requested inputs.')
  }
  return paths
}

export async function findLatestBundlePath(
  filter: string | undefined,
  bundlesPath: string | undefined,
): Promise<string> {
  const paths = await findBundlePaths(
    filter === undefined || filter === '' ? [] : [filter],
    bundlesPath,
  )
  const latestPath = paths.at(-1)
  if (latestPath === undefined) {
    throw new Error('No bundle files matched the requested input.')
  }
  return latestPath
}

export async function loadBundle(bundlePath: string): Promise<ModelEndpointsV1> {
  let data: unknown
  try {
    const bytes = await Bun.file(bundlePath).bytes()
    const text = bundlePath.endsWith('.gz')
      ? new TextDecoder().decode(Bun.gunzipSync(bytes))
      : new TextDecoder().decode(bytes)
    data = JSON.parse(text)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read bundle ${bundlePath}: ${message}`, { cause: error })
  }

  const parsed = ModelEndpointsV1Schema.safeParse(data)
  if (!parsed.success) {
    throw new Error(
      `Invalid ModelEndpointsV1 bundle ${bundlePath}:\n${z.prettifyError(parsed.error)}`,
    )
  }
  return parsed.data
}

export async function* loadBundleSeries(
  bundlePaths: readonly string[],
): AsyncGenerator<LoadedModelEndpointsV1> {
  for (const bundlePath of bundlePaths) {
    yield { bundle: await loadBundle(bundlePath), path: bundlePath }
  }
}

function isBundleFilename(filename: string): boolean {
  return filename.endsWith('.me1.orca.json') || filename.endsWith('.me1.orca.json.gz')
}
