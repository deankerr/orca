# One-time production backfill

> **Overrides normal guarantees until completion.** The main V4 guide describes routine
> operation. During this backfill, declared pairs record replay progress, **not a complete
> Catalog**. Catalog deliberately contains only accumulated departures until the final
> sweep. Module cursors still track their own committed output, but do not establish
> overall serving readiness. Keep V4 serving and all other ingestion loops stopped until
> finalization succeeds. Routine cron admission remains disabled until manually enabled.

This is temporary production bootstrap tooling, isolated in
`packages/backend/convex/v4/backfill.ts`. Retire it by deleting that file, this document
and the override notice in `README.md`, then regenerating Convex bindings.

## Operation

- Start on empty production V4 tables with the shared artifact backlog available.
- Run `v4/backfill:run` with `{}` instead of normal Catalog initialization. Select the
  production deployment explicitly; run one chain only.
- Each action loads one new pair, writes Catalog departures, then uses the regular
  Pricing and Listings processors. Their output and cursors commit together as usual.
- Stats history stays dormant. Current stats is populated from the final artifact.
- Each completed pair schedules the next action. No more artifacts triggers finalization.
- After confirming completion, enable routine cron admission manually.

## Recovery and finalization

Replay progress is resumable through existing declared pairs and module cursors. Rerunning
after a failure finishes outstanding history work before moving on; committed history
steps are skipped.

**The final Catalog sweep is deliberately non-routine and non-resumable.** It has no saved
table or batch position. It writes the head artifact in batches of 200 rows, separately
for each Catalog table, to stay within mutation limits. These commits are not collectively
atomic. A failure can leave partial Catalog writes; rerun the entire sweep from the
beginning. Identity-based replacement makes those writes repeatable.

After the sweep, the current-stats processor loads readings from the final artifact and
advances its cursor. If another artifact appeared during finalization, the chain continues.
Completion is logged only when no next pair remains.

## Dev rehearsal evidence

2026-09-25: wiped V4 tables and replayed 25 artifacts spanning
2026-09-15T05:40:04.053Z–2026-09-16T05:40:04.224Z. The 24-pair replay completed;
the whole-table endpoint sweep timed out. After bounding sweep mutations to 200 rows,
rerunning completed finalization without replaying history.

Compared every row against the saved routine-ingestion state, excluding Convex system
fields and Catalog `scan_at`: all nine tables matched. Only three model `scan_at`
values differed. All three module cursors reached head; all 1,152 current-stats rows
matched exactly, and stats history remained empty.
