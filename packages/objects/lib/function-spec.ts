import type { FunctionReference, FunctionType } from 'convex/server'
import type { Infer, ObjectType, PropertyValidators, Validator } from 'convex/values'

/** A plain operation that can also be passed to a Convex function builder. */
export function defineFunctionSpec<Ctx>() {
  return <
    Args extends PropertyValidators,
    Returns extends Validator<unknown, 'required', string>,
    Result extends Infer<Returns> | Promise<Infer<Returns>>,
  >(definition: {
    args: Args
    returns: Returns
    handler: (ctx: Ctx, args: ObjectType<Args>) => Result
  }) => definition
}

/** Derive the wire contract from validators, independently of generated app references. */
export type ReferenceFor<
  Kind extends FunctionType,
  Spec extends { args: PropertyValidators; returns: Validator<unknown, 'required', string> },
> = FunctionReference<Kind, 'internal', ObjectType<Spec['args']>, Infer<Spec['returns']>>

/** Publish direct functions and separate Convex registration definitions from one declaration. */
export function exposeOperations<
  Definitions extends Record<string, { handler: (...args: never[]) => unknown }>,
>(definitions: Definitions & { definitions?: never }) {
  const functions = Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => [name, definition.handler]),
  )
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Each output key contains the original definition's handler; no wrapper changes invocation.
  return { ...functions, definitions } as {
    [Name in keyof Definitions]: Definitions[Name]['handler']
  } & { definitions: Definitions }
}
