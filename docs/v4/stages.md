# V4 implementation stages

This checklist owns implementation order, deliberate deferrals and the evidence needed to unblock
later design. Module docs describe the working model; they do not authorize work across these gates.
Unchecked items are outstanding work or decisions, not instructions to implement them immediately.

## 1. Refine Ingestion / Projection / Catalog / Records / Series — next

The core ingestion process and the grid/pricing-history data contracts share this milestone.
**Ready for integration** means their data and read semantics are settled enough to connect products.
**Integrated** means those products actually consume V4; that is a separate stage.

- [x] Establish the initial scan-derived implementation and compare it with V3 and the V4 docs.
- [x] Remove the premature V4 Events implementation, including its table and ingestion claims.
- [ ] Resolve remaining issues with the developer, updating implementation and docs together.
- [ ] Refine required extraction facts versus optional interpretation, including invalid optional
      values, identity/variant consistency, duplicate observations and Convex-safe selected values.
- [ ] Consolidate shared meanings for optional capabilities, limits, policies, metadata, dates,
      pricing and performance readings; use relevant V3 product behavior as evidence.
- [ ] Settle canonical provider names versus endpoint-local labels and related-context hydration.
- [ ] Confirm cumulative entity knowledge, unlisting/relisting, relationship changes, and the
      distinction between raw changes, Catalog representation changes and interpreted differences.
- [ ] Confirm comparison normalization, including array order and the documentation's `status` example.
- [ ] Refine current versus historical read guarantees, completed-clock semantics, tier selection
      and observation selection across paginated or multi-step reads.
- [ ] Refine pricing-history membership, relationship boundaries, labels, trace ownership and
      compatibility with existing sampling/rendering; assess read volume using actual retained history.
- [ ] Preserve useful raw/historical inspection and distinguish it from product interpretation.
- [ ] Establish the complete core mutation set in its naive, single-mutation-per-table form.
- [ ] Declare the grid's data contract **Ready for integration**.
- [ ] Declare pricing history's data contract **Ready for integration**.

This stage resolves the remaining ingestion/projection/catalog/series findings from review.
It does not pull later-stage complexity into the working data model.

## 2. Review mutation limits holistically — deliberately deferred

**Blocked on:** the relevant mutation set and its semantic transaction boundaries being concrete.
Later modules undergo the same review once their own naive mutations exist.

One mutation per table is the intended starting point. Raw-data measurements and production V3
behavior support that expectation. Guessed batch sizes and speculative limit handling introduce
inefficiency and can silently change the intended atomicity.

- [ ] Measure actual arguments, documents, bytes, reads/writes and runtime across representative
      baselines and forward comparisons, including large observations.
- [ ] Compare those measurements with production behavior and actual platform limits.
- [ ] Record which writes and phase transitions must remain atomic before considering any split.
- [ ] Add limit handling only where evidence requires it; explicitly review changed visibility,
      progress, retry and transaction semantics with the developer.

Review concerns about capacity are evidence-gathering inputs, not approval to add batching.

## 3. Design a comprehensive testing strategy — deliberately deferred

**Blocked on:** sufficiently concrete data contracts, mutation boundaries and product read behavior.
The overall strategy is difficult to design usefully while those remain conceptual.

- [ ] Identify the invariants and meaningful failure modes at the settled boundaries.
- [ ] Select representative real historical data and edge cases rather than implementation-mirroring fixtures.
- [ ] Decide the balance of pure-transform, Convex transaction, historical and product-integration checks.
- [ ] Implement the agreed coverage and define evidence for each product's readiness.

Focused checks for current changes remain appropriate; comprehensive coverage is a separate design step.

## 4. Integrate grid, overview and pricing history

**Blocked on:** the relevant **Ready for integration** milestones in stage 1. Coordinate limit and
testing work against concrete integration needs; checklist order is not an invented dependency.

- [ ] Connect grid and overview through the shared V4 meanings and intentional public read contracts.
- [ ] Connect pricing history while retaining relationship-aware traces and agreed sampling behavior.
- [ ] Verify end-to-end product behavior and mark each product **Integrated** separately.
- [ ] Adapt raw change inspection to the V4 observation and comparison model.

## 5. Design operational lifecycle — deliberately deferred

**Blocked on:** concrete ingestion and consumer lifecycles, with their transaction boundaries understood.

- [ ] Design orchestration: scheduling, continuation, downstream handoff and completion meanings.
- [ ] Design error/failure/recovery handling, including interrupted work and safe retries.
- [ ] Choose preview/bootstrap, deployment transfer and historical coverage workflows.
- [ ] Define repair/reprojection procedures where actual projection changes require them.
- [ ] Validate those workflows before operational cutover.

## 6. Design and implement Events and its products — fully deferred

**Blocked on:** a settled data-model strategy and concrete consumer requirements. Events is a separate,
deferred process; its full design and implementation can wait. No current schema, claim protocol,
publication transaction shape or interpretation algorithm is prescribed.

- [ ] Revisit Events from completed observations and retained historical context.
- [ ] Design interpretation, publications and consumer reads together, including historical identity,
      context, query dimensions, safe content transport and stable publication identity.
- [ ] Define execution, completion, delivery and recovery semantics at that time.
- [ ] Implement the naive mutation set, then apply evidence-based limit and testing reviews.
- [ ] Rebuild conceptual Monitor/Alerts/Discord products against the resulting contracts.

V3 Events is an early reference, and V4 will take over its continuing development. `textFeed` is a
stand-in consumer. Existing Monitor/Alerts/Discord notification implementations will be scrapped and
rebuilt; preserving their code or payloads is not a compatibility requirement. Findings in the deleted
V4 Events code are lessons for later design, not a repair backlog for that implementation.

## 7. Public API V2 compatibility — sealed until a late, developer-guided session

**Blocked on:** the contemporary V4 model and products being settled, and the developer explicitly
opening this stage. This may be the last replacement before legacy shutdown.

Treat `packages/backend/convex/public_api/` as sealed during preceding stages. Do not refactor, migrate
or normalize its contracts as incidental V4 work. Its field-level semantics intentionally conflict
with contemporary definitions; compatibility belongs in an isolated adapter, never in the core model.

- [ ] Conduct a heavily developer-guided field-by-field compatibility review.
- [ ] Resolve legacy identity names, defaults, population scope, pricing mappings, presentation and
      timestamp meaning against the existing public contract.
- [ ] Implement and verify the isolated V2 compatibility boundary.
- [ ] Cut over public API serving when the developer accepts compatibility.

## 8. Retire superseded processes

**Blocked on:** all replacement responsibilities being integrated, verified and operational,
including the late public API compatibility work.

- [ ] Inventory remaining V3 and legacy consumers and confirm their replacements.
- [ ] Shut down superseded capture/materialization/notification processes as their responsibilities end.
- [ ] Remove obsolete code and state deliberately after cutover.
