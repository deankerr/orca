# ORCA

OpenRouter Capability Analysis helps you compare OpenRouter endpoints and track how models,
providers, capabilities, and prices change over time.

Live at https://orca.orb.town.

## Compare endpoints

The Endpoints Data Grid is a dense, filterable view of model and endpoint capabilities, pricing,
modalities, and supported parameters. Open a model or provider overview for more context, or use
Pricing History to compare provider prices for a model over time.

## Follow changes

Monitor shows model, endpoint, and provider activity with field-level changes. ORCA retains
observations over time, so you can inspect changes that the current OpenRouter catalog alone
cannot show. Discord alerts deliver selected changes to a configured channel.

History dates when ORCA observed a change; it does not establish when that change happened upstream.

## Public API

The preview HTTP API exposes curated model and endpoint data as JSON:

```text
GET https://orca.orb.town/api/preview/v2/models
```

The published V2 response contract is maintained for compatibility. Response documentation is
available at https://orca.orb.town/api.
