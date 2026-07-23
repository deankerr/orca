# Alchemy issues (capture worker)

Status: observed 2026-07-23 on `alchemy@2.0.0-beta.63`, worker `orcacapture-worker-dev-dean-*`
(stage `dev_dean`). Captures are **not** affected — every instance completes with a full pass
(425 targets, all 200s, summary written). These are harness-level noise/bugs, pending Dean's own
investigation before we act.

## 1. Every workflow run emits a spurious `outcome: exception` event

**Symptom.** One `eventType: workflow` / `outcome: exception` observability event per cron tick,
seconds after `capture started`, with no cause logged (`tapCause(logError)` never fires). The
instance then completes normally — `instance.status()` reports `complete` with correct output.

**Mechanism.** `WorkflowBridge.run()` runs the body via `Effect.runPromiseExit` and ends with
`throw Cause.squash(exit.cause)` on failure. Cloudflare's workflow engine aborts invocations as
control flow (hibernation between checkpoints, pause, retry scheduling) by rejecting the
in-flight promise; the bridge's callback-only `Effect.tryPromise` wraps that rejection into
`Cause.UnknownError` and rethrows it, so the runtime records the invocation as an exception. A
later invocation replays from checkpoints and completes.

**Upstream.** Same adapter defect as
[alchemy-run/alchemy#930](https://github.com/alchemy-run/alchemy/issues/930) (reported for
`pause` becoming `errored`). Open as of beta.64; upgrading doesn't help yet. Source:
`src/Cloudflare/Workflows/WorkflowBridge.ts` (`tryPromise` wrappers ~154, rethrow ~103).

**Impact on us.** Error-level observability events are untrustworthy for alerting — a real
workflow failure looks identical at the event level. Distinguish via logs (we should log the
pass summary from inside the workflow) or `instance.status()`.

## 2. "An RPC result was not disposed properly" warning on every `create()`

**Symptom.** One warning per cron tick, ~15s after instance creation.

**Mechanism.** `wrapInstance` in `src/Cloudflare/Workflows/Workflow.ts` wraps the native RPC
stub returned by `binding.create()` / `get()` but never calls `dispose()` on it.

**Upstream.** No existing issue found (searched "disposed", "workflow", "cron", "exception",
"outcome" in alchemy-run/alchemy). Candidate for us to file.

## Related

- [alchemy-run/alchemy#522](https://github.com/alchemy-run/alchemy/issues/522) — workflow names
  not stage-scoped; recreates are destructive. Explains why the worker gets a fresh random
  suffix on delete/recreate deploys (12:11 on 2026-07-23), orphaning the previous service's log
  history in observability.

## Debugging fast paths

- Logs: `bunx alchemy logs --since 90m` (from `apps/capture`).
- Instance status: `GET https://<worker>.dean-kerr.workers.dev/capture/<instanceId>`.
- Worker URL: `bunx alchemy state get --stack OrcaCapture --stage dev_dean --fqn Worker`.
- The observability dataset's workflow exception events carry no cause; the Cloudflare
  dashboard's workflow step view is the only place step-level errors surface.
