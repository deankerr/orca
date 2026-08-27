# Observation

OpenRouter's API distinguishes successful emptiness from failure in ways that matter when comparing
catalog observations.

## Embedded copies

Endpoint payloads repeat complete `model` and `provider_info` objects. The embedded model can itself
contain an endpoint scope. These are denormalized copies of the same conceptual entities.

## Broad rewrites

Large same-field changes can indicate an upstream reporting transition rather than independent
market events. Historical examples include catalog-wide data-policy changes and widespread
quantization changes. These are better interpreted as common rewrites than as independent changes
to every affected endpoint.
