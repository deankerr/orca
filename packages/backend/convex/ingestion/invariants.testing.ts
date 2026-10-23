import { expect } from 'vitest'

import type { Harness } from '../harness.testing'
import { ingestors } from './ingestors'
import { pool } from './pool'
import { recordCounts } from './records'
import { INGESTION_RECORDS_TABLE, PROCESS_COMMITS_TABLE, recordKind, recordState } from './tables'

/**
 * Properties that hold whenever scheduled work has drained, whatever path led there. Serial
 * tests rarely notice drift or lost callbacks on their own, so integration tests end here.
 * Pass `receipts: false` for records seeded as complete without running their ingestors.
 */
export async function expectIngestionInvariants(t: Harness, { receipts = true } = {}) {
  await t.run(async (ctx) => {
    const all = await ctx.db.query(INGESTION_RECORDS_TABLE).collect()

    // The aggregate counts exactly the records in each kind and state.
    const keys = recordKind.members.flatMap((kind) =>
      recordState.members.map((state) => [kind.value, state.value] as const),
    )
    const totals = await recordCounts.countBatch(
      ctx,
      keys.map((namespace) => ({ namespace: [...namespace] })),
    )
    expect(Object.fromEntries(keys.map((key, index) => [key.join('/'), totals[index]]))).toEqual(
      Object.fromEntries(
        keys.map((key) => [
          key.join('/'),
          all.filter(({ kind, state }) => kind === key[0] && state === key[1]).length,
        ]),
      ),
    )

    // Accepted records have live work; finished work with an unsettled record is a lost completion.
    for (const record of all.filter(({ state }) => state === 'queued' || state === 'withdrawing')) {
      expect(
        record.work_id,
        `${record.state} record at ${record.scan_at} has no work`,
      ).toBeDefined()
      if (record.work_id !== undefined) {
        const status = await pool().status(ctx, record.work_id)
        expect(status.state, `${record.state} record at ${record.scan_at} is stuck`).not.toBe(
          'finished',
        )
      }
    }

    // A complete record has every ingestor's receipt for its scan.
    if (receipts) {
      const committed = await ctx.db.query(PROCESS_COMMITS_TABLE).collect()
      for (const { scan_at } of all.filter(({ state }) => state === 'complete')) {
        const processes = committed
          .filter((row) => row.scan_at === scan_at)
          .map((row) => row.process)
        expect(processes.toSorted(), `receipts at ${scan_at}`).toEqual(
          ingestors.map(({ process }) => process).toSorted(),
        )
      }
    }
  })
}
