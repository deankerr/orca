#!/usr/bin/env bun
/**
 * Create a new release with auto-incremented version.
 *
 * Usage:
 *   bun scripts/release.ts                    # auto-increment, deploy
 *   bun scripts/release.ts "table perf"       # with a title/summary
 *   bun scripts/release.ts --dry-run          # preview without creating
 */
import { $ } from 'bun'
import { z } from 'zod'

const PackageVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/)
const PackageJsonSchema = z.looseObject({
  version: PackageVersionSchema,
})
const packageJsonVersionPattern = /^(\s*"version":\s*")([^"]+)(".*)$/m

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const title = args.find((a) => !a.startsWith('--'))
const textDecoder = new TextDecoder()

function getStdout(command: Array<string>) {
  const result = Bun.spawnSync({
    cmd: command,
    stderr: 'pipe',
    stdout: 'pipe',
  })

  if (result.exitCode !== 0) {
    throw new Error(textDecoder.decode(result.stderr).trim())
  }

  return textDecoder.decode(result.stdout).trim()
}

function failIfReleasePreconditionsNotMet() {
  const branch = getStdout(['git', 'branch', '--show-current'])
  if (branch !== 'main') {
    console.error(
      `[release] expected current branch to be "main", got "${branch || '(detached HEAD)'}"`,
    )
    console.error('[release] switch to main yourself before running release')
    process.exit(1)
  }

  const status = getStdout(['git', 'status', '--short'])
  if (status !== '') {
    console.error('[release] working tree must be clean before running release')
    console.error(status)
    process.exit(1)
  }

  let upstream = ''
  try {
    upstream = getStdout(['git', 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
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

  const headSha = getStdout(['git', 'rev-parse', 'HEAD'])
  const upstreamSha = getStdout(['git', 'rev-parse', 'origin/main'])
  if (headSha !== upstreamSha) {
    console.error('[release] local main does not match origin/main')
    console.error('[release] sync main yourself before running release')
    process.exit(1)
  }
}

function failIfUnexpectedFilesChanged(expectedChangedFiles: Array<string>) {
  const changedFiles = getStdout(['git', 'diff', '--name-only']).split('\n').filter(Boolean)
  const unexpectedFiles = changedFiles.filter((file) => !expectedChangedFiles.includes(file))

  if (unexpectedFiles.length > 0) {
    console.error('[release] bun run fix modified unexpected files')
    console.error(unexpectedFiles.join('\n'))
    process.exit(1)
  }
}

function getCurrentVersion(packageJsonText: string) {
  const packageJson = PackageJsonSchema.parse(JSON.parse(packageJsonText))
  return PackageVersionSchema.parse(packageJson.version)
}

function replacePackageVersion(packageJsonText: string, nextVersion: string) {
  const nextPackageJsonText = packageJsonText.replace(
    packageJsonVersionPattern,
    `$1${nextVersion}$3`,
  )

  if (nextPackageJsonText === packageJsonText) {
    throw new Error('[release] could not update the version in package.json')
  }

  return nextPackageJsonText
}

// read current version from package.json
const packageJsonPath = 'package.json'
const packageJsonText = await Bun.file(packageJsonPath).text()
const currentVersion = getCurrentVersion(packageJsonText)
const current = Number(currentVersion.split('.')[0])
const next = current + 1
const tag = `v${next}`
const displayTitle = title === undefined ? tag : `${tag}: ${title}`

console.log(`[release] v${current} -> ${tag}`)
console.log(`[release] title: ${displayTitle}`)

failIfReleasePreconditionsNotMet()

if (dryRun) {
  console.log('[release] dry run, stopping here')
  process.exit(0)
}

// bump version in package.json
const nextVersion = `${next}.0.0`
const nextPackageJsonText = replacePackageVersion(packageJsonText, nextVersion)
await Bun.write(packageJsonPath, nextPackageJsonText)

console.log('[release] running bun run fix')
await $`bun run --cwd ../.. fix`
failIfUnexpectedFilesChanged(['apps/web/package.json'])

// commit the version bump
await $`git add ${packageJsonPath}`
await $`git commit -m ${tag}`

// push the commit to main
await $`git push`

// create github release (also creates the git tag)
await $`gh release create ${tag} --generate-notes --title ${displayTitle} --target main`

console.log(`[release] done: https://github.com/deankerr/orca/releases/tag/${tag}`)
