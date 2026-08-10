# Observation

OpenRouter's API distinguishes successful emptiness from failure in ways that matter when comparing
catalog observations.

## Embedded copies

Endpoint payloads repeat complete `model` and `provider_info` objects. The embedded model can itself
contain an endpoint scope. These are denormalized copies of the same conceptual entities.

Copy-to-copy differences within one observation have been seen and can reflect serialization or
API assembly rather than real entity changes. Compare stable entity records by their natural
identifiers before drawing conclusions from duplicated payloads.

## Broad rewrites

Large same-field changes can indicate an upstream reporting transition rather than independent
market events. Historical examples include catalog-wide data-policy changes and widespread
quantization changes. These are better interpreted as common rewrites than as independent changes
to every affected endpoint.
