# @orca/labs

Labs is a collection of local data programs and the reusable transformations they orchestrate.

@notes/now.md
@CONTEXT.md

### Programs and helpers

- Co-locate a program's typed options, Effect orchestration, CLI flags, validation, and command
  handler.
- Programs should compose reusable elements such as pure transformation functions, and I/O.

### Writing readable Effect code

- Add JSDoc to exported programs and reusable helpers. Document their contract, output, failure
  behavior, and non-obvious invariants; do not restate the implementation.
- Use comments for intent, policy, or constraints that names and types cannot preserve by
  themselves.
- Effect code is visually busy; separate conceptual groups of declarations and effects with a blank line where possible.

### Generated work

- `.labs-work/` is the default workspace.
- Default to using the latest successful artifact input.
