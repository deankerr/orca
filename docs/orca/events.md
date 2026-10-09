# Events and alerts

Events retain observed changes; alerts interpret those facts for Monitor, Feed, and Discord.

## Historical meaning

- Models without endpoints remain known in Catalog, but their metadata changes do not produce Events.
- Arrival classification uses knowledge strictly earlier than the event's observation, including baseline knowledge.
- An absent `previously_known` value is unclassified; it must not become a discovery claim.
- A known model gaining endpoints is not proof that ORCA previously observed it serving through endpoints.
- The stable event address is `scan_at` + `entity_kind` + `entity_id`; ingestion fixes its predecessor scan.

Projection changes can revise historical output. Delivered messages remain with recipients even if
history is regenerated.

Identity context comes from the next observation for arrivals/updates and the previous observation
for departures. Related names come from that same observation, so headings remain meaningful as
Catalog evolves. A model rename produces a model event; an endpoint price update can carry the
new model name without becoming another rename event.

An endpoint relationship change is selected under its next model/provider. Departures use their
last relationships. The former relationship is not an additional activity scope for an update.

## Comparison semantics and limitations

Entity lifecycle and child-field operations are distinct: an entity UPDATE may contain field
ADDs and REMOVEs. Absence, null, false, and zero remain distinct observed values.

String arrays compare as sets, ignoring order. Accepted `json-diff-ts` limitations:

- Repeated strings collapse, so duplicate-count changes disappear.
- Membership matching drops the literal string `__proto__`.
- Object-to-scalar transitions can omit the new scalar or the entire change.
- Arrays directly nested in arrays retain positional behavior; supported entity shapes avoid this case.
- In version 4.10.4, `applyChangeset` skips UPDATEs to null. Rendering reads retained diff nodes directly.

Lifecycle events carry complete projected facts. Updates retain changed facts, with complete
before/after pricing context on new endpoint pricing updates. That context is optional for older
records. Other unchanged surrounding state is absent; explanations must not fill those gaps from
today's Catalog.

## Alert policy

Shared preparation selects product-relevant facts and applies pricing eligibility.
Valid unselected changes disappear. Malformed selected changes log their event identity and error,
then omit the event while other events continue. Metadata remains arbitrary at capture; products
interpret only the facts they need.

Raw Events excludes `stats`, `statsByTier`, and `status`. `capacity_tpm` remains captured, while
shared alert preparation excludes endpoint telemetry. Capability flags retain their upstream
shapes, including true-or-absent signals and potentially empty selected containers.

Indexed-array diffs inside selected object groups such as `data_policy` can silently lose numeric
child keys. No upstream occurrence is known. If observed, reject that group shape so preparation
logs and skips the event; arbitrary object-array rendering is outside scope.

### Pricing eligibility

Monitor, Feed, and Discord use shared eligibility. Any `pricing.overrides` row with a key
starting with `utc` establishes that a schedule is present. This deliberately accepts upstream
extensions without parsing conditions, matching rate bands, or choosing an active band.

For pricing scheduled on either side of an event, unchanged overrides suppress the pricing
update. Changed overrides produce “Price schedule changed”, including schedule introduction
or removal, even when the presented rates do not move. Current-band meter deltas are omitted
from that alert. Endpoint arrivals with a schedule include “Price schedule detected”.

Schedule classification uses the event's observed before/after quotes. Older events
without quote context retain the numeric eligibility rule below; today's Catalog
cannot supply their historical schedule.

Other endpoint pricing updates first suppress numeric discount adjustments of at most two
percentage points, then require an eligible meter movement of at least 2%, measured before
rounding. A valid transition between zero/absence and a positive rate also qualifies. Invalid,
negative, or non-string values do not. Discount alone does not qualify because presented rates
already reflect it. Long-context overrides alone do not establish a schedule.

This coarse rule suppresses the whole event, including coincident non-pricing changes.
Lifecycle events and updates without pricing changes are outside the rule; captured events
remain intact. Other opaque pricing, presentation-only changes, and revision-only changes are
not selected as standalone alert signals.

## Monitor scope

Model/provider activity includes that entity and related endpoints. Their intersection includes
only endpoint events. Selection uses captured relationships independently of current Catalog.
Departed identities remain selectable; model choices require endpoint history and exclude `openrouter/*`.

Curation and compound filtering can produce empty pages. The viewport continues requesting until
filled or exhausted. Time headings are presentation only: pages can split an observation and rows
retain stable event addresses.
