import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import sharp from 'sharp'
import { z } from 'zod'

import { buildLogos } from './build'

const TestManifestAssetSchema = z.object({
  file: z.string(),
  source: z.string(),
  sourceVariant: z.string(),
  width: z.number(),
})

const TestManifestSchema = z.object({
  imageMaxSizePx: z.number(),
  logos: z.array(
    z.object({
      aliasOf: z.string().optional(),
      avatar: TestManifestAssetSchema.optional(),
      dark: TestManifestAssetSchema.optional(),
      key: z.string(),
      light: TestManifestAssetSchema.optional(),
    }),
  ),
  manualSourceCoverageWarnings: z.array(
    z.object({
      key: z.string(),
      missing: z.array(z.string()),
      present: z.array(z.string()),
    }),
  ),
  shadowedManualAssets: z.array(
    z.object({
      group: z.string(),
      key: z.string(),
      manual: z.string(),
      winner: z.string(),
    }),
  ),
  version: z.string(),
})

type TestManifest = z.infer<typeof TestManifestSchema>

type BuildFixture = {
  appRoot: string
  root: string
  sourcePackageRoots: {
    avatar: string
    webp: string
  }
}

test('builds reviewable static output through the build module interface', async () => {
  const fixture = await createBuildFixture({
    aliases: {
      'shared-alias': 'shared',
    },
  })
  const logs: string[] = []

  try {
    const result = await buildLogos({
      appRoot: fixture.appRoot,
      log: (message) => {
        logs.push(message)
      },
      sourcePackageRoots: fixture.sourcePackageRoots,
    })

    expect(result.sourceAssetsWritten).toBe(13)
    expect(result.aliasAssetsWritten).toBe(3)
    expect(result.shadowedManualAssets).toHaveLength(3)
    expect(result.manualSourceCoverageWarnings).toEqual([
      {
        key: 'partial',
        missing: ['dark', 'avatar'],
        present: ['light'],
      },
    ])
    expect(logs).toContain(
      'Warning: manual logo asset incomplete for partial: present light; missing dark, avatar',
    )
    expect(
      logs.filter((line) => line.startsWith('Warning: manual logo asset shadowed')),
    ).toHaveLength(3)
    expect(logs.at(-1)).toBe('Built 16 logo assets into dist/v1 (3 manual assets shadowed)')

    const manifest = await readManifest(fixture.appRoot)
    expect(manifest.version).toBe('v1')
    expect(manifest.imageMaxSizePx).toBe(128)
    expect(manifest.manualSourceCoverageWarnings).toEqual(result.manualSourceCoverageWarnings)
    expect(manifest.shadowedManualAssets).toEqual(result.shadowedManualAssets)

    const shared = findLogo(manifest, 'shared')
    expect(shared.light?.source).toBe('shared-color.svg')
    expect(shared.light?.sourceVariant).toBe('color')
    expect(shared.dark?.source).toBe('shared.svg')
    expect(shared.dark?.sourceVariant).toBe('mono')
    expect(shared.avatar?.source).toBe('shared.webp')
    expect(shared.avatar?.sourceVariant).toBe('avatar')

    const manualOnly = findLogo(manifest, 'manualonly')
    expect(manualOnly.light?.source).toBe('sources/base/manualonly.svg')
    expect(manualOnly.dark?.source).toBe('sources/base/manualonly.svg')
    expect(manualOnly.avatar?.source).toBe('sources/base/manualonly.svg')

    const manualDashed = findLogo(manifest, 'manual-dashed')
    expect(manualDashed.light?.source).toBe('sources/base/manual-dashed.svg')
    expect(manualDashed.dark?.source).toBe('sources/base/manual-dashed.svg')
    expect(manualDashed.avatar?.source).toBe('sources/base/manual-dashed.svg')

    const overridden = findLogo(manifest, 'overridden')
    expect(overridden.light?.source).toBe('sources/base/overridden.svg')
    expect(overridden.dark?.source).toBe('sources/base/overridden.svg')
    expect(overridden.avatar?.source).toBe('sources/avatar/overridden.svg')

    const alias = findLogo(manifest, 'shared-alias')
    expect(alias.aliasOf).toBe('shared')
    expect(alias.light?.file).toBe('v1/light/shared-alias.webp')
    expect(alias.dark?.file).toBe('v1/dark/shared-alias.webp')
    expect(alias.avatar?.file).toBe('v1/avatar/shared-alias.webp')

    expect(manifest.logos.find((logo) => logo.key === 'ignored')).toBeUndefined()
    expect(manifest.logos.find((logo) => logo.key === 'manualdashed')).toBeUndefined()
    await expectWebpOutput(fixture.appRoot, 'v1/light/shared.webp')
    await expectWebpOutput(fixture.appRoot, 'v1/light/shared-alias.webp')
    await expectWebpOutput(fixture.appRoot, 'v1/light/manualonly.webp')
    await expectWebpOutput(fixture.appRoot, 'v1/light/manual-dashed.webp')
    await expectWebpOutput(fixture.appRoot, 'v1/avatar/overridden.webp')
    await expectWebpOutput(fixture.appRoot, 'v1/light/partial.webp')
    await expectWebpOutput(fixture.appRoot, 'v1/light/fallback.webp')
    await expectWebpOutput(fixture.appRoot, 'v1/dark/fallback.webp')
    await expectWebpOutput(fixture.appRoot, 'v1/avatar/fallback.webp')
  } finally {
    await rm(fixture.root, { force: true, recursive: true })
  }
})

test('fails fast when an alias target is missing', async () => {
  const fixture = await createBuildFixture({
    aliases: {
      missingalias: 'missing',
    },
  })

  try {
    let thrown: unknown

    try {
      await buildLogos({
        appRoot: fixture.appRoot,
        log: () => {},
        sourcePackageRoots: fixture.sourcePackageRoots,
      })
    } catch (error) {
      thrown = error
    }

    if (!(thrown instanceof Error)) {
      throw new Error('Expected missing alias target to throw')
    }

    expect(thrown.message).toBe('Alias missingalias points to missing source key missing')
  } finally {
    await rm(fixture.root, { force: true, recursive: true })
  }
})

async function createBuildFixture(args: {
  aliases: Record<string, string>
}): Promise<BuildFixture> {
  const root = await mkdtemp(join(tmpdir(), 'logos-build-'))
  const appRoot = join(root, 'app')
  const webpRoot = join(root, 'lobehub-webp')
  const avatarRoot = join(root, 'lobehub-avatar')

  await writeJson(join(appRoot, 'sources', 'aliases.json'), { aliases: args.aliases })
  await writeJson(join(webpRoot, 'package.json'), {
    name: '@lobehub/icons-static-webp',
    version: '9.9.9',
  })
  await writeJson(join(avatarRoot, 'package.json'), {
    name: '@lobehub/icons-static-avatar',
    version: '8.8.8',
  })

  await writeSvg(join(webpRoot, 'light', 'shared.svg'), '#64748b')
  await writeSvg(join(webpRoot, 'light', 'shared-color.svg'), '#ef4444')
  await writeSvg(join(webpRoot, 'light', 'ignored-brand-color.svg'), '#22c55e')
  await writeSvg(join(webpRoot, 'light', 'ignored-text.svg'), '#22c55e')
  await writeSvg(join(webpRoot, 'dark', 'shared.svg'), '#0f172a')
  await writeWebp(join(avatarRoot, 'avatars', 'shared.webp'), '#38bdf8')

  await writeSvg(join(appRoot, 'sources', 'base', 'manualonly.svg'), '#f59e0b')
  await writeSvg(join(appRoot, 'sources', 'base', 'manual-dashed.svg'), '#22c55e')
  await writeSvg(join(appRoot, 'sources', 'base', 'overridden.svg'), '#64748b')
  await writeSvg(join(appRoot, 'sources', 'base', 'shared.svg'), '#a855f7')
  await writeSvg(join(appRoot, 'sources', 'avatar', 'overridden.svg'), '#f97316')
  await writeSvg(join(appRoot, 'sources', 'light', 'partial.svg'), '#14b8a6')

  return {
    appRoot,
    root,
    sourcePackageRoots: {
      avatar: avatarRoot,
      webp: webpRoot,
    },
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function writeSvg(path: string, fill: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await Bun.write(path, createSvg(fill))
}

async function writeWebp(path: string, fill: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await sharp(Buffer.from(createSvg(fill)))
    .webp()
    .toFile(path)
}

function createSvg(fill: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${fill}"/></svg>`
}

async function readManifest(appRoot: string): Promise<TestManifest> {
  return TestManifestSchema.parse(
    JSON.parse(await Bun.file(join(appRoot, 'dist', 'v1', 'manifest.json')).text()),
  )
}

function findLogo(manifest: TestManifest, key: string): TestManifest['logos'][number] {
  const logo = manifest.logos.find((candidate) => candidate.key === key)
  if (logo === undefined) {
    throw new Error(`Missing manifest logo ${key}`)
  }

  return logo
}

async function expectWebpOutput(appRoot: string, path: string): Promise<void> {
  const outputPath = join(appRoot, 'dist', path)
  const output = await sharp(outputPath).metadata()

  expect(output.format).toBe('webp')
  expect(output.width).toBeLessThanOrEqual(128)
}
