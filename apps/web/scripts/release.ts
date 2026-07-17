#!/usr/bin/env bun
/**
 * Create a new release with auto-incremented version.
 *
 * Usage:
 *   bun scripts/release.ts                    # auto-increment, push, create release
 *   bun scripts/release.ts "table perf"       # with a title/summary
 *   bun scripts/release.ts --dry-run          # bump+commit, skip push+release
 */
import { $ } from 'bun'
import { z } from 'zod'

// --- Config ---

const ROOT = import.meta.dir.replace(/\/apps\/web\/scripts$/, '')
const PACKAGE_JSON = `${ROOT}/apps/web/package.json`

// --- Schemas ---

const VersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/)
const PackageJsonSchema = z.looseObject({ version: VersionSchema })
const VERSION_PATTERN = /^\s*"version":\s*"[^"]+".*$/m

// --- Args ---

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const title = args.find((a) => !a.startsWith('--'))

// --- Helpers ---

const textDecoder = new TextDecoder()

function getStdout(command: Array<string>) {
  const result = Bun.spawnSync({ cmd: command, stderr: 'pipe', stdout: 'pipe' })
  if (result.exitCode !== 0) {
    throw new Error(textDecoder.decode(result.stderr).trim())
  }
  return textDecoder.decode(result.stdout).trim()
}

function parseVersion(packageJsonText: string) {
  const pkg = PackageJsonSchema.parse(JSON.parse(packageJsonText))
  return VersionSchema.parse(pkg.version)
}

function bumpVersion(packageJsonText: string, nextVersion: string) {
  const currentVersion = parseVersion(packageJsonText)
  const updated = packageJsonText.replace(VERSION_PATTERN, (versionLine) =>
    versionLine.replace(currentVersion, nextVersion),
  )
  if (updated === packageJsonText) {
    throw new Error('[release] could not update the version in package.json')
  }
  return updated
}

function assertOnlyChanged(expected: Array<string>, step: string) {
  const changed = getStdout(['git', '-C', ROOT, 'diff', '--name-only']).split('\n').filter(Boolean)
  const unexpected = changed.filter((file) => !expected.includes(file))
  if (unexpected.length > 0) {
    console.error(`[release] ${step} modified unexpected files:`)
    console.error(unexpected.join('\n'))
    process.exit(1)
  }
}

// --- Assertions ---

function assertOnMain() {
  const branch = getStdout(['git', '-C', ROOT, 'branch', '--show-current'])
  if (branch !== 'main') {
    console.error(
      `[release] expected current branch to be "main", got "${branch || '(detached HEAD)'}"`,
    )
    console.error('[release] switch to main yourself before running release')
    process.exit(1)
  }
}

function assertCleanTree() {
  const status = getStdout(['git', '-C', ROOT, 'status', '--short'])
  if (status !== '') {
    console.error('[release] working tree must be clean before running release')
    console.error(status)
    process.exit(1)
  }
}

function assertUpstreamTracks() {
  let upstream: string
  try {
    upstream = getStdout([
      'git',
      '-C',
      ROOT,
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{u}',
    ])
  } catch {
    console.error('[release] main must track a remote branch before running release')
    console.error('[release] set upstream for main and re-run')
    process.exit(1)
  }
  if (upstream !== 'origin/main') {
    console.error(`[release] expected main to track "origin/main", got "${upstream}"`)
    console.error('[release] check out the correct branch/upstream and re-run')
    process.exit(1)
  }
}

function assertSyncedWithRemote() {
  const headSha = getStdout(['git', '-C', ROOT, 'rev-parse', 'HEAD'])
  const upstreamSha = getStdout(['git', '-C', ROOT, 'rev-parse', 'origin/main'])
  if (headSha !== upstreamSha) {
    console.error('[release] local main does not match origin/main')
    console.error('[release] sync main yourself before running release')
    process.exit(1)
  }
}

// --- Steps ---

// 1. Resolve version
const packageJsonText = await Bun.file(PACKAGE_JSON).text()
const currentVersion = parseVersion(packageJsonText)
const major = Number(currentVersion.split('.')[0])
const nextMajor = major + 1
const nextVersion = `${nextMajor}.0.0`
const tag = `v${nextMajor}`
const displayTitle = title === undefined ? tag : `${tag}: ${title}`

console.log(`[release] v${major} -> ${tag}`)
console.log(`[release] title: ${displayTitle}`)

// 2. Validate preconditions
assertOnMain()
assertCleanTree()
assertUpstreamTracks()
assertSyncedWithRemote()

// 3. Bump package.json
console.log(`[release] bumping version to ${nextVersion}`)
await Bun.write(PACKAGE_JSON, bumpVersion(packageJsonText, nextVersion))

// 4. Run fix
console.log('[release] running bun run fix')
await $`bun run --cwd ${ROOT} fix`
assertOnlyChanged(['apps/web/package.json'], 'fix')

// 5. Sync lockfile
console.log('[release] syncing bun.lock')
await $`bun install --lockfile-only --no-summary --cwd ${ROOT}`
assertOnlyChanged(['apps/web/package.json', 'bun.lock'], 'lockfile sync')

// 6. Commit
console.log(`[release] committing ${tag}`)
await $`git -C ${ROOT} add apps/web/package.json bun.lock`
await $`git -C ${ROOT} commit -m ${tag}`

// 7. Push & release
if (dryRun) {
  console.log('[release] dry run — skipping push and release')
  console.log(
    `[release] to publish: git push && gh release create ${tag} --generate-notes --title ${displayTitle} --target main`,
  )
  console.log('[release] to undo: git reset --hard HEAD~1')
  process.exit(0)
}

await $`git -C ${ROOT} push`
await $`gh release create ${tag} --generate-notes --title ${displayTitle} --target main`

console.log(`[release] done: https://github.com/deankerr/orca/releases/tag/${tag}`)
