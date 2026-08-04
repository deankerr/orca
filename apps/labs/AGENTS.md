# @orca/labs

Labs is a collection of local data programs and the reusable transformations they orchestrate.

## Programs and helpers

- Every user-runnable workflow lives in `src/programs/` and uses the `*.program.ts` suffix.
- Name programs with an action followed by the artifact or product concept, for example
  `build-database.program.ts`.
- Co-locate a program's typed options, Effect orchestration, CLI flags, validation, and command
  handler. `src/cli.ts` only groups commands and defines the root command.
- Keep pure transformations, SQL operations, artifact readers, and renderers in their domain
  directories. A helper file must not quietly become another runnable program.

## Reading Effect code

- Add JSDoc to exported programs and reusable helpers. Document their contract, output, failure
  behavior, and non-obvious invariants; do not restate the implementation.
- Use comments for intent, policy, or constraints that names and types cannot preserve by
  themselves. Prefer a clearer name or an extracted function over a narration comment.
- In long orchestration functions, use short section labels for genuine lifecycle phases such as
  `Resolve input`, `Prepare output`, `Process`, and `Publish`. Extract a phase when it has an
  independently useful name or test.
- Separate conceptual groups of declarations and effects with a blank line. Keep statements that
  form one operation visually dense.
- Keep each function at one level of abstraction. Top-level programs should read as an ordered
  account of the workflow rather than expose low-level encoding, filesystem, or SQL details.

## Generated work

- `.labs-work/` is the default disposable workspace. Never rely on a generated artifact that
  cannot be identified by its report or rebuilt from its recorded input.
- An artifact is eligible for implicit `latest` resolution only after its report records a
  successful run and its published path exists.
