import type {
  DataModelFromSchemaDefinition,
  GenericDatabaseWriter,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericSchema,
  QueryInitializer,
  SchemaDefinition,
} from 'convex/server'
import type { GenericId, Infer, ObjectType, PropertyValidators, Validator } from 'convex/values'

/** One statically known schema key, not a widened string or union of keys. */
export type LiteralName<Name extends string, Whole = Name> = string extends Name
  ? never
  : Name extends Whole
    ? [Whole] extends [Name]
      ? Name
      : never
    : never

type Model<
  Name extends string,
  Table extends GenericSchema[string],
> = DataModelFromSchemaDefinition<SchemaDefinition<Record<Name, Table>, true>>

// Resolve fields/indexes without erasing the configured table's ID brand, so
// operations can call one another directly through the same context.
type ImplementationModel<Name extends string, Table extends GenericSchema[string]> = Record<
  string,
  Omit<Model<string, Table>[string], 'document'> & {
    document: Omit<Model<string, Table>[string]['document'], '_id'> & { _id: GenericId<Name> }
  }
>

// Specializing query verifies the installed document and indexes. Convex's generic
// query method alone is structurally assignable even for incompatible schemas.
type InstalledReader<Name extends string, Table extends GenericSchema[string]> = {
  query: (table: Name) => QueryInitializer<ImplementationModel<Name, Table>[string]>
}
type InstalledQueryContext<Name extends string, Table extends GenericSchema[string]> = Omit<
  GenericQueryCtx<GenericDataModel>,
  'db'
> & { db: InstalledReader<Name, Table> }
type InstalledMutationContext<Name extends string, Table extends GenericSchema[string]> = Omit<
  GenericMutationCtx<GenericDataModel>,
  'db'
> & {
  db: GenericDatabaseWriter<Model<Name, Table>> & InstalledReader<Name, Table>
}

/** Same handler at runtime; only the implementation's table-name view is widened. */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Contexts are supplied by the table module, not inferred from a handler; both sides of the typing bridge must stay configurable.
function operationBuilder<ImplementationContext, InstalledContext>() {
  return <
    Args extends PropertyValidators,
    Returns extends Validator<unknown, 'required', string>,
    Result extends Infer<Returns> | Promise<Infer<Returns>>,
  >(definition: {
    args: Args
    returns: Returns
    handler: (ctx: ImplementationContext, args: ObjectType<Args>) => Result
  }) => ({
    ...definition,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The installed schema is checked at the public seam; implementation accesses only the configured table and system tables.
    handler: definition.handler as unknown as (
      ctx: InstalledContext,
      args: ObjectType<Args>,
    ) => Result,
  })
}

/** Full standard contexts for authors; named-schema compatibility checks for consumers. */
export function defineTableModule<const Name extends string, Table extends GenericSchema[string]>(
  name: Name & LiteralName<Name>,
  table: Table,
) {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The sole computed key is exactly Name.
  const tables = { [name]: table } as Record<Name, Table>
  return {
    readOperation: operationBuilder<
      GenericQueryCtx<ImplementationModel<Name, Table>>,
      InstalledQueryContext<Name, Table>
    >(),
    tables,
    writeOperation: operationBuilder<
      GenericMutationCtx<ImplementationModel<Name, Table>>,
      InstalledMutationContext<Name, Table>
    >(),
  }
}
