# Renderers

- Shared selection and composition are intended to keep interpretation consistent across the JSON feed, Grid, and Discord.
- Model-level grouping over an ingestion belongs to composition, preserving the entity-level events for other views.
- Renderer-owned waiting, batching, and storm handling let the Grid respond immediately while Discord can coalesce activity for delivery.
- Discord rendering is planned as an internal step producing serialized output. Delivery makes the permanent commitment: recipients retain what was sent even as projected event history evolves.
