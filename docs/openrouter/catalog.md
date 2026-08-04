# Catalog

OpenRouter's frontend catalog endpoint, `/api/frontend/v1/catalog/models`, includes historical model
records as well as currently available models. Catalog membership is therefore not evidence that a
model can currently serve inference requests.

Availability is represented by endpoints:

- A catalog model with an embedded `endpoint` has at least one endpoint that can be queried.
- A catalog model whose `endpoint` is `null` has no current inference endpoint.
- Requesting endpoint data for a model with no endpoints returns `404`. In this context, `404`
  means "no endpoints now" rather than an unknown model or a failed observation.

**Observed 2026-07-24:** the catalog contained 815 model records. Of these, 374 had no endpoints,
including long-retired models.
