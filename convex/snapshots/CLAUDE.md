# Processes

- The ideal process has its main functionality exposed as a plain function, which takes any inputs as arguments and returns a result - as close to a pure function as possible.
  - It should NOT take a `ctx: ActionCtx` param. This way we can run and test the process without it needing to be run in the convex runtime.
- An outer layer which calls the main function is generally a convex action, which can run any queries/mutations necessary for inputs, process them, then persist the outputs.
  - Actions should generally not call other actions directly, and should be kept as simple as possible to reduce code duplication.
  - Reusable parts that can be shared helpers should be written as an external helper function that takes `ctx: ActionCtx` as the first arg.
- The action may be run from the dashboard, by a cron, or scheduled from another action.
- By making our process steps modular, we will be able to compose them in actions to allow us to reconfigure our systems when needed.

## Snapshots

- Use the `paginateAndProcess` helper (`../shared.ts`) to walk over many documents in a table sequentially.
- Decompressed archive bundles can be very large - around ~20MB. A maximum of two decompressed bundles can be handled at once (for comparison).
  - Ensure most work is done in helper functions so that the bundle data is properly garbage collected when it is no longer needed.
