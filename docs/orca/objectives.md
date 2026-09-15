# Objectives

## Data foundation

- Capture upstream observations as durable scan artifacts.
- Build disposable, rebuildable product data from historical and active scans.
- Share validated records and structural comparisons across views and change processing.
- Scope current products to models supporting both text input and text output.
- Keep capture independent of downstream processing.
- Harmonize field meanings and labels across products.

## Endpoints Data Grid

- Serve the latest ingested endpoint catalog through reactive Convex views.
- Update current data independently of notification selection and publication.
- Expand modality support later through a shared scope decision.

## ORCA API

- Serve a V2-compatible representation of current data.
- Develop a V3 schema later.

## Monitor / Alerts

- Derive notifications from shared projected-record comparisons.
- Use complete before/after records for period-correct contextual metadata.
- Keep the same text-model scope as the grid, including raw change inspection.
- Interpret changes in context; a changed value alone does not warrant a notification.
- Process historical and active observations while restricting broadcasts to eligible live events.
- Share one curated notification payload between the web and external delivery surfaces.

### Monitor

- Present notifications as a grid overlay.
- Treat the Monitor name and distinct identity as provisional.
- Support useful query dimensions and pagination independent of scan batch sizes.

### Alerts

- Provide durable, observable notification delivery.

## Pricing History

- Serve historical endpoint pricing from scan-derived series.
- Control history granularity for useful comparison.

## Completion target

- Retire the legacy `snapshots` process after its product responsibilities are replaced.

## Design notes

- [Change Event Streams](change-event-streams.md): notification processing requirements and open design.
- [Raw change stream](raw-change-stream.md): the first CES product slice.
- [V3 README](../../packages/backend/convex/v3/README.md): implemented data flow and operating constraints.
