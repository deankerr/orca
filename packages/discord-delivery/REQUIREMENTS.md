# Discord delivery requirements

## Scope

A reusable Convex component owns destinations, submission, ordered delivery and the
complete retained delivery record. Consumers supply ready-to-send JSON. Domain
selection, rendering, source identities, authentication and environment configuration
belong to the calling application. Discord.js builders remain a caller concern.

HTTP(S) destinations are stored records. Custom hosts may implement the Discord webhook
contract for capture or testing. General transport adapters, bot interactions, multipart
uploads and publishing an npm package are outside this initial release.

## Submission and identity

- Submit a group atomically: one destination, ordered messages, a caller key and an
  epoch-millisecond `sendAt`. Header/body/footer ordering follows array order.
- Store messages individually with their own caller keys and serialized payloads.
- Deduplicate on destination, `sendAt` and group key. An identical retry returns the
  existing group; conflicting content under that identity is an error.
- Snapshot the destination URL when accepting a group. Subsequent destination changes
  apply to new submissions.
- Permit arbitrary caller references without knowledge of the caller's database.
- Retain all records, including immediately expired submissions. Cleanup and payload
  redaction are deferred.

## Delivery

- One component instance coordinates all destinations through one global sender.
- Send one HTTP request at a time. Finish or terminate an active group before starting
  another. Retries retain the active group's place.
- Select the earliest eligible queued `sendAt`; it also defines the earliest send time.
  Equal times use acceptance order. New arrivals cannot reorder completed or active work.
- Configurable age is measured from `sendAt`. Check expiry before each attempt. Preserve
  successful messages if the remaining group expires; a success received after its
  deadline remains a recorded success.
- Retry network uncertainty and server failures, accepting possible duplicate Discord
  messages. Never retry a confirmed successful send as part of ordinary delivery.
- Honor Discord cooldowns, including successful responses with an exhausted rate bucket.
  Global waiting is deliberately conservative even for a destination-specific 429.
- Permanent delivery errors terminate the group; remaining messages have visible unsent
  outcomes. Bound retries and make exhaustion visible.
- Recover when an action terminates without committing a result. Never reclaim merely
  because elapsed time is long while Convex still reports the action in progress.
- Optional terminal forwarding emits a one-hop failure/expiry report. The retained
  original remains authoritative and forwarding failures cannot recursively forward.

## Inspection and management

- Query groups, messages and attempts by intended time, actual attempt time, destination,
  status and deterministic keys through bounded indexed reads.
- Preserve submitted bodies and full response snapshots, including error responses and
  Discord message IDs. Operators must distinguish queued, attempted and confirmed sends.
- Retrieve, edit and delete confirmed Discord messages using their saved receipt and
  destination. Queue these operations through the same sender and preserve their history.
- Component functions are called through application wrappers; application authorization
  remains outside the component.

## Evidence required

Tests cover ordering, future scheduling, partial expiry, duplicate submissions, retry
cooldowns, stranded actions, partial group failure, terminal forwarding and management
history. A live demonstration sends ordered groups to two development destinations,
inspects receipts, edits/fetches/deletes a message, and verifies immediately expired work
never reaches Discord.
