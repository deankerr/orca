# discord-sender

A small Convex component for delivering an ordered batch of Discord messages to
multiple webhooks. It remains independent of ORCA and the existing
`discord-delivery` package.

## Contract

The caller constructs serialized JSON payloads, chooses a snapshot of recipient
webhook IDs, and supplies a deadline. The component owns delivery and inspection;
Workpool owns execution, dispatch, concurrency and completion callbacks.

- Messages stay ordered within each input/webhook pair. Separate inputs may
  interleave at the same webhook; avoiding unwanted overlap is the caller's responsibility.
- Each recipient progresses independently. Permanent rejection stops its remaining
  messages. Other recipients continue.
- Network errors, 429 and 5xx retry the current message until the deadline.
  An ambiguous response can therefore produce a duplicate Discord message.
- The deadline is checked before every request. An in-flight request may finish
  afterward; the successful prefix remains if the remainder expires.
- HTTP 2xx means delivery succeeded. A usable Discord message ID is optional,
  particularly with custom receivers or an unreadable response body.
- `finishedAt` means every recipient is terminal, including failed, expired and
  canceled deliveries. An empty recipient list finishes immediately and reserves
  its batch key; empty message lists are rejected.

The component still owns three tables. Workpool and its dependencies own their
execution tables separately.

| Table        | Contents                                             | Mutation policy           |
| ------------ | ---------------------------------------------------- | ------------------------- |
| `webhooks`   | Full normalized URL and optional name                | Immutable registration    |
| `inputs`     | Batch key, ordered messages, recipient IDs, deadline | Only `finishedAt` changes |
| `deliveries` | Scheduling, claims, responses and terminal outcomes  | Append only               |

Payloads live once in `inputs`; execution jobs and ledger records carry references.
Every HTTP attempt has a preceding claim and a linked outcome. Workpool IDs remain
in the ledger so execution can be inspected without storing a second mutable task state.

## Host interface

Register the component in the host app:

```ts
// convex/convex.config.ts
import discordSender from '@orca/discord-sender/convex.config.js'
import { defineApp } from 'convex/server'

const app = defineApp()
app.use(discordSender)
export default app
```

Call it from a host mutation. Authentication, subscription ownership, receiver URL
permissions and source-event provenance belong in the host wrappers.

```ts
const webhookId = await ctx.runMutation(components.discordSender.api.registerWebhook, {
  name: 'Development',
  url: webhookUrl,
})

const inputId = await ctx.runMutation(components.discordSender.api.submitBatch, {
  key: 'scan:123:alerts:v1',
  webhookIds: [webhookId],
  expiresAt: deadline,
  messages: [
    { key: 'heading', payload: JSON.stringify({ content: 'Scan results' }) },
    { key: 'details', payload: JSON.stringify({ embeds: [embedBuilder.toJSON()] }) },
  ],
})
```

`payload` preserves the exact serialized JSON object, including discord.js builder
output. The caller owns Discord content limits, card construction and mention policy.
Message keys must be nonempty and unique within the batch.

A batch key is unique across the component instance. Repeating it with identical
arguments returns the existing input ID. Any changed argument conflicts, including
recipient order, payload bytes or deadline. Submission retries must reuse the
original deadline; development rerenders use a fresh key and deadline.

`registerWebhook` accepts HTTP(S), including custom development receivers. The same
normalized full URL returns the original ID and name. Thread query parameters are
preserved; execution sets `wait=true` and enables `with_components` when needed.
Different query strings can identify destinations sharing one Discord webhook.

Inspection and pending cancellation:

- `getInput({ inputId })`: original submission and completion timestamp.
- `listInputs({ from, to, limit? })`: newest submissions in the half-open time
  window `[from, to)`, with full inputs and `hasMore`. Default limit 25, maximum 100.
  Time is submission time, independent of historical source-event timestamps.
  Narrow the window when truncated; this is bounded discovery, not an export API.
- `listDeliveries({ inputId, webhookId? })`: raw ledger, grouped by recipient and
  chronological within each recipient, including original responses and receipts.
- `getStatus({ inputId })`: recipient delivery states, successful counts, first
  unsent positions, `scheduledAt` wake times and current Workpool execution states.
  A wake time may resume the next message or record deadline expiry, not just retry
  a failed request. An execution being finished does not imply successful delivery.
  Summaries read only each recipient’s latest ledger entry: ordered delivery makes
  its message index sufficient to identify the successful prefix.
- `cancelPendingDelivery({ inputId, webhookId })`: cancels a pending recipient job,
  including a delayed retry. Returns false for running, terminal or missing work.
  Running work cannot currently be revoked; unsubscribe affects future submissions.

## Retry decisions

Workpool admits up to five recipient jobs across the instance. Each action drains
its recipient until completion, permanent rejection, expiry, or a required wait.
A wait records the result and enqueues a delayed continuation atomically, releasing
its slot. The continuation resumes the same message after failure, or the next
message after a successful exhausted-bucket response.

Retry scheduling follows Discord's `Retry-After`/`retry_after` durations. Network
and server errors use exponential backoff from one second to sixty seconds; 429
waits have a one-second minimum. Successful responses reporting an exhausted bucket
and `X-RateLimit-Reset-After` defer the next message. The deadline bounds every wait.
These are scheduling defaults, not assumptions about Discord's fixed rate limits.

Automatic whole-action retries are disabled: retry decisions need the response's
specific delay and the ledger's message position. Workpool still schedules and
executes every continuation. Unexpected action exceptions currently stop the recipient.

Protocol reference: https://docs.discord.com/developers/topics/rate-limits

## Open design questions

Local comments identify the corresponding decisions beside their implementation.

- Shared/global cooldown coordination remains open. This iteration observes hints
  within one recipient chain; other chains can continue and encounter their own
  429s. Full URLs, thread destinations and Discord bucket identities are different.
  A shared gate needs an explicit scope, including the treatment of custom hosts.
- Discord advises stopping use of a webhook after 404. This iteration stops the
  current recipient batch; deciding how permanent rejection disables a destination
  for future submissions remains part of webhook lifecycle design.
- Webhook rename, disable, rotation and immediate unsubscribe are deferred. Rotation
  must preserve the original destination needed to manage historical receipts.
- Running cancellation and targeted operator retry are deferred. A running job can
  enqueue a new continuation, so canceling its old Workpool ID alone is insufficient.
  Resubmitting under a new key can resend an already successful prefix.
- Workpool handles execution failures, but resuming an interrupted action with an
  unresolved claim needs a deliberate delivery policy. No additional watchdog or
  recovery queue exists in this iteration.
- Message fetch/edit/delete are deferred. Preserve original receipts and payloads;
  future edits should have their own ledger entries.
- Future scheduling, source-time ordering, later fan-out, personalized payloads,
  host completion callbacks, retention, multipart uploads and DLQ remain optional.
- Inputs and inspection results must fit Convex document/transaction limits.
  Full payload discovery and full ledger reads suit current small batches; larger
  histories may warrant metadata-only discovery and pagination.

The existing `discord-delivery` package has additional operator and integration
features. Evaluate them individually before replacing it. ORCA mounts this component
alongside the existing sender for development; its alert producers still use the
existing component.

## Validation

```sh
bun test packages/discord-sender
bun run fix packages/discord-sender
```

Tests use real Workpool and its Batch Worker dependency under `convex-test`, with
HTTP mocked at `fetch`. They exercise scheduling, ordered delivery, retry
continuations, deadline cutoffs, pending cancellation, receipts and inspection.
