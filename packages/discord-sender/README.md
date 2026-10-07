# discord-sender

A small Convex component for delivering an ordered batch of Discord messages to
multiple webhooks. This is the first implementation slice; it is not wired into
ORCA or the existing `discord-delivery` package.

## Ownership

The caller constructs payloads, chooses recipients and supplies a deadline. The
component stores those inputs once and records delivery attempts and responses.
Workpool owns queueing, dispatch, concurrency and completion callbacks.

The component owns three tables. Workpool and its dependencies have their own
isolated tables; the three-table constraint applies to our delivery model.

| Table        | Contents                                                              | Mutation policy                                 |
| ------------ | --------------------------------------------------------------------- | ----------------------------------------------- |
| `webhooks`   | Full URL and optional name                                            | Immutable registration; a new URL gets a new ID |
| `inputs`     | Batch key, ordered `{ key, payload }` messages, webhook IDs, deadline | Only `finishedAt` changes                       |
| `deliveries` | Input/webhook/message position, claim or outcome, HTTP response       | Append only                                     |

Each successful message has two ledger rows: a claim before HTTP and a success
referencing that claim. Outcomes retain status, headers, raw response body and
message/channel IDs when available. The original payload lives only in `inputs`;
Workpool jobs contain just input and webhook IDs.

## Use from a host app

Register the component when the app is ready to adopt it:

```ts
// convex/convex.config.ts
import discordSender from '@orca/discord-sender/convex.config.js'
import { defineApp } from 'convex/server'

const app = defineApp()
app.use(discordSender)
export default app
```

Call it from a host mutation. Authentication and recipient selection belong in
the host; component functions are not exposed directly to clients.

```ts
const webhookId = await ctx.runMutation(components.discordSender.api.registerWebhook, {
  name: 'Development',
  url: webhookUrl,
})

const inputId = await ctx.runMutation(components.discordSender.api.submitBatch, {
  key: 'scan:123:alerts:v1',
  webhookIds: [webhookId],
  expiresAt: Date.now() + 60_000,
  messages: [
    { key: 'heading', payload: JSON.stringify({ content: 'Scan results' }) },
    { key: 'details', payload: JSON.stringify({ embeds: [embedBuilder.toJSON()] }) },
  ],
})
```

`payload` is a serialized JSON object, compatible with discord.js builder output.
Message keys must be nonempty and unique within a batch. Repeating a batch key
with identical arguments returns the existing input ID without enqueueing again;
different arguments with that key are rejected. Use a new key to send again.

`registerWebhook` returns the existing ID for the same normalized URL and keeps
its original name. HTTP(S) receiver URLs are accepted, including custom endpoints
for development. Query parameters such as `thread_id` are preserved. Requests use
`wait=true` for receipts and `with_components=true` when the payload includes
components, following [Discord's execute-webhook contract](https://docs.discord.com/developers/resources/webhook#execute-webhook).

Inspect the immutable input with `api.getInput({ inputId })` and the ledger with
`api.listDeliveries({ inputId, webhookId? })`. The latter groups rows by webhook
and orders events within each webhook by creation time. Both are ordinary
queries, requiring no replay or external requests.

## Execution

```mermaid
sequenceDiagram
    participant App
    participant Submit as submitBatch mutation
    participant Pool as Workpool (5 jobs)
    participant Worker as One webhook action
    participant Ledger as deliveries
    participant Discord
    App->>Submit: ordered messages + recipients + deadline
    Submit->>Submit: persist one input
    loop each webhook, in the same transaction
        Submit->>Pool: enqueue {inputId, webhookId}
    end
    Pool->>Worker: dispatch when capacity is available
    Worker->>Ledger: load input and claim first message
    loop messages in order, while before deadline
        Worker->>Discord: POST with wait=true
        Discord-->>Worker: response
        Worker->>Ledger: record outcome and claim next message
    end
    Worker-->>Pool: return
    Pool->>Ledger: completion callback; finish input if all recipients terminal
```

For ten recipients, submission creates ten Workpool jobs. Up to five run across
this component instance at once. Each job drains one recipient's messages in
order; Workpool admits waiting jobs as slots become available. There are no
competing workers scanning for unclaimed recipients.

Each enqueue includes its own completion context, so submission uses
`enqueueAction` per recipient within one transaction. This allows a completion
callback to identify the recipient even when its action throws.

The action loads payloads once. Mutations read the current claim/outcome, then
append the result and next claim together. They use the action's cached immutable
deadline/message count rather than rereading the entire payload array for every
message. Concurrent claims are serialized by Convex transactions.

The deadline is checked before each new request. A request already in flight may
finish after the deadline. Expiry records the first unsent message position and
stops that recipient; later positions remain unsent. A non-2xx response or network
error similarly stops the recipient. Other recipients continue. An unexpected
action failure is recorded through Workpool's completion callback.

`finishedAt` means every recipient is terminal, including failures and expiry;
it does not mean every message succeeded. An empty recipient list finishes
immediately. Empty message lists are rejected.

## Deliberate limits of this slice

- Workpool action retries are disabled. HTTP errors, including 429, are recorded
  without retrying. Discord bucket/global cooldown handling remains to be built.
- Ordering holds within one input/webhook pair. Separate batches targeting the
  same webhook can overlap; cross-batch serialization remains to be built.
- There are no leases, watchdogs or separate recovery queues. Workpool owns the
  execution lifecycle. The ledger guard prevents another worker from sending an
  already claimed message; reclaiming abandoned claims is not implemented.
- Receipts provide data for future message fetch/edit/delete operations; those
  operations are not implemented. A lost response can leave no receipt.
- Inputs and query results must fit ordinary Convex transaction/document limits.
  There is no pagination, retention, payload cleanup, multipart upload or DLQ.

## Decisions before integration

These are discussion points, not additional requirements for this first slice.

- **Finding and interpreting history.** The current queries require an input ID;
  the host must retain it. The original "find malformed alerts early this morning"
  workflow needs discovery by time, batch/message key, recipient and outcome.
  Decide whether time means source-event time, submission time or delivery time;
  historical ingestions make those different. Recommend bounded inspection queries
  that also derive message outcomes, including the unsent suffix after failure or
  expiry, so each caller does not have to interpret the ledger independently.
- **Scheduling historical work.** `expiresAt` is a cutoff, not a not-before time
  or ordering priority. Jobs are eligible immediately. The host can already derive
  expiry from `scan_at` to discard stale backfills. A future `sendAt` needs a clear
  choice between scheduling, source-time ordering, or both; recipient concurrency
  alone provides neither cross-batch order nor a globally consecutive broadcast.
- **Idempotency and changing recipients.** A batch key is unique across the component
  instance. Identity comparison includes the exact deadline, recipient order,
  message order, keys and payload strings. Use a stable deadline when retrying a
  submission; recomputing `Date.now() + TTL` with the same key conflicts. Recipients
  are a submission-time snapshot, including an empty list, which still reserves
  the key. Adding subscribers to an existing broadcast needs an explicit operation
  if the original payload is to remain stored once. Submitting under a new key sends
  again to every included recipient. All recipients share one payload array and
  deadline; personalized content or expiry currently requires separate inputs.
  Keep exact-match idempotency for now; decide
  separately whether recipient order should matter and whether later fan-out is needed.
- **Webhook lifecycle and ownership.** Registration currently deduplicates by full
  normalized URL. There is no list/get, rename, disable, unsubscribe or token-rotation
  interface. Permanent HTTP failures stop only that input's recipient; future inputs
  can still target the URL. Decide how disabling or rotating a webhook affects
  already queued work while preserving the destination needed to manage old receipts.
  Subscription ownership, allowed receiver URLs and permission to inspect payloads
  belong in host wrappers; the component accepts custom HTTP(S) receivers and has
  no tenant identity.
- **Operator controls and completion.** There is no pause, cancellation or targeted
  retry interface, and the host receives no completion callback. Reusing a finished
  input's key does not restart it; a fresh submission may duplicate its successful
  prefix. Decide whether operators need to resume only failed/unsent work, and
  whether reactive queries are sufficient for completion or a host callback is
  useful. Use Workpool's facilities for execution control rather than introducing
  a second scheduler. Any pause/cancel contract must distinguish pending work from
  HTTP requests already in flight.
- **Payload and receipt guarantees.** Validation checks JSON-object shape, not
  Discord's content limits or card semantics. The host owns construction, batching,
  filtering and mention policy. `succeeded` means HTTP 2xx; a custom receiver or an
  unreadable response body can leave no usable message ID. Future message management
  should expose that distinction and preserve thread routing from the URL/receipt.
  The ledger explains accepted work only: source-event links, filtered alerts,
  rendering failures and reasons for never submitting a batch need host provenance.
  Development rerendering can use a fresh key and deadline through a host-only action,
  without changing the production delivery history.

The existing `discord-delivery` package already has scheduled ordering, pause,
destination disabling/repair, message management, time-filtered inspection and
dead-letter delivery. Those are capabilities to evaluate before replacing it,
not a reason to carry over its control tables or recovery machinery.

## Validation

From the repository root:

```sh
bun test packages/discord-sender
bun run fix
```

The tests run the real Workpool and its Batch Worker dependency in `convex-test`
under Bun, with HTTP mocked at `fetch`. They exercise the full scheduling path,
ordered sends, persisted claims, receipts, deadlines and terminal failures.
