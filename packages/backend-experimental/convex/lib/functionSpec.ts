import type { ArgsArrayForOptionalValidator, DefaultArgsForOptionalValidator } from 'convex/server'
import type { PropertyValidators, Validator } from 'convex/values'

import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server'

type RequiredValidator = Validator<any, 'required', any>
type FunctionArgsValidator = PropertyValidators | RequiredValidator
type FunctionReturnsValidator = PropertyValidators | RequiredValidator | undefined

export type FunctionSpec<
  Ctx,
  ArgsValidator extends FunctionArgsValidator,
  ReturnsValidator extends FunctionReturnsValidator = undefined,
  ReturnValue = any,
  OneOrZeroArgs extends ArgsArrayForOptionalValidator<ArgsValidator> =
    DefaultArgsForOptionalValidator<ArgsValidator>,
> = {
  args: ArgsValidator
  returns?: ReturnsValidator
  handler: (ctx: Ctx, ...args: OneOrZeroArgs) => ReturnValue
}

// Preserve Convex's args-to-handler inference for reusable function specs that
// can either be called directly or passed into query/mutation/action builders.
function createFunctionSpecBuilder<Ctx>() {
  function defineFunctionSpec<
    ArgsValidator extends FunctionArgsValidator,
    ReturnsValidator extends FunctionReturnsValidator = undefined,
    ReturnValue = any,
    OneOrZeroArgs extends ArgsArrayForOptionalValidator<ArgsValidator> =
      DefaultArgsForOptionalValidator<ArgsValidator>,
  >(definition: FunctionSpec<Ctx, ArgsValidator, ReturnsValidator, ReturnValue, OneOrZeroArgs>) {
    return definition
  }

  return defineFunctionSpec
}

export const defineQuerySpec = createFunctionSpecBuilder<QueryCtx>()
export const defineMutationSpec = createFunctionSpecBuilder<MutationCtx>()
export const defineActionSpec = createFunctionSpecBuilder<ActionCtx>()
