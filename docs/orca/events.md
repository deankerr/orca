# Events and alerts

Events retain observed changes; alerts interpret those facts for Monitor, Feed, and Discord.

## Event scope

- Endpoint ADD/REMOVE events describe listing and unlisting, including relisting.
- Model/provider ADD/REMOVE events describe gaining listed endpoints or losing the last listed endpoint.
- Models without endpoints remain known in Catalog, but their metadata changes do not produce Events.

Events exclude `stats`, `statsByTier`, and `status`, while retaining `capacity_tpm`.
Capability flags retain their upstream shapes, including true-or-absent signals and potentially
empty selected containers.

## Historical context

ADD classification uses knowledge strictly earlier than the event's observation, including
baseline knowledge. An absent `previously_known` value is unclassified. A known model gaining
endpoints is not proof that ORCA previously observed it serving through endpoints.

Identity context comes from the next observation for ADD/UPDATE events and the previous
observation for REMOVE events. Related names come from that same observation. A model rename
produces a model event; an endpoint price update can carry the new model name without becoming
another rename event.

An endpoint relationship change is selected under its next model/provider. Endpoint unlistings
use their last relationships. The former relationship is not an additional activity scope for an update.

The stable event address is `scan_at` + `entity_kind` + `entity_id`; ingestion fixes its
predecessor scan. Projection changes can revise historical output. Delivered messages remain
with recipients even if history is regenerated.

## Retained changes

An entity UPDATE may contain field ADDs and REMOVEs. Entity lifecycle and child-field operations
have distinct meanings.

Lifecycle events carry complete projected facts. Updates retain changed facts, with complete
before/after pricing context on new endpoint pricing updates. That context is optional for older
records. Other unchanged surrounding state is absent; explanations must not fill those gaps from
today's Catalog.

## Alert selection

Monitor, Feed, and Discord share selection of product-relevant facts and pricing eligibility.
Valid unselected changes are omitted. Malformed selected changes log their event identity and
error, then omit the event while other events continue. Metadata remains arbitrary at capture;
products interpret only the facts they need. Endpoint telemetry is excluded from alerts.

Indexed-array diffs inside selected object groups such as `data_policy` can silently lose numeric
child keys. No upstream occurrence is known. If observed, reject that group shape so preparation
logs and skips the event; arbitrary object-array rendering is outside scope.

### Pricing eligibility

Any `pricing.overrides` row with a key starting with `utc` establishes that a schedule is present.
This deliberately accepts upstream extensions without parsing conditions, matching rate bands,
or choosing an active band. Long-context overrides alone do not establish a schedule.

For pricing scheduled on either side of an event, unchanged overrides suppress the pricing
update. Changed overrides produce “Price schedule changed”, including schedule introduction
or removal, even when the presented rates do not move. Current-band meter deltas are omitted
from that alert. Endpoint listing alerts with a schedule include “Price schedule detected”.

Schedule classification uses the event's observed before/after quotes. Older events without
quote context retain the numeric eligibility rule below.

Other endpoint pricing updates first suppress numeric discount adjustments of at most two
percentage points, then require an eligible meter movement of at least 2%, measured before
rounding. A valid transition between zero/absence and a positive rate also qualifies. Invalid,
negative, or non-string values do not. Discount alone does not qualify because presented rates
already reflect it.

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
