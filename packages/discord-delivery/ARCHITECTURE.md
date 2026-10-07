# Discord delivery architecture

## Persistent work and single ownership

One Batch Worker named `delivery` drives the whole component. Its query requests another
iteration or an idle timeout. Its mutation re-reads current records before making any
transition, because Batch Worker fetches from a snapshot that can be stale.

The mutation is the sole owner of progression. An action performs one HTTP attempt and
commits its response as a result record. It never advances a group, selects another
message or retries itself. That separates the external side effect from queue control.

| Records      | Ownership and reason                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| Destinations | Operator-managed keys, URLs and invalid-destination state.                               |
| Groups       | Accepted destination snapshot, identity, send time, expiry and retry policy.             |
| Messages     | Immutable ordered payloads or management requests, separate from hot state.              |
| Tasks        | Mutable group cursor, retry counter, next eligible time and terminal outcome.            |
| Attempts     | One scheduled request with its claim/schedule time and scheduled-function ID.            |
| Results      | Immutable HTTP status, headers, body and parsed receipt; uncertain recovery is explicit. |
| Control      | Global active task/attempt, pause and cooldown.                                          |

Submission writes the group, individual messages and task, then pings Batch Worker in
one transaction. Uniqueness is checked through destination/sendAt/key index reads in
that transaction. Concurrent identical submissions serialize and return one group.
Different content under an existing identity fails instead of silently losing work.

## Scheduling and order

Select the earliest queued task when no group is active. `sendAt` is both the ordering
value and a not-before time. Once active, its remaining messages and retries hold the
sender until that group succeeds, expires or fails. This permits deliberate head-of-line
blocking: header/body/footer sequences stay together across all destinations.

Only one scheduled request is active. Result consumption happens before choosing the
next request. An HTTP response has completed before its result is committed, so the
next request can start even if the previous action is finishing its bookkeeping.

Ordering covers accepted work available at selection time. No queue can insert a newly
submitted historical message ahead of a message already sent. A producer needing full
historical ordering must enqueue in order, or pause while submitting the complete set.

## Failure and recovery

- 2xx records success and advances the cursor. Raw request and response remain distinct.
  If reading the body fails after headers arrive, retain the status and headers: confirmed
  acceptance still succeeds, while a 429 still supplies its cooldown. Missing receipt IDs
  prevent management of that message but do not cause a duplicate send.
- Network failures and 5xx retry with bounded exponential backoff. Discord may already
  have accepted an uncertain request; retries deliberately permit duplicates.
- 429 waits at least the supplied delay and holds the global sender. Successful responses
  with an exhausted bucket also establish a cooldown. 429 attempts consume the configured
  retry budget. Invalid delays outside the supported timestamp domain are ignored; valid
  long waits are honored through bounded scheduler sleeps.
- Permanent failures terminate the group. Earlier successful messages remain successful;
  the failing message and remaining unsent messages retain their records.
- Execute-webhook 401/403/404 disables that destination URL for subsequent groups until
  registration repairs it. A message-management 404 does not disable the webhook.
- Expiry stops attempts that have not begun. A success reported after expiry stays a
  success; subsequent messages may expire. A request preflight checks pause and expiry
  again because scheduling can be delayed.
- Without a result, inspect the scheduled function. `pending` and `inProgress` retain the
  active attempt. Failed, canceled, completed-without-result or missing execution produces
  an explicit uncertain result, then follows the same bounded retry policy.

A timer alone cannot prove an HTTP request ended. Blind lease expiry would permit two
concurrent requests and break serialization. The HTTP timeout bounds normal uncertainty;
Convex execution state is the recovery authority. Late results are fenced by attempt ID.

Optional dead-letter delivery creates one ordinary group containing a terminal summary
and reference to the original group. It has no further forwarding destination, preventing
recursive failures. Full original payloads remain available through inspection.

## Management and inspection

Get/edit/delete requests create new queued groups targeting the original saved URL and
Discord message ID. They preserve the original payload and receipt. Each operation has
its own request and result history; consumers can inspect edits without rewriting the
original send record. When a send creates a forum/media thread, the receipt channel ID
supplies the thread route for subsequent management.

Group time filters use intended `sendAt`; attempt time filters use claim/schedule time, and receipt filters use recorded response time.
Both are needed when investigating delayed or historical work. Indexed history queries
page through the archive without loading all payloads. Component functions require
application wrappers, which own operator authentication and production access.

## Why Batch Worker

Workpool was inspected for its separation of immutable completion records from mutable
control, and its scheduled-function recovery pattern. Its concurrency bound alone does
not keep a group's retries ahead of other work. This sender already owns the records and
strict group affinity, so Batch Worker supplies loop liveness without a second job model.
The installed and tested dependency is @convex-dev/batch-worker 0.3.4 with Convex 1.45.0.

Primary references consulted October 7, 2026:

- https://github.com/get-convex/batch-worker (installed source is authoritative for the API)
- https://github.com/get-convex/workpool
- https://docs.convex.dev/scheduling/scheduled-functions
- https://docs.discord.com/developers/resources/webhook
- https://docs.discord.com/developers/topics/rate-limits
