# Events and alerts

Events retain observed changes; alerts interpret those facts for Monitor, Feed, and Discord.

## Historical meaning

- Events describe transitions after the [baseline](../../CONTEXT.md), dated by observation rather than upstream creation.
- Arrivals include reappearances. Models and providers arrive/depart as they gain their first or lose their last listed endpoint.
- Models without endpoints remain known in Catalog, but their metadata changes do not produce Events.
- Arrival classification uses knowledge strictly earlier than the event's observation, including baseline knowledge.
- An absent `previously_known` value is unclassified; it must not become a discovery claim.
- A known model gaining endpoints is not proof that ORCA previously observed it serving through endpoints.
- The stable event address is `scan_at` + `entity_kind` + `entity_id`; ingestion fixes its predecessor scan.
- Projection changes can revise historical output. Delivered messages remain with recipients even if history is regenerated.

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
- Arrays directly nested in arrays retain positional behavior; supported entity shapes avoid this case.
- `applyChangeset` skips UPDATEs to null. Rendering reads retained diff nodes directly.

Lifecycle events carry complete projected facts. Updates retain changed facts, with complete
before/after pricing context on new endpoint pricing updates. That context is optional for older
records; see [pricing eligibility](pricing.md#alert-eligibility) for consumer behavior. Other
unchanged surrounding state is absent; explanations must not fill those gaps from today's Catalog.

## Alert policy

Shared preparation selects product-relevant facts and applies [pricing eligibility](pricing.md#alert-eligibility).
Valid unselected changes disappear. Malformed selected changes log their event identity and error,
then omit the event while other events continue. Metadata remains arbitrary at capture; products
interpret only the facts they need.

Raw Events excludes `stats`, `statsByTier`, and `status`. `capacity_tpm` remains captured, while
shared alert preparation excludes endpoint telemetry. Capability flags retain their upstream
shapes, including true-or-absent signals and potentially empty selected containers.

Indexed-array diffs inside selected object groups such as `data_policy` can silently lose numeric
child keys. No upstream occurrence is known. If observed, reject that group shape so preparation
logs and skips the event; arbitrary object-array rendering is outside scope.

## Monitor scope

Model/provider activity includes that entity and related endpoints. Their intersection includes
only endpoint events. Selection uses captured relationships independently of current Catalog.
Departed identities remain selectable; model choices require endpoint history and exclude `openrouter/*`.

Curation and compound filtering can produce empty pages. The viewport continues requesting until
filled or exhausted. Time headings are presentation only: pages can split an observation and rows
retain stable event addresses.

See the [Feed contract](feed.md) and [Discord operations](discord.md).
