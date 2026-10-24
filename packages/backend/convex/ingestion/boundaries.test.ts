import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

const CONVEX_DIR = path.join(import.meta.dirname, '..')

/** Modules that may name the shared queue schedule: its owner, and the table definition and schema. */
const ALLOWED = new Set(['ingestion/queue.ts', 'ingestion/tables.ts', 'schema.ts'])

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      return entry.name === '_generated' ? [] : sources(file)
    }
    return entry.name.endsWith('.ts') && !/\.(?:test|testing)\.ts$/u.test(entry.name) ? [file] : []
  })
}

// Every transaction that touches the schedule document conflicts with every other that does.
// Only `wake` may, so completions and other writers stay free of its contention (PRs #203, #215);
// they schedule `wake` instead of reading or writing the document.
test('only the queue module touches the shared queue schedule', () => {
  const offenders = sources(CONVEX_DIR)
    .map((file) => path.relative(CONVEX_DIR, file))
    .filter((file) => !ALLOWED.has(file))
    .filter((file) =>
      /QUEUE_SCHEDULE_TABLE|ingestion_queue_schedule|queueScheduleTable/u.test(
        readFileSync(path.join(CONVEX_DIR, file), 'utf-8'),
      ),
    )

  expect(offenders).toEqual([])
})
