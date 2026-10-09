# discord-sender

Ordered Discord webhook delivery for Convex. The host supplies serialized message
payloads, topics and deadlines. The component owns subscriptions, delivery,
message edits/deletes and queryable receipts. Host authentication, payload policy
and source-event provenance stay with the caller.

Mount `@orca/discord-sender/convex.config.js` with `app.use(...)`. Call the public
interface below through `components.discordSender.api` from host mutations and
queries. ORCA's ingestion policy lives in docs/orca/discord.md and docs/orca/config.md.

## Public API

### Webhooks and subscriptions

| Mutation/query                            | Result          | Contract                                                                                                                                        |
| ----------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `registerWebhook({ url, name?, topics })` | Webhook ID      | Registers a destination. Repeating an eligible canonical URL returns the original row unchanged. An invalidated URL gets a new registration ID. |
| `listWebhooks({})`                        | Webhook records | Includes invalidated registrations for inspection.                                                                                              |
| `setWebhookTopics({ webhookId, topics })` | `null`          | Replaces subscriptions on an eligible registration. Existing jobs remain unchanged.                                                             |
| `removeWebhook({ webhookId })`            | `null`          | Sets irreversible `invalidatedAt`. Keeps history and leaves active jobs running; queued jobs are cancelled when they try to start.              |

- URLs must use HTTPS `discord.com`. API-version paths are canonicalized; `thread_id` is retained.
- Topics are exact, case-sensitive strings. A registration can have several, or none.
- Invalidation gates admission and job start. Explicit cancellation controls active jobs.
- Discord errors `10015` (unknown webhook) and `50027` (invalid webhook token) invalidate registrations sharing the failed credentials. Other permanent API rejections fail their job without condemning the webhook.
- A missing registration has the same admission/start behavior as an invalidated one. Recovery rechecks eligibility when restarting unfinished jobs.

### Delivery and cancellation

| Mutation                                           | Result                   | Contract                                                                                                               |
| -------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `submitBatch({ topic, key, expiresAt, messages })` | `{ webhookId, jobId }[]` | Creates one ordered job per eligible subscriber. Unavailable recipients are silently skipped; no matches returns `[]`. |
| `cancelJob({ jobId })`                             | `null`                   | Finishes an open job as cancelled. Every terminal outcome and completion time is permanent.                            |

```ts
const recipients = await ctx.runMutation(components.discordSender.api.submitBatch, {
  topic: 'ingestion',
  key: 'scan:123:alerts:v1',
  expiresAt: deadline,
  messages: [
    { key: 'heading', payload: JSON.stringify({ content: 'Scan results' }) },
    { key: 'details', payload: JSON.stringify({ embeds: [embedBuilder.toJSON()] }) },
  ],
})
```

- `expiresAt` is an epoch-millisecond deadline. Batch/message keys must be nonempty; a batch contains at least one message with keys unique within it. Each `payload` is a serialized JSON object.
- Deduplication uses `(key, webhookId)`. Identical input returns the existing job; changed input conflicts. Preserve the deadline when retrying a submission. Intentional resends need a new key.
- Each submission resolves current subscriptions. Repeating a key can admit newly subscribed destinations. Admission is atomic across recipients: a conflicting eligible destination rolls back the submission.
- Jobs for the same Discord webhook run in submission order, with messages in array order. Thread destinations sharing that webhook share the same ordering. Different webhooks can progress concurrently.
- Expiry is checked before each HTTP attempt, including retries after SDK waits. An attempt started before expiry may finish afterward.
- Cancellation is checked between operations. A request already handed to the SDK can complete, including its waits/retries. Its receipt is retained even when cancellation has already finished the job.

### Message edits and deletes

| Mutation                                             | Result           | Contract                                                                                                                            |
| ---------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `editMessage({ resultId, key, expiresAt, payload })` | Job ID or `null` | Queues an edit using the target message and destination from a successful send/edit receipt.                                        |
| `deleteMessage({ resultId, key, expiresAt })`        | Job ID or `null` | Queues a deletion using a successful send/edit receipt. Discord's unknown-message response (`10008`) counts as successful deletion. |

- Both operations use the same ordering, deadlines and cancellation as sends. Their new jobs and receipts preserve the original records.
- An unavailable destination returns `null`. Malformed input, unsuitable receipts and conflicting keys for eligible destinations remain errors.
- `removeWebhook` removes a registration from use; it does not delete the webhook at Discord.

### Inspection and recovery

| Query/mutation                   | Result                 | Contract                                                                                                                             |
| -------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `getJob({ jobId })`              | Job or `null`          | Submitted input, destination and terminal outcome.                                                                                   |
| `listJobs({ from, to, limit? })` | `{ jobs, hasMore }`    | Submissions in epoch-millisecond window `[from, to)`, newest first. Default limit 25; maximum 100. Narrow the window when truncated. |
| `listResults({ jobId })`         | Ordered result records | Complete parsed Discord message responses, `null` for successful deletion, or terminal error status/code/message.                    |
| `resume({})`                     | `null`                 | Checks for unfinished work and queues a drain when needed. Terminal jobs remain closed.                                              |

- Discovery uses submission time, not source-event time. The host supplies provenance through its keys and payloads.
- Unsent suffixes have no result rows; the job outcome explains their termination. SDK retries have no individual receipt records.
- Stored receipts describe observed responses. They are not a live view of messages subsequently changed in Discord.

## Forums and threads

Discord's Execute Webhook contract requires forum/media destinations to receive
`thread_name` in the payload to create a post, or `thread_id` in the URL query to
send into an existing post. Reference: docs.discord.com/developers/resources/webhook.

| Intent                                             | Input                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Create a forum post                                | Register the forum webhook URL; submit a message containing `thread_name` and its initial content.           |
| Send an ordered batch into an existing post/thread | Register the webhook URL with `?thread_id=<id>` and submit to that registration's topic.                     |
| Edit/delete a sent message                         | Supply its result ID. Created-post receipts retain the thread route through Discord's returned `channel_id`. |

A batch does not automatically adopt a thread created by its first message.
Repeating `thread_name` creates separate posts; an ordinary follow-up without a
thread target cannot use the bare forum webhook. Creating a post and then filling
it requires two submissions: read the initial receipt, register its thread URL,
then submit the remaining messages there. Thread names, tags and lifecycle
management remain caller policy.

Live verification on 2026-10-09 against the private development forum covered post
creation, three ordered replies, editing the opener and a reply, and repeated
deletion of a reply. Direct Discord reads confirmed the edits and deletion. Media
channels use the same documented contract but were not exercised.

## Recovery and observability

- Workpool concurrency **1** is an ownership invariant. Separate webhook lanes share one `@discordjs/rest` client and its rate-limit state within an action.
- A permanent Discord rejection finishes its job as failed. Exhausted HTTP retries leave work unfinished and stop that webhook lane; other lanes finish before the action fails for Workpool retry.
- Progress-recording failures stop further work across lanes while outstanding requests attempt to checkpoint. Recovery continues from saved successful prefixes.
- A component-owned cron checks unfinished jobs every **five minutes**, including expired work and jobs left after Workpool exhausts its retries. `resume` requests the same recovery immediately.
- `console.warn` reports SDK rate-limit waits and first-time webhook invalidation, with IDs/cooldown metadata rather than credentials. Skips, ordinary completions and repeated invalidation remain silent. Execution errors propagate to Workpool.

## Known limitations

- An accepted Discord send whose response/checkpoint is lost can be repeated. Retrying uncertain outcomes is the chosen policy.
- SDK waits occupy the current drain and delay newly submitted jobs. Expiry prevents late transmission, but finalization can occur after the deadline.
- Rate-limit memory lasts for one action. Restarts can encounter the same limit again; coordination excludes other deployments/applications sharing an outbound IP.
- Jobs and the open-work snapshot must fit Convex document/transaction limits. Payloads are stored per destination job; discovery is intentionally sized for low volume.
- Delivery accepts JSON payloads. Multipart uploads, scheduled sending, source-time ordering, completion callbacks, Discord fetch operations, retention and a DLQ are outside the current scope. Full records are retained.

## Remaining decisions

None for the current scope. Automatic creation of one forum post per batch is deferred.
