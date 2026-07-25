// * Local driver for the prototype: reads mirrored Layer 0 passes, runs them through the real
// * Layer 1 canonicalizers, and POSTs each one to the store in captured_at order.
// *
// * This is scaffolding, not the design. In the real pipeline the Engine reads canonical
// * artifacts from R2 itself; until that's decided, a laptop pushing passes at a locally-running
// * Worker is enough to get the whole thing moving and to answer the schema questions.
// *
// * Prerequisites: `bun run mirror` in apps/capture (puts passes in packages/processes/input/raw),
// * and `bun run dev` here in another terminal.
// * Run: bun run load [--passes N] [--from <captured_at>] [--url http://localhost:1338]
import { parseArgs } from 'node:util'

import { canonicalizeEndpoints } from '@orca/processes/canonicalize/endpoints.ts'
import { canonicalizeModels } from '@orca/processes/canonicalize/models.ts'
import { mirroredPasses, readPass } from '@orca/processes/canonicalize/pass.ts'
import { canonicalizeProviders } from '@orca/processes/canonicalize/providers.ts'
import * as Effect from 'effect/Effect'
import * as Logger from 'effect/Logger'
import * as Schema from 'effect/Schema'

const { values } = parseArgs({
  options: {
    from: { type: 'string' },
    passes: { type: 'string' },
    url: { default: 'http://localhost:1338', type: 'string' },
  },
})

// * everything a pass observation carries that the store cares about; the rest of the scope
// * (its endpoints, its model copy) is canonicalized separately
const Scope = Schema.Struct({
  error: Schema.optional(Schema.String),
  permaslug: Schema.String,
  slug: Schema.String,
  status: Schema.optional(Schema.Number),
  variant: Schema.optional(Schema.String),
})
const decodeScope = Schema.decodeUnknownEffect(Scope)

const post = (body: string) =>
  Effect.promise(async () => {
    const response = await fetch(`${values.url}/ingest`, {
      body,
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    return { ok: response.ok, status: response.status, text: await response.text() }
  })

const program = Effect.gen(function* load() {
  const all = mirroredPasses()
  const fromIndex = values.from === undefined ? 0 : all.indexOf(values.from)
  if (fromIndex < 0) {
    yield* Effect.die(`pass ${values.from} is not mirrored`)
  }
  const selected = all
    .slice(fromIndex)
    .slice(0, values.passes === undefined ? undefined : Number(values.passes))
  yield* Effect.log(
    `loading ${selected.length} of ${all.length} mirrored passes into ${values.url}`,
  )

  for (const [index, captured_at] of selected.entries()) {
    yield* Effect.gen(function* one() {
      const pass = yield* Effect.promise(async () => await readPass(captured_at))
      // oxlint-disable-next-line unicorn/no-array-for-each, unicorn/no-array-method-this-argument -- Effect.forEach is Effect's traversal combinator; its second argument is the effectful function, not a thisArg
      const observations = yield* Effect.forEach(pass.scopes, (scope) => decodeScope(scope))

      const body = JSON.stringify({
        captured_at,
        endpoints: canonicalizeEndpoints(pass.scopes.flatMap((scope) => scope.endpoints)),
        // * a scope that returned 404 carries no model copy — nothing to canonicalize from it
        models: canonicalizeModels(
          pass.scopes.map((scope) => scope.model).filter((model) => model !== null),
        ),
        observations,
        providers: canonicalizeProviders(pass.providers),
      })

      const response = yield* post(body)
      if (!response.ok) {
        yield* Effect.die(`ingest ${captured_at} failed ${response.status}: ${response.text}`)
      }
      yield* Effect.log(
        `${captured_at} [${index + 1}/${selected.length}] ${Math.round(body.length / 1024)} KiB → ${response.text}`,
      )
    }).pipe(Effect.withLogSpan('pass'))
  }
}).pipe(Effect.withLogSpan('load'))

await program.pipe(Effect.provide(Logger.layer([Logger.consolePretty()])), Effect.runPromise)
