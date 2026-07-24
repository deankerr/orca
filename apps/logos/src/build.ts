import { access, mkdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import nodePath from 'node:path'

import sharp from 'sharp'
import type { Sharp } from 'sharp'
import { z } from 'zod'

import {
  ASSET_GROUPS,
  FALLBACK_FILE,
  PUBLIC_VERSION,
  fallbackAssetPath,
  logoAssetFile,
  logoAssetManifestPath,
} from './contract'
import type { AssetGroup } from './contract'
import { emitFallbackAsset } from './fallback-image'

// Keep the public key parser and output image size easy to change while the service is young.
const FILE_EXTENSION = /\.(?:avif|png|jpe?g|svg|webp)$/i
const THEME_GROUPS = ['light', 'dark'] as const
const MANUAL_SOURCE_GROUPS = ['base', ...ASSET_GROUPS] as const
const OUTPUT_IMAGE_SIZE_PX = 128
const OUTPUT_WEBP_QUALITY = 92

// Resolve defaults from this app, not from ORCA packages.
const require = createRequire(import.meta.url)
const DEFAULT_APP_ROOT = nodePath.dirname(import.meta.dirname)

// Parse external JSON and package metadata before using it to write files.
const AliasCatalogSchema = z.object({
  aliases: z.record(z.string(), z.string()),
})

const PackageJsonSchema = z.object({
  name: z.string(),
  version: z.string(),
})

type AliasCatalog = z.infer<typeof AliasCatalogSchema>
type ThemeGroup = (typeof THEME_GROUPS)[number]
type ManualSourceGroup = (typeof MANUAL_SOURCE_GROUPS)[number]
type ThemeVariant = 'color' | 'mono'
type SourceKind = 'lobehub' | 'manual'

type BuildLog = (message: string) => void

type BuildContext = {
  appRoot: string
  catalogPath: string
  distDir: string
  log: BuildLog
  manualSourceDir: string
  publicDir: string
}

type SourcePackage = {
  name: string
  root: string
  version: string
}

type SourcePackageRoots = {
  avatar: string
  webp: string
}

type SourceAsset = {
  file: string
  key: string
  packageName: string
  packageVersion: string
  sourceKind: SourceKind
  sourcePath: string
  variant: ThemeVariant | 'avatar' | 'manual'
}

type SourceIndex = Record<AssetGroup, Map<string, SourceAsset>>
type ManualSourceIndex = Record<ManualSourceGroup, Map<string, SourceAsset>>

type ResolvedSources = {
  manualSourceCoverageWarnings: ManualSourceCoverageWarning[]
  shadowedManualAssets: ShadowedManualAsset[]
  sources: SourceIndex
}

type ManifestAsset = {
  file: string
  format: 'webp'
  height: number
  package: string
  source: string
  sourceVariant: SourceAsset['variant']
  width: number
}

type ManifestLogo = {
  aliasOf?: string
  avatar?: ManifestAsset
  dark?: ManifestAsset
  key: string
  light?: ManifestAsset
}

type ManualSourceCoverageWarning = {
  key: string
  missing: AssetGroup[]
  present: AssetGroup[]
}

type ShadowedManualAsset = {
  group: AssetGroup
  key: string
  manual: string
  winner: string
}

type Manifest = {
  aliases: Record<string, string>
  imageMaxSizePx: number
  logos: ManifestLogo[]
  manualSourceCoverageWarnings: ManualSourceCoverageWarning[]
  shadowedManualAssets: ShadowedManualAsset[]
  version: typeof PUBLIC_VERSION
}

export type OutputDimensionLogo = Pick<ManifestLogo, 'avatar' | 'dark' | 'key' | 'light'>

type StaticOutputResult = {
  aliasAssetsWritten: number
  manifest: Manifest
  sourceAssetsWritten: number
}

export type BuildLogosOptions = {
  appRoot?: string
  log?: BuildLog
  sourcePackageRoots?: SourcePackageRoots
}

export type BuildLogosResult = {
  aliasAssetsWritten: number
  manualSourceCoverageWarnings: ManualSourceCoverageWarning[]
  outputDir: string
  shadowedManualAssets: ShadowedManualAsset[]
  sourceAssetsWritten: number
}

// Build the complete static directory and manifest from pinned source packages.
export async function buildLogos(options: BuildLogosOptions = {}): Promise<BuildLogosResult> {
  const context = createBuildContext(options)
  const aliases = await readAliasCatalog(context.catalogPath)
  const packages = await resolveSourcePackages(options.sourcePackageRoots)
  const sources = await collectSources({ context, packages })

  assertAliasTargetsExist({ aliases, sources })
  assertReservedKeysAreUnused(sources.sources)

  console.log('avatar', sources.sources.avatar.size)
  console.log('light', sources.sources.light.size)
  console.log('dark', sources.sources.dark.size)

  const output = await emitStaticOutput({ aliases, context, sources })
  emitBuildWarnings({ context, sources })

  context.log(
    `Built ${output.sourceAssetsWritten + output.aliasAssetsWritten} logo assets into ${nodePath.relative(
      context.appRoot,
      context.publicDir,
    )} (${sources.shadowedManualAssets.length} manual assets shadowed)`,
  )

  return {
    aliasAssetsWritten: output.aliasAssetsWritten,
    manualSourceCoverageWarnings: sources.manualSourceCoverageWarnings,
    outputDir: context.publicDir,
    shadowedManualAssets: sources.shadowedManualAssets,
    sourceAssetsWritten: output.sourceAssetsWritten,
  }
}

// Keep filesystem choices at the module seam so tests can use isolated fixtures.
function createBuildContext(options: BuildLogosOptions): BuildContext {
  const appRoot = options.appRoot ?? DEFAULT_APP_ROOT
  const distDir = nodePath.join(appRoot, 'dist')

  return {
    appRoot,
    catalogPath: nodePath.join(appRoot, 'sources', 'aliases.json'),
    distDir,
    log: options.log ?? console.log,
    manualSourceDir: nodePath.join(appRoot, 'sources'),
    publicDir: nodePath.join(distDir, PUBLIC_VERSION),
  }
}

// Public keys are lowercase and extension-free; provider punctuation stays part of the contract.
function normalizeLogoKey(input: string): string {
  return input.replace(FILE_EXTENSION, '').toLowerCase()
}

// Only bare icons and direct color variants are eligible.
function parseLobehubThemeVariant(file: string): { isColor: boolean; key: string } | undefined {
  const baseName = file.replace(FILE_EXTENSION, '')
  const dashIndex = baseName.indexOf('-')
  const entityName = dashIndex === -1 ? baseName : baseName.slice(0, dashIndex)
  const variant = dashIndex === -1 ? '' : baseName.slice(dashIndex + 1)

  if (variant !== '' && variant !== 'color') {
    return undefined
  }

  return {
    isColor: variant === 'color',
    key: normalizeLogoKey(entityName),
  }
}

// Normalize aliases at the catalog boundary.
async function readAliasCatalog(path: string): Promise<AliasCatalog['aliases']> {
  const rawCatalog = await readJsonFile(path)
  const catalog = AliasCatalogSchema.parse(rawCatalog)

  return Object.fromEntries(
    Object.entries(catalog.aliases).map(([alias, target]) => [
      normalizeLogoKey(alias),
      normalizeLogoKey(target),
    ]),
  )
}

// Record package versions in the manifest for auditability.
async function resolveSourcePackages(roots?: SourcePackageRoots): Promise<{
  avatar: SourcePackage
  webp: SourcePackage
}> {
  const packageRoots = roots ?? {
    avatar: nodePath.dirname(require.resolve('@lobehub/icons-static-avatar/package.json')),
    webp: nodePath.dirname(require.resolve('@lobehub/icons-static-webp/package.json')),
  }

  return {
    avatar: await readSourcePackage(packageRoots.avatar),
    webp: await readSourcePackage(packageRoots.webp),
  }
}

async function readSourcePackage(root: string): Promise<SourcePackage> {
  const packageJson = PackageJsonSchema.parse(
    await readJsonFile(nodePath.join(root, 'package.json')),
  )

  return {
    name: packageJson.name,
    root,
    version: packageJson.version,
  }
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await Bun.file(path).text()) as unknown
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// Collect upstream and manual assets before applying precedence rules.
async function collectSources(args: {
  context: BuildContext
  packages: { avatar: SourcePackage; webp: SourcePackage }
}): Promise<ResolvedSources> {
  const lobehubSources: SourceIndex = {
    avatar: await collectLobehubAvatars(args.packages.avatar),
    dark: await collectLobehubThemeAssets({ group: 'dark', sourcePackage: args.packages.webp }),
    light: await collectLobehubThemeAssets({ group: 'light', sourcePackage: args.packages.webp }),
  }
  const manualSources = await collectManualSources(args.context)

  return resolveSources({ lobehubSources, manualSources })
}

// Color variants win over mono variants; brand and text variants are ignored.
async function collectLobehubThemeAssets(args: {
  group: ThemeGroup
  sourcePackage: SourcePackage
}): Promise<Map<string, SourceAsset>> {
  const assets = new Map<string, SourceAsset>()
  const glob = new Bun.Glob('*.{avif,png,jpg,jpeg,svg,webp}')
  const sourceDir = nodePath.join(args.sourcePackage.root, args.group)

  for await (const file of glob.scan({ cwd: sourceDir })) {
    const variant = parseLobehubThemeVariant(file)
    if (variant === undefined) {
      continue
    }

    const existing = assets.get(variant.key)
    if (existing !== undefined && existing.variant === 'color' && !variant.isColor) {
      continue
    }

    if (existing !== undefined && existing.variant === 'color' && variant.isColor) {
      throw new Error(`Duplicate color asset for ${args.group}/${variant.key}`)
    }

    if (existing !== undefined && existing.variant === 'mono' && !variant.isColor) {
      throw new Error(`Duplicate mono asset for ${args.group}/${variant.key}`)
    }

    assets.set(variant.key, {
      file,
      key: variant.key,
      packageName: args.sourcePackage.name,
      packageVersion: args.sourcePackage.version,
      sourceKind: 'lobehub',
      sourcePath: nodePath.join(sourceDir, file),
      variant: variant.isColor ? 'color' : 'mono',
    })
  }

  return sortAssetMap(assets)
}

// Avatar files are already grouped separately upstream.
async function collectLobehubAvatars(
  sourcePackage: SourcePackage,
): Promise<Map<string, SourceAsset>> {
  const assets = new Map<string, SourceAsset>()
  const glob = new Bun.Glob('*.webp')
  const sourceDir = nodePath.join(sourcePackage.root, 'avatars')

  for await (const file of glob.scan({ cwd: sourceDir })) {
    const key = normalizeLogoKey(file)
    if (assets.has(key)) {
      throw new Error(`Duplicate avatar asset for ${key}`)
    }

    assets.set(key, {
      file,
      key,
      packageName: sourcePackage.name,
      packageVersion: sourcePackage.version,
      sourceKind: 'lobehub',
      sourcePath: nodePath.join(sourceDir, file),
      variant: 'avatar',
    })
  }

  return sortAssetMap(assets)
}

// Manual base assets fill every missing public group; group folders are optional overrides.
async function collectManualSources(context: BuildContext): Promise<ManualSourceIndex> {
  return {
    avatar: await collectManualGroup({ context, group: 'avatar' }),
    base: await collectManualGroup({ context, group: 'base' }),
    dark: await collectManualGroup({ context, group: 'dark' }),
    light: await collectManualGroup({ context, group: 'light' }),
  }
}

async function collectManualGroup(args: {
  context: BuildContext
  group: ManualSourceGroup
}): Promise<Map<string, SourceAsset>> {
  const assets = new Map<string, SourceAsset>()
  const glob = new Bun.Glob('*.{avif,png,jpg,jpeg,svg,webp}')
  const sourceDir = nodePath.join(args.context.manualSourceDir, args.group)

  if (!(await pathExists(sourceDir))) {
    return assets
  }

  for await (const file of glob.scan({ cwd: sourceDir })) {
    const key = normalizeLogoKey(file)
    if (assets.has(key)) {
      throw new Error(`Duplicate manual asset for ${args.group}/${key}`)
    }

    assets.set(key, {
      file: `sources/${args.group}/${file}`,
      key,
      packageName: 'manual',
      packageVersion: 'source-controlled',
      sourceKind: 'manual',
      sourcePath: nodePath.join(sourceDir, file),
      variant: 'manual',
    })
  }

  return sortAssetMap(assets)
}

// LobeHub wins over manual assets, but shadowed manual files remain visible.
function resolveSources(args: {
  lobehubSources: SourceIndex
  manualSources: ManualSourceIndex
}): ResolvedSources {
  const shadowedManualAssets: ShadowedManualAsset[] = []
  const sources = createEmptySourceIndex()

  for (const group of ASSET_GROUPS) {
    for (const [key, asset] of args.lobehubSources[group]) {
      sources[group].set(key, asset)
    }

    for (const manualAssets of [args.manualSources[group], args.manualSources.base]) {
      for (const [key, asset] of manualAssets) {
        const existing = sources[group].get(key)
        if (existing !== undefined) {
          if (existing.sourceKind === 'lobehub') {
            shadowedManualAssets.push({
              group,
              key,
              manual: asset.file,
              winner: describeSourceAsset(existing),
            })
          }
          continue
        }

        sources[group].set(key, asset)
      }
    }

    sources[group] = sortAssetMap(sources[group])
  }

  return {
    manualSourceCoverageWarnings: collectManualSourceCoverageWarnings({
      manualSources: args.manualSources,
      resolvedSources: sources,
    }),
    shadowedManualAssets: shadowedManualAssets.toSorted((left, right) =>
      `${left.group}/${left.key}`.localeCompare(`${right.group}/${right.key}`),
    ),
    sources,
  }
}

// Manual-only gaps should be obvious during build instead of living in README memory.
function collectManualSourceCoverageWarnings(args: {
  manualSources: ManualSourceIndex
  resolvedSources: SourceIndex
}): ManualSourceCoverageWarning[] {
  const keys = new Set<string>()
  for (const group of MANUAL_SOURCE_GROUPS) {
    for (const key of args.manualSources[group].keys()) {
      keys.add(key)
    }
  }

  return [...keys]
    .map((key) => {
      const present = ASSET_GROUPS.filter((group) => args.resolvedSources[group].has(key))
      const missing = ASSET_GROUPS.filter((group) => !args.resolvedSources[group].has(key))

      return { key, missing, present }
    })
    .filter((warning) => warning.missing.length > 0)
    .toSorted((left, right) => left.key.localeCompare(right.key))
}

function createEmptySourceIndex(): SourceIndex {
  return {
    avatar: new Map(),
    dark: new Map(),
    light: new Map(),
  }
}

function sortAssetMap(assets: Map<string, SourceAsset>): Map<string, SourceAsset> {
  return new Map([...assets.entries()].toSorted(([left], [right]) => left.localeCompare(right)))
}

// Aliases must be reproducible duplicate files, not runtime matching rules.
function assertAliasTargetsExist(args: {
  aliases: Record<string, string>
  sources: ResolvedSources
}): void {
  for (const [alias, target] of Object.entries(args.aliases)) {
    if (alias === target) {
      throw new Error(`Alias ${alias} points to itself`)
    }

    if (hasAnyGroup(args.sources.sources, alias)) {
      throw new Error(`Alias ${alias} conflicts with a source asset key`)
    }

    if (!hasAnyGroup(args.sources.sources, target)) {
      throw new Error(`Alias ${alias} points to missing source key ${target}`)
    }
  }
}

function hasAnyGroup(sources: SourceIndex, key: string): boolean {
  return ASSET_GROUPS.some((group) => sources[group].has(key))
}

// Fallback files are generated by the service, not supplied as logo source keys.
function assertReservedKeysAreUnused(sources: SourceIndex): void {
  const fallbackKey = normalizeLogoKey(FALLBACK_FILE)

  for (const group of ASSET_GROUPS) {
    if (sources[group].has(fallbackKey)) {
      throw new Error(`Reserved logo key ${fallbackKey} is used by ${group} source assets`)
    }
  }
}

// Recreate the generated tree and write all public artifacts.
async function emitStaticOutput(args: {
  aliases: Record<string, string>
  context: BuildContext
  sources: ResolvedSources
}): Promise<StaticOutputResult> {
  await recreateDist(args.context)

  const manifest = createEmptyManifest({
    aliases: args.aliases,
    manualSourceCoverageWarnings: args.sources.manualSourceCoverageWarnings,
    shadowedManualAssets: args.sources.shadowedManualAssets,
  })
  const sourceAssetsWritten = await emitSourceAssets({
    context: args.context,
    manifest,
    sources: args.sources,
  })
  const aliasAssetsWritten = await emitAliasAssets({
    aliases: args.aliases,
    context: args.context,
    manifest,
    sources: args.sources,
  })

  assertValidOutputDimensions(manifest.logos)
  await emitFallback(args.context)
  await writeManifest({ context: args.context, manifest })

  return {
    aliasAssetsWritten,
    manifest,
    sourceAssetsWritten,
  }
}

// The dist tree is generated and safe to recreate from scratch.
async function recreateDist(context: BuildContext): Promise<void> {
  await rm(context.distDir, { force: true, recursive: true })

  for (const group of ASSET_GROUPS) {
    await mkdir(nodePath.join(context.publicDir, group), { recursive: true })
  }
}

function createEmptyManifest(args: {
  aliases: Record<string, string>
  manualSourceCoverageWarnings: ManualSourceCoverageWarning[]
  shadowedManualAssets: ShadowedManualAsset[]
}): Manifest {
  return {
    aliases: args.aliases,
    imageMaxSizePx: OUTPUT_IMAGE_SIZE_PX,
    logos: [],
    manualSourceCoverageWarnings: args.manualSourceCoverageWarnings,
    shadowedManualAssets: args.shadowedManualAssets,
    version: PUBLIC_VERSION,
  }
}

async function emitSourceAssets(args: {
  context: BuildContext
  manifest: Manifest
  sources: ResolvedSources
}): Promise<number> {
  let writtenCount = 0

  for (const group of ASSET_GROUPS) {
    for (const [key, asset] of args.sources.sources[group]) {
      await emitAsset({
        asset,
        context: args.context,
        group,
        key,
        manifest: args.manifest,
      })
      writtenCount += 1
    }
  }

  return writtenCount
}

async function emitAliasAssets(args: {
  aliases: Record<string, string>
  context: BuildContext
  manifest: Manifest
  sources: ResolvedSources
}): Promise<number> {
  let writtenCount = 0

  for (const [alias, target] of Object.entries(args.aliases)) {
    for (const group of ASSET_GROUPS) {
      const targetAsset = args.sources.sources[group].get(target)
      if (targetAsset === undefined) {
        continue
      }

      await emitAsset({
        aliasOf: target,
        asset: targetAsset,
        context: args.context,
        group,
        key: alias,
        manifest: args.manifest,
      })
      writtenCount += 1
    }
  }

  return writtenCount
}

function describeSourceAsset(asset: SourceAsset): string {
  if (asset.sourceKind === 'manual') {
    return asset.file
  }

  return `${asset.packageName}@${asset.packageVersion}/${asset.file}`
}

// Process every source and alias through Sharp before publishing WebP.
async function emitAsset(args: {
  aliasOf?: string
  asset: SourceAsset
  context: BuildContext
  group: AssetGroup
  key: string
  manifest: Manifest
}): Promise<void> {
  const outputFile = logoAssetFile(args.key)
  const outputPath = nodePath.join(args.context.publicDir, args.group, outputFile)
  const input = await loadSourceImage(args.asset.sourcePath)
  const output = await input
    .resize({
      background: { alpha: 0, b: 0, g: 0, r: 0 },
      fit: 'contain',
      height: OUTPUT_IMAGE_SIZE_PX,
      width: OUTPUT_IMAGE_SIZE_PX,
      // Vector sources are re-rasterized at the target size, so only clamp raster upscaling.
      withoutEnlargement: !args.asset.sourcePath.endsWith('.svg'),
    })
    .webp({ quality: OUTPUT_WEBP_QUALITY })
    .toFile(outputPath)

  recordManifestAsset({
    aliasOf: args.aliasOf,
    asset: args.asset,
    group: args.group,
    height: output.height,
    key: args.key,
    manifest: args.manifest,
    width: output.width,
  })
}

// SVGs rasterize at their viewBox pixel size by default, freezing small icons well below the
// target. Scale the render density so vector sources fill the output box at full resolution.
async function loadSourceImage(sourcePath: string): Promise<Sharp> {
  if (!sourcePath.endsWith('.svg')) {
    return sharp(sourcePath)
  }

  const { width, height } = await sharp(sourcePath).metadata()
  const DEFAULT_SVG_DENSITY = 72
  const density = Math.max(
    DEFAULT_SVG_DENSITY,
    (DEFAULT_SVG_DENSITY * OUTPUT_IMAGE_SIZE_PX) / Math.max(width, height),
  )

  return sharp(sourcePath, { density })
}

// The manifest is for audits and tests, not for request-time routing.
function recordManifestAsset(args: {
  aliasOf?: string
  asset: SourceAsset
  group: AssetGroup
  height: number
  key: string
  manifest: Manifest
  width: number
}): void {
  const logo = getManifestLogo(args.manifest, args.key)
  logo.aliasOf = args.aliasOf

  logo[args.group] = {
    file: logoAssetManifestPath({ group: args.group, key: args.key }),
    format: 'webp',
    height: args.height,
    package: `${args.asset.packageName}@${args.asset.packageVersion}`,
    source: args.asset.file,
    sourceVariant: args.asset.variant,
    width: args.width,
  }
}

function getManifestLogo(manifest: Manifest, key: string): ManifestLogo {
  const existing = manifest.logos.find((logo) => logo.key === key)
  if (existing !== undefined) {
    return existing
  }

  const logo = { key }
  manifest.logos.push(logo)
  manifest.logos.sort((left, right) => left.key.localeCompare(right.key))

  return logo
}

// Public files are fixed-size canvases, and theme pairs must remain interchangeable.
export function assertValidOutputDimensions(logos: OutputDimensionLogo[]): void {
  for (const logo of logos) {
    if (
      logo.light !== undefined &&
      logo.dark !== undefined &&
      (logo.light.width !== logo.dark.width || logo.light.height !== logo.dark.height)
    ) {
      throw new Error(
        `Theme output dimensions differ for ${logo.key}: light ${logo.light.width}x${logo.light.height}, dark ${logo.dark.width}x${logo.dark.height}`,
      )
    }

    for (const group of ASSET_GROUPS) {
      const asset = logo[group]
      if (asset === undefined) {
        continue
      }

      if (asset.width !== OUTPUT_IMAGE_SIZE_PX || asset.height !== OUTPUT_IMAGE_SIZE_PX) {
        throw new Error(
          `Invalid output dimensions for ${group}/${logo.key}: expected ${OUTPUT_IMAGE_SIZE_PX}x${OUTPUT_IMAGE_SIZE_PX}, got ${asset.width}x${asset.height}`,
        )
      }
    }
  }
}

// The fallback image is isolated because the placeholder art is intentionally temporary.
async function emitFallback(context: BuildContext): Promise<void> {
  for (const group of ASSET_GROUPS) {
    await emitFallbackAsset({
      group,
      outputPath: nodePath.join(context.distDir, fallbackAssetPath(group)),
      sizePx: OUTPUT_IMAGE_SIZE_PX,
      webpQuality: OUTPUT_WEBP_QUALITY,
    })
  }
}

async function writeManifest(args: { context: BuildContext; manifest: Manifest }): Promise<void> {
  await Bun.write(
    nodePath.join(args.context.publicDir, 'manifest.json'),
    `${JSON.stringify(args.manifest, null, 2)}\n`,
  )
}

// Warnings stay visible in build logs so manifest inspection is not required.
function emitBuildWarnings(args: { context: BuildContext; sources: ResolvedSources }): void {
  for (const warning of args.sources.manualSourceCoverageWarnings) {
    args.context.log(formatManualSourceCoverageWarning(warning))
  }

  for (const asset of args.sources.shadowedManualAssets) {
    args.context.log(formatShadowedManualAssetWarning(asset))
  }
}

function formatManualSourceCoverageWarning(warning: ManualSourceCoverageWarning): string {
  return `Warning: manual logo asset incomplete for ${warning.key}: present ${warning.present.join(
    ', ',
  )}; missing ${warning.missing.join(', ')}`
}

function formatShadowedManualAssetWarning(asset: ShadowedManualAsset): string {
  return `Warning: manual logo asset shadowed for ${asset.group}/${asset.key}: ${asset.manual} -> ${asset.winner}`
}

// Keep imports side-effect-free for tests.
if (import.meta.main) {
  await buildLogos()
}
