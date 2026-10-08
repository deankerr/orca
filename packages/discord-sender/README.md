# discord-sender

A Convex component that sends an ordered batch of Discord messages to one webhook.
Callers own payload construction and choose the destination and deadline. The
component owns delivery, rate-limit scheduling and durable terminal receipts.
ORCA currently mounts it for development; its alert producers still use
`discord-delivery`.

## Contract

- A job owns one webhook and an immutable ordered array of serialized payloads.
  The caller can submit separate jobs for multiple destinations.
- Workpool admits one sending action across the component. The action keeps
  sending its selected job until it finishes or must wait, then selects the oldest
  eligible job. Jobs can interleave when one waits; each job's messages stay ordered.
- Before every attempt, an expired job is finalized and removed from active work.
  A request that began before the deadline may complete afterward. Its terminal
  response is saved; expiry cuts off only the unfinished suffix.
- Network errors, 429 and 5xx retry until the deadline. An ambiguous response may
  produce a duplicate Discord message. Permanent rejection stops that job.
- HTTP 2xx is success even when Discord's message ID or response body is unavailable.
  Available message/channel IDs, status, headers and body are retained with the
  terminal result. Transient responses go to logs.
- Payloads live once per job. Terminal results reference message keys. The retry
  count belongs to the current unfinished message and resets after success;
  there is no persistent attempt history or pre-attempt task record.
- `finishedAt` and `outcome` distinguish completion, rejection and expiry.
  Results describe messages with a terminal response. Missing results in a finished
  job are its unsent suffix, not missing audit events.

Workpool's concurrency limit is an invariant. Raising it requires redesigning
ownership and shared-state reads. It is not a performance tuning option.

## Host interface

Mount `@orca/discord-sender/convex.config.js` with `app.use(...)`, then call it from
host mutations. Authentication, subscription ownership, receiver URL permissions,
card construction, mentions and source-event provenance belong to the host.

```ts
const webhookId = await ctx.runMutation(components.discordSender.api.registerWebhook, {
  name: 'Development',
  url: webhookUrl,
})

const jobId = await ctx.runMutation(components.discordSender.api.submitBatch, {
  key: 'scan:123:alerts:development:v1',
  webhookId,
  expiresAt: deadline,
  messages: [
    { key: 'heading', payload: JSON.stringify({ content: 'Scan results' }) },
    { key: 'details', payload: JSON.stringify({ embeds: [embedBuilder.toJSON()] }) },
  ],
})
```

Message keys are nonempty and unique within the job. Payloads must be serialized
JSON objects; their exact bytes are preserved. Empty message arrays are rejected.

The job key is unique across the component instance. Identical repeated submissions
return the existing job ID. Changed payloads, message order, destination or deadline
conflict. Submission retries reuse the original deadline; development rerenders use
a fresh key and deadline. Fan-out needs a distinct job key per destination.

Registration accepts HTTP(S), including custom development receivers. The same
normalized full URL returns the original ID and name. Thread query parameters are
preserved; requests set `wait=true` and enable `with_components` when needed.

Inspection and recovery:

- `getJob({ jobId })` returns the input and operational checkpoint.
- `listResults({ jobId })` returns terminal message responses in sending order.
- `listJobs({ from, to, limit? })` discovers submissions in `[from, to)`, newest first,
  including payloads. Default limit 25, maximum 100; `hasMore` indicates that the
  agent should narrow its window. Time means submission time, not source-event time.
- `resume({})` wakes the sender after an operator fixes an execution error. It
  preserves successful prefixes and leaves terminal jobs closed.

## Scheduling decisions

The component owns `webhooks`, `jobs`, `results`, and a singleton `sender` table.
The singleton stores shared cooldowns and the next scheduled wake. It is scheduling
state, not a worker lock. Workpool and its dependencies own their execution tables.

Discord's `Retry-After`/`retry_after` durations govern 429 waits, with a one-second
minimum. Network/server failures back off from one to sixty seconds. An exhausted
bucket response defers every job sharing that webhook resource, including thread
URL variants. A global 429 gates the whole component. Different custom receiver
paths have separate resource gates, but a custom global response also gates the
whole component; this is deliberately conservative.

A waiting action returns instead of sleeping. One scheduled mutation hands the
next drain to Workpool at the earliest readiness or expiry time. Submissions can
bring that wake forward. If a submission arrives during a drain, another queued
drain picks it up afterward. The action yields after 25 minutes of continuous work.
HTTP requests have a 20-second timeout.

Unexpected action failures use Workpool's retry policy. Each new execution derives
the successful prefix from the latest terminal result. Persistent execution errors
can exhaust those retries and leave jobs open; use logs and `resume` after fixing
the cause. There is no secondary recovery cron. HTTP failures use the component's
response-specific scheduling and do not consume Workpool execution retries.

Protocol reference: https://docs.discord.com/developers/topics/rate-limits

State transitions and their invariants are documented beside the code that performs
them. The HTTP transport and protocol classification depend on neither the database
schema nor Workpool.

## Remaining decisions

- Global coordination covers this component instance, not other applications or
  deployments sharing Discord's unauthenticated IP limit. Webhook keys currently
  strip query parameters but do not normalize Discord host/API-version aliases or
  coordinate different webhook tokens that Discord reports as a shared bucket.
- A permanent rejection ends the current job. Destination disable/rotation and
  Discord's advice to stop using a webhook after 404 still need lifecycle policy.
- Cancellation, per-job execution dashboards, targeted operator retry, completion
  callbacks, fetch/edit/delete and retention remain deferred. Original receipts
  and immutable destinations retain the information needed for message management.
- Each job and the active snapshot must fit Convex document/transaction limits.
  Payload sharing across destinations and paginated worker discovery should be
  justified by actual volume before adding another storage layer.
- Scheduled sending, source-time ordering, multipart uploads and a DLQ remain
  optional. `availableAt` is currently an internal retry checkpoint.

## Validation

```sh
bun test packages/discord-sender
bun run fix packages/discord-sender
```

Tests use real Workpool and its Batch Worker dependency under `convex-test`, with
HTTP mocked. They exercise serialization, job switching, cooldowns, expiry, wake-up
handoffs, action recovery and durable receipts.
