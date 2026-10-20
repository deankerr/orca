# Discord alerts

## Admission

Completed non-baseline registrations can submit alerts to the sender's `ingestion` topic.

- Automatic sending requires its switch at both scheduling and preparation; submitted jobs continue when disabled.
- No eligible messages or matching webhooks means no jobs.
- Completion schedules preparation once; rendering/submission failures leave Catalog facts and progress intact.
- Repair preparation failures before an intentional manual send.

Automatic deadlines use source scan time, so delayed ingestion can retain history without delivering
alerts. Recent replay can still send: disable automatic sending for a silent rebuild.

## Message policy

Preparation applies shared eligibility and Discord's frequency rule to the complete scan, then batches
equivalent changes within one scan and entity kind. Residual changes keep their individual identities.
Within each scan, ordering introduces parents before endpoints and announces endpoint unlistings before a
parent's last-endpoint departure. Ordering applies before batching; `config.md` records the priorities.

| Arrival         | Presentation                                               |
| --------------- | ---------------------------------------------------------- |
| Model discovery | Introductory card.                                         |
| Known entity    | Endpoint relisting or model/provider serving availability. |
| Unclassified    | Neutral wording.                                           |

- Batching threshold and delivery age are maintained in `config.md`.
- Submitted payloads and sender receipts record output; later history or rendering changes do not update Discord.

## Operator commands

Run from `packages/backend`, selecting the intended deployment. Development uses private development
webhooks. An eligible webhook must subscribe to `ingestion`:

```sh
bunx convex run api:registerWebhook '{"name":"Ingestion alerts","topics":["ingestion"],"url":"<webhook-url>"}' --component discordSender --deployment <deployment>
bunx convex run api:listWebhooks '{}' --component discordSender --deployment <deployment>
```

Preview current filtering and cards without submitting jobs:

```sh
bunx convex run products/discord/delivery:prepareRegistration '{"registration_id":"<registration-id>"}' --deployment <deployment>
```

This returns ordered serialized messages, source IDs, and filtering reasons. It requires a completed
registration but ignores age, auto-send, and subscriptions. Baselines produce no messages.

Send intentionally, including with auto-send disabled:

```sh
bunx convex run products/discord/delivery:sendRegistration '{"registration_id":"<registration-id>"}' --deployment <deployment>
```

Every invocation sends again with a fresh invocation-time deadline and the original observation time.
The result contains `jobIds` and `messageCount`; messages with no jobs means no eligible subscribers.

Inspect submissions in an epoch-millisecond window `[from, to)`:

```sh
bunx convex run api:listJobs '{"from":<start-ms>,"to":<end-ms>}' --component discordSender --deployment <deployment>
bunx convex run api:getJob '{"jobId":"<job-id>"}' --component discordSender --deployment <deployment>
bunx convex run api:listResults '{"jobId":"<job-id>"}' --component discordSender --deployment <deployment>
```

Discovery uses submission time, not scan time; job keys retain the source time. Narrow the window when
`hasMore` is true. Use stored jobs/results for historical evidence: preparation rerenders with current rules.

## Frequent pricing

Discord suppresses ordinary pricing fields after the configured number of prior quotes in its lookback
window.

- Count retained quotes, including small changes and relistings; exclude current/later observations.
- Delivered alert counts do not affect this rule.
- Schedule-definition changes and lifecycle alerts bypass it; other selected fields survive.
- Large movements receive no exception.
- Missing or extended history can change classification.

### Initial calibration

The initial calibration replayed hourly captures from 2026-09-26 to 2026-10-03, reserving the first
24 hours for lookback. The remaining six days had 1,507 eligible endpoint pricing alerts before batching:

| Lookback | Prior quotes | Alerts remaining |
| -------- | ------------ | ---------------- |
| 6 hours  | 2            | 708              |
| 12 hours | 2            | 505              |
| 24 hours | 3            | 445              |
| 24 hours | 2            | 314              |

The selected 24-hour/two-quote policy removed 79% of that population while forgetting bursts sooner
than a week-long window. Retaining magnitude gates avoided another 191 history candidates and 23
surviving small-change alerts.

This calibration does not guarantee an alert rate: sparse recurring changes can still pass, and the rule
does not identify unofficial discount schedules.
