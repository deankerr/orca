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

// read current version from package.json
const pkg = PackageJsonSchema.parse(await Bun.file('package.json').json())
const current = Number(pkg.version.split('.')[0])
const next = current + 1
const tag = `v${next}`
const displayTitle = title === undefined ? tag : `${tag}: ${title}`

console.log(`[release] v${current} -> ${tag}`)
console.log(`[release] title: ${displayTitle}`)

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
