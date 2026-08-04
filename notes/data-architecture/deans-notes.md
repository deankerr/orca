# dean's notes

- `crawl_id` shouldn't continue as a concept, and I'm tired of looking at UNIX timestamps which are opaque to me. ISO timestamps are preferrable.

- Don't design for compability with the previous `backend` systems - we have full, raw API outputs as our back catalogue. Design the best system for now and the future.

- There is no guarentee that an observation will be present at specific time, or capture interval.

## Draft Architecture

- Capture (Worker)

- Artifact Store (R2)

- Adapters (Worker ?)
  - Composed transformation functions
  - Schema change detection

- Normalized Store (R2? DB?)
  - Change over time schema?
  - Separate Pricing?
  - Projections?

- Engine (Worker)
  - Dispatcher
  - General Hub

- Consumers
  - Legacy DB (Endpoints Data Grid) (Transitional)
  - Monitor
  - Alerts (dispatch)
  - Time series DB
  - Analysis Labs

- Legacy Artifact Store (Convex files)
  - Should be moved to Arifact Store
  - Normalize to simple raw capture format
