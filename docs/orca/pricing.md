# Pricing policy

[OpenRouter pricing](../openrouter/pricing.md) records upstream representations and observations.
This document records how ORCA interprets and presents them.

## Observed rates

ORCA retains the decimal meter strings OpenRouter presents, with discount and conditional
overrides alongside them. Tiny movements are real observations; display rounding must not
change the captured facts or turn small nonzero prices into zero.

- Presented rates already include `discount`. Never apply it a second time.
- A quote is complete: an absent meter is unknown/unmetered, not a request to carry its previous value.
- Zero and absence do not establish that an endpoint is free or supports a feature.
- Retain zero in stored history; the Grid omits zero prices and Pricing History omits them from positive-rate traces.
- Preserve conditional overrides with their observation. Today's Catalog cannot explain a historical quote.

Schedule changes can move presented rates without changing authored pricing. ORCA stores those
movements without choosing a canonical base band or parsing `pricing_json`. Prompt-length
overrides describe a different condition and must not be treated as schedules. Capturing a quote
does not require every product to announce it as a price change.

## Presentation

Products share price meaning, units, and supported meters; they need not share one formatter.
The Grid, Monitor, Entity Overview, Pricing History, and Discord have different density constraints.

- Use `$` for USD. Avoid repeating currency names on each rate.
- Text, audio, and cache token rates scale by 1,000,000 (`MTOK`). Image token rates scale by 1,000 (`KTOK`).
- Image rates are per token, not per image. A shared unit caption across all meters is misleading.
- Unit captions may be omitted where the scale is understood, especially in compact Discord cards.
- Use Input/Output or IN/OUT when helpful. Do not reserve paired slots for every modality; most would be empty.
- Product names such as `text_input` and `cache_read` are presentation vocabulary, not stored meter names.
- `discount` is a percentage adjustment, never a currency meter. Zero means no adjustment.
- `web_search` is a per-search service charge, unaffected by discount. Prefer showing it with the native-search capability.

`priceMeters.ts` is authoritative for supported meter units and scaling; each product selects
its labels and meters. Do not duplicate the complete mapping here.

## Deliberately omitted meters

Do not display or surface these fields:

- misleading: `internal_reasoning`
- obsolete: `request`, `variable_pricings`

## Alert eligibility

Monitor, Feed, and Discord use shared eligibility. Any `pricing.overrides` row with a key
starting with `utc` establishes that a schedule is present. This deliberately accepts upstream
extensions without parsing conditions, matching rate bands, or choosing an active band.

For pricing scheduled on either side of an event, unchanged overrides suppress the pricing
update. Changed overrides produce “Price schedule changed”, including schedule introduction
or removal, even when the presented rates do not move. Current-band meter deltas are omitted
from that alert. Endpoint arrivals with a schedule include “Price schedule detected”.

Endpoint pricing updates retain complete normalized before/after quotes in `context.pricing`,
using the same storage encoding as Catalog and Pricing History. This supplies unchanged overrides
that the diff omits, without historical joins or a persisted schedule classification. Alert
preparation derives schedule presence from these observed quotes each time it runs.

The context is optional in the stored schema for older events. New pricing updates always include
both quotes, even when neither has overrides; lifecycle snapshots already contain full pricing,
and unrelated updates do not duplicate it. Missing context means unknown, not unscheduled: older
updates retain the previous eligibility behavior until regenerated. Consumers must handle absence
and must never infer historical schedules from today's Catalog. Captured changes and price history
remain intact.

The earlier preview's stored `pricing_is_scheduled` field is accepted only for schema compatibility.
New events omit it; alert preparation discards any legacy value and derives its own classification.

Other endpoint pricing updates first suppress numeric discount adjustments of at most two
percentage points, then require an eligible meter movement of at least 2%, measured before
rounding. A valid transition between zero/absence and a positive rate also qualifies. Invalid,
negative, or non-string values do not. Discount alone does not qualify because presented rates
already reflect it. Long-context overrides alone do not establish a schedule.

This coarse rule suppresses the whole event, including coincident non-pricing changes.
Lifecycle events and updates without pricing changes are outside the rule; captured events
remain intact. Other opaque pricing, presentation-only changes, and revision-only changes are
not selected as standalone alert signals.

See [Pricing History](pricing-history.md) for interpreting quotes across membership and availability changes.
