# ORCA alerts expansion

## Requirements

- Retain Discord.js builders and current embed/Components V2 presentation.
- Prepare messages from one observation together, apply final ordering, then submit an
  ordered group to each selected destination. The same payloads may go to several routes.
- Use the observation's `scan_at` as automatic delivery `sendAt`. The route's maximum age
  determines expiry, allowing historical ingestion to exercise submission without posting
  stale alerts.
- Record the obligation to prepare automatic alerts atomically with fresh event commits.
  Preparation and delivery failures remain independently inspectable and recoverable.
- Automatic admission follows `ORCA_DISCORD_AUTO_SEND_ENABLED`; explicit operator
  submissions bypass it. Pausing delivery is a separate sender operation.
- Routes select registered destinations and an age policy. Webhook URLs live in the
  component's destination table.
- Provide pure previews and retained delivery queries. A preview uses current rendering
  and pricing history; historical delivery records preserve the actual submitted output.
- Preserve event provenance outside the reusable component's domain model, using opaque
  references and deterministic message keys. Operators can locate a rendered message
  without assuming a one-event-to-one-message mapping.
- Operators can enqueue arbitrary builder-produced messages for admin status, public
  announcements, manual broadcasts or computed milestones. These need no entity event.
- Filtered, experimental and alternate alert producers can use separate destinations
  through the same sender. Their selection rules remain ORCA policy.

## Initial policies

Automatic routes default to one hour of maximum age, configurable per route. Automatic
admission without a configured route is a visible preparation failure. Existing groups
retain their accepted destination and expiry policy. All payloads and receipts are kept.

Strict global group ordering favors readable header/body/footer sequences and simple
backfill behavior over cross-destination throughput. Ordering is over available queued
work: for a strict historical replay, submit in observation order or pause the sender
while preparing the replay, then resume.

## Separation

`packages/discord-delivery/REQUIREMENTS.md` owns reusable delivery requirements.
`packages/discord-delivery/ARCHITECTURE.md` owns queue decisions and failure semantics.
`docs/orca/discord.md` owns ORCA operator procedures. This document owns the relationship
between ORCA alert producers, routes and delivery.
