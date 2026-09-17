# Change Event Streams

CES provides a framework for producing events, uncoupled from modes of input and output.
It does not itself answer “What makes a useful event?”: that answer is unbounded in complexity
and belongs to rules implemented within the framework.

## Philosophy

- Opt in to complexity in both the framework and its rules as concrete responsibilities require it.
- Produce events permissively to exercise presentation while specialized interpretation develops.
- Keep processing defaults within the decision logic, where they evolve with the rules.
- Accommodate new upstream behavior in familiar fields by evolving the responsible phase's rules.
- Persist fields for current functionality or concrete future responsibilities; keep metrics and
  diagnostic decision reasons and timing in logs.

### Evolution and fallbacks

Aim to evolve each phase without requiring simultaneous downstream changes. Opting in to complexity
and allowing all during development should produce visible, useful fallbacks for unfamiliar events.
These principles guide future evolution; add fallback handling when unfamiliar forms actually arise,
rather than building a universal handler in advance.

- Preserve unfamiliar content and keep it moving through the development pipeline.
- Let processing preserve unfamiliar job content in events; producing no event or deferring a job
  must be deliberate decisions rather than missing handling.
- Never render an unfamiliar event as nothing, “Unknown event”, or incomplete prose such as
  “field_name changed.”; expose enough content for the reader to understand the event.
- Prefer a JSON dump as the first, lowest-complexity fallback; JSON itself is not a presentation requirement.
- Make missing handling understandable from the output itself, without locating a database document.
- Select fallbacks explicitly for unsupported forms, rather than catching failures and treating them
  as unfamiliar events; add specialized handling when the fallback reveals a concrete need.

## Jobs, events, and evidence

- Retain independently identified jobs carrying or referencing evidence from which events can be constructed.
- Keep completed jobs and their evidence addressable for explanation and reinterpretation.
- Treat job completion as permanent; reopening completed jobs is outside the current scope.
- Reconsider deferred jobs on every processing run, with idempotent handling of repeated input.
- Track unfinished versus complete jobs; deferral alone needs no separate persistent status.
- Consider every unfinished job during a run; traversal and concurrent-arrival policies remain open.
- Commit event creation and completion of contributing jobs atomically.
- Allow one-to-one, many-to-one, or one-to-many derivation, with different input and output structures.
- Reuse validators for shared information without requiring identical event forms across phases.
- Link events to supporting jobs and embed the context needed to render without current-data lookups.
- Keep events immutable and express corrections through subsequent events.

## Phases

Define rules in code, private to each phase, with freedom to filter and transform its inputs.

### 1. Ingestion

Prepare contextual jobs and store them for subsequent processing.

- Reuse shared projections and keep preparation pure, with loading and persistence handled by callers.
- Give each job one indivisible responsibility, initially separating lifecycle, pricing, and other updates.
- Prefer natural job-to-event units for the common one-to-one case; opt in to more complex derivation.
- Identify repeated work by its source pair, entity, and category rather than traversal order.
- Distinguish assigned changes from supporting context and carry the evidence ordinary processing needs.
- Use observation times to correlate jobs and events; artifact loading is not part of ordinary processing.
- Lifecycle jobs carry appearance or disappearance context; field-update jobs concern existing entities.
- Refine boundaries when concrete rules require independent disposition, rather than partial completion.
- Apply hard filters as a performance optimization for changes known to be irrelevant to event creation.
- Keep retention independent of event creation: retained jobs may never produce events.

### 2. Processing

Consider jobs and construct events through stateful interpretation of retained evidence.

- Own the data, state, and execution needed for decisions, independently of ingestion's cadence.
- Let specialized rules choose suitable state, including dedicated tables, rather than imposing
  one universal state format.
- Combine evidence across jobs, entities, observations, and other relevant context as needed.
- Retain unfinished work and allow completion with or without resulting events.
- Keep specialized interpretation here and make decisions and supporting evidence inspectable.

### 3. Presentation

Transform events just in time for public queries, broadcasts, and rendered views.

- Keep transformations pure, with retrieval and transmission handled by callers.
- Allow deliberate medium-specific rules to drop, combine, modify, and format events;
  missing handling is never a reason to omit an event.
- Follow each medium's needs, sharing helpers across backend and React code where useful.

## Orchestration

- Build the ordinary processing path first; defer exceptional backlog, concurrent-arrival, and
  cross-transaction grouping strategies until concrete requirements justify them.
- Assume one action at a time per processing chain; concurrency enforcement is currently a non-goal.
- Processing is manually initiated, with any continuation scheduled by that run; overlapping runners
  result from improper scheduling, so defer locks and coordination until orchestration requires them.
- Fail fast and avoid `try/catch`; let failures surface and mutations roll back rather than continuing
  with fallback actions from a catch block.

## Time and iteration

- Preserve knowledge that observation has advanced even when no jobs are retained.
- Interpret the absence of retained jobs in light of ingestion's selection rules.
- Give events their own creation order while preserving both ends of their evidence's observation interval.
- Allow new events to describe earlier observations; processing time must not replace evidence time.
- Support repeated interpretation of retained evidence independently of source acquisition and preparation.

## Stories to design against

These scenarios exercise the framework's flexibility, rather than specify rules or mechanisms to
build now; keep the ordinary path simple and revisit each story when it becomes useful.

### Selection and deferral

- **Uninteresting changes:** status changes produce no event while unrelated changes proceed;
  a mixed input tests whether its responsibility boundary permits the intended independent decisions.
- **Waiting for evidence:** an endpoint disappearance waits at least an hour before producing an
  event; a later observation might show its return, raising a different interpretation of the absence.
- **Indefinite deferral:** discount updates remain unfinished forever while other inputs continue
  producing events; repeated consideration must be safe even as deferred work accumulates.
- **Different output granularity:** related pricing and non-pricing changes become one entity event,
  or one input warrants several events; natural one-to-one handling remains the common case.

### Event storms and population-wide changes

- **Shared cause:** a provider-wide data-policy update or upstream schema change affects many entities
  within one collection and category; a rule may summarize the affected IDs in one or a few events
  before individual handling completes those inputs, even when they span several execution pages.
- **A meaningful population:** “most changed endpoints” and “most observed endpoints” have different
  denominators, and unchanged entities have no jobs; rules may need evidence beyond the unfinished queue.
- **Reconsidered evidence:** deferred inputs are examined again after unrelated jobs complete;
  a shrinking queue must not accidentally turn the same observation into a newly detected storm.
  Later observations may genuinely change the evidence and warrant a subsequent event.
- **Imperfect detection:** a pattern obvious to a reader escapes the heuristics; retained evidence
  supports improving a specific rule without requiring an exhaustive storm detector in advance.

### Scale, interruption, and defective inputs

- **Initial comparison:** an empty prior catalog meets a full first scan, yielding appearances for
  every entity; its size exercises ordinary incremental ingestion rather than a baseline shortcut.
- **Partial ingestion:** views or CES commit some work before failure; retrying the same comparison
  preserves accepted work without duplicating it, and completion is recorded only after ingestion succeeds.
- **A very long queue:** unfinished work greatly exceeds one transaction or invocation, potentially
  with new arrivals during a run; traversal, continuation, and run boundaries remain implementation choices.
- **Oversized work:** one input, a group's evidence, or its summary exceeds a document or transaction
  limit; that rule needs an explicit strategy without imposing large-group machinery on ordinary work.
- **Unfamiliar or broken content:** a valid unfamiliar form remains inspectable through a simple
  fallback, while malformed input or a broken invariant fails visibly without fabricating success.

## Products

Discord alerts are the baseline product: broadcasts reach users' mobile notification screens and
cannot be taken back. Editing the channel message cannot undo an alert already received. Develop
processing against that irreversibility, with other products rendering the history of those events.

- Broadcast alerts through Discord for channel-following users, keeping delivery mechanics downstream.
- Render the same published history on the website as the successor to Monitor.
- Use text feeds and natural-language entries to develop and inspect that history directly.

## Associated material

- Use [raw change inspection](raw-change-stream.md) as an independent tool to inform CES design.
- Consult the [V3 README](../../packages/backend/convex/v3/README.md) for the existing data flow.
- Use [pricing observations](../openrouter/pricing.md) to inform interpretation experiments.
- Follow the shared [product objectives](objectives.md).
