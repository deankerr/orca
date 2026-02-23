#!/usr/bin/env bun
/**
 * Create a new release with auto-incremented version and generated notes.
 *
 * Usage:
 *   bun scripts/release.ts                    # auto-increment, auto-generate notes
 *   bun scripts/release.ts "table perf"       # with a title/summary
 *   bun scripts/release.ts --dry-run          # preview without creating
 */
import { $ } from 'bun'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const title = args.find((a) => !a.startsWith('--'))

// get the latest version tag number, default to 0
const tags = await $`git tag -l "v*"`.text()
const latest = tags
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((t) => Number(t.replace('v', '')))
  .sort((a, b) => a - b)
  .pop() ?? 0

const next = `v${latest + 1}`
const displayTitle = title ? `${next}: ${title}` : next

console.log(`[release] ${latest === 0 ? 'first release' : `v${latest}`} -> ${next}`)
console.log(`[release] title: ${displayTitle}`)

if (dryRun) {
  console.log('[release] dry run, stopping here')
  process.exit(0)
}

// create github release (also creates the git tag)
await $`gh release create ${next} --generate-notes --title ${displayTitle} --target main`

console.log(`[release] done: https://github.com/deankerr/orca/releases/tag/${next}`)
