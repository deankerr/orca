# Endpoint history

Endpoint UUIDs retain continuity across changes to model, provider, provider tag, and availability.
A model's history selects membership periods; an endpoint's history follows that identity throughout.
Provider tags are changing, non-unique routing labels.

## Continuing state and readings

| History               | Retained meaning                                           | Meaning of no new row                                  |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Endpoint observations | Availability and model/provider/tag context                | Prior state continues.                                 |
| Pricing               | Complete observed quotes                                   | Prior quote continues within its availability period.  |
| Stats                 | Supplied readings at scan time and tier, including repeats | No reading; neither carry forward nor substitute zero. |

Availability and relationships travel together in observations. A model move ends the former
membership without unlisting the endpoint. A tag change can occur while its price stays unchanged;
quote rows alone cannot reconstruct these transitions.

Discover historical members through relationship indexes, then follow each endpoint's full context.
The observation ending membership can be indexed under the destination model or provider. Interpret
provider identities under the normalization rules that produced the observations.

## Reading history

- Pricing History loads complete model histories and applies the continuity rules in `pricing-history.md`.
- Stats queries page one endpoint's readings across tiers, newest first, through the completed horizon.
- A requested stats cutoff can narrow that horizon; an empty timeline returns no readings.
- Price ranges need the preceding quote and availability state; stats ranges inherit no earlier reading.
- Shared endpoint identity and scan time do not make these histories' absence semantics interchangeable.

Stats retains every supplied reading with no automatic pruning. Its storage growth depends on scan
cadence, endpoint count, and tiers; Pricing History's capacity measurements do not establish stats cost.
