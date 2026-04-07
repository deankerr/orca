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

const PackageJsonSchema = z.looseObject({
  version: z.string(),
})

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

// read current version from package.json
const pkg = PackageJsonSchema.parse(await Bun.file('package.json').json())
const current = Number(pkg.version.split('.')[0])
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
pkg.version = `${next}.0.0`
await Bun.write('package.json', `${JSON.stringify(pkg, null, 2)}\n`)

// commit the version bump
await $`git add package.json`
await $`git commit -m ${tag}`

// push the commit to main
await $`git push`

// create github release (also creates the git tag)
await $`gh release create ${tag} --generate-notes --title ${displayTitle} --target main`

console.log(`[release] done: https://github.com/deankerr/orca/releases/tag/${tag}`)
