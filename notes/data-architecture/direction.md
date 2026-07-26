# Direction

The architecture, and the reasoning behind it. Everything rests on a capture and artifact storage
strategy that lets us freely chain — and unchain — processes.

Layers are ordered by **how much domain knowledge they require**. Layer 0 needs almost none;
each layer above can be built, versioned, and discarded independently of the ones above it. That
ordering is the whole design: it puts the code most likely to be wrong furthest from the code whose
mistakes are unrecoverable, and it means being wrong about interpretation costs a re-run rather
than a loss.

## Key principles

- **Raw is the only trustworthy baseline.** The source schema drifts silently, so deltas, dedupe
  decisions and noise filters are all _derived_ and versioned — never the source of truth. Changed
  our mind about what counts as noise? Re-derive.
- **History replays forward.** Per-entity history regenerates from keyframes plus changesets as
  changes are seen — never reconstructed backwards from current state.
- **Collection and interpretation are independently versioned, deterministic, and idempotent.**
  Re-running any stage over the same input produces the same output and changes nothing else.
- **Measure the assumptions the design rests on.** Volume budgets, churn rates and rebuild costs are
  all load-bearing, and all of them can drift without warning. A number nothing is watching is a
  number that will be wrong quietly.
- **Local and experiment-friendly.** Processors run on a laptop against real artifacts. Anything
  that can only be exercised by deploying is harder to be right about.

## Working practices

- **Capture first, ask questions later.** We don't need an answer for every property up front. Push
  more data through before locking a decision in — there are landmines everywhere, and the archival
  back-catalogue is not even in the picture yet.
- **Dropped fields are documented drops.** Anything excluded from a canonical shape stays declared
  in the raw schema with a comment saying why (always-null, derivable, OR-internal wiring,
  marketing copy). The decision is visible at the boundary, not silently absent.
- **Never claim above the level of the evidence.** Endpoints override provider data policy, so no
  provider-level behavioural claim is trustworthy — the honest aggregate is "…on all of their
  endpoints", derived in Layer 2. Same logic anywhere an override exists.
- **Don't code paths for exotic upstream categories.** Providers charge however they want and
  OpenRouter models it as best it can; so do we. No special-casing one strange SKU — carry the
  labelled representation instead.
- **Verify hypotheses against a whole pass before acting.** Every "X is always Y" in these docs was
  checked across every scope and endpoint in a pass before being relied on, and the invariants that
  matter get enforced in code (throw on divergent model copies, on duplicate ids).
- **Platform first, mechanisms last.** Reach for what Cloudflare already gives us (LIST, bindings,
  the REST client, scoped tokens) before inventing indexes, manifests or coordination state. A
  built-in we outgrow is cheap to replace; an invented mechanism we outgrow is a migration.
- **Cheap disposable analysis tools over cleverness.** Slicing a pass into per-modality raw files
  took minutes and made the pricing families obvious. Prefer that over speculative abstraction.
- **Write the nuances down.** The knowledgebase exists so the next person (or Claude) doesn't need
  the current holder's head — facts, figures, landmines and open questions, annotated inline.
- **No big-bang.** The existing system keeps running; the new one runs in shadow until its derived
  layer earns trust. Trust is earned by reproducing something the current app already serves and
  comparing, not by inspection.
