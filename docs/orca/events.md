# Events and alerts

## Retained Events

A scan pair and its projection rules determine Events. Earlier retained pairs and current-view metadata
selection do not affect them.

- Endpointless models and their metadata remain in scope.
- Stats and endpoint `status` are excluded; `capacity_tpm` remains an entity fact.
- Scan time, entity kind, and entity ID address an Event; registration fixes its predecessor.

| Type   | Payload                                                     | Identity and related names |
| ------ | ----------------------------------------------------------- | -------------------------- |
| ADD    | Complete projected facts                                    | Next scan                  |
| UPDATE | Changed facts, including child-field additions and removals | Next scan                  |
| REMOVE | Complete projected facts                                    | Previous scan              |

- Endpoint pricing UPDATEs also retain complete before/after quotes.
- Relationship updates use the next model/provider activity scope; departures use the last relationships.
- A related rename does not itself create an endpoint rename Event.
- Never fill unchanged surrounding facts from today's current view.

## Shared alert interpretation

Monitor, Feed, and Discord derive alerts from Events and observations using shared default selection.
Retained lifecycle Events and presented lifecycle alerts have different meanings:

| Entity         | Retained ADD/REMOVE         | Lifecycle alert             |
| -------------- | --------------------------- | --------------------------- |
| Model/provider | Endpoint count crosses zero | Endpoint count crosses zero |
| Endpoint       | Listing/unlisting           | Listing/unlisting           |

- Baseline establishes knowledge without lifecycle alerts.
- Parent metadata updates require endpoints on both sides; a serving transition takes precedence.
- Valid unselected facts remain retained.

### Prior knowledge

- Arrival classification uses observations strictly before the scan, including baseline knowledge.
- Missing classification means unclassified.
- Observation-only lifecycle alerts use historical Event identity, falling back to the ID.
- Metadata details require a matching lifecycle Event snapshot.

### Fields and failures

Alerts read Events through the V5 Contract field declarations, so alert fields use Contract names and
values. Each field's kind, such as price, count, flag, text, prose, or string set, decides its presentation.
Models also announce `warning_message`, which the Contract does not yet publish.

- Optional facts ORCA cannot read are unknown (null), like absent ones; absent and null are the same value.
- Provider updates select identity, location, status-page, and terms/privacy URLs.
- Reasoning belongs to model alerts; endpoint reasoning-only changes are omitted.
- Overrides are announced as changed, without values, only under a price schedule.
- A required fact ORCA cannot read, or a changed field without both sides, fails its Event.
- Failed Events log their identity and error and are omitted while neighbors continue.

## Pricing eligibility

### Scheduled pricing

- An override key starting with `utc` establishes schedule evidence; prompt-length overrides alone do not.
- Detection neither interprets conditions nor selects an active band.
- If either complete quote is scheduled, only override changes qualify, including introduction/removal.
- Updates say “Price schedule changed” and omit current-band deltas; listings can say “Price schedule detected”.
- Without complete quote context, ordinary numeric eligibility applies.

### Ordinary pricing

Thresholds live in `products/shared/alerts/filter.ts` and are recorded in `config.md`.

1. Suppress small numeric discount adjustments.
2. Require a qualifying meter movement; discount alone is insufficient because presented rates already include it.

- A transition between a positive rate and zero or no quote qualifies.
- A rate ORCA cannot read is unquoted: it may express an upstream intention ORCA does not yet understand.
- Opaque pricing, presentation-only, and revision-only changes do not independently qualify.
- Lifecycle and updates without pricing changes bypass this rule.

⚠️ Failed pricing eligibility suppresses the entire endpoint Event, including coincident
metadata edits. Source Events remain retained.

## Monitor scopes and pagination

### Activity scopes

- Model/provider activity includes related endpoints; their intersection contains endpoint Events only.
- Scopes use captured relationships, and departed identities remain selectable.
- Model choices require endpoint history and exclude `openrouter/*`.

### Pages

- Queries merge Events and observations before pagination, capped at completed ingestion.
- Selection can leave an empty page; the viewport continues until filled or exhausted.
- Time headings do not define page boundaries; an observation can span pages.
- Monitor shows individual alerts without Discord batching or frequency suppression.
