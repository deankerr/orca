import { v } from 'convex/values'
import type { ObjectType, PropertyValidators, VObject } from 'convex/values'

/**
 * Creates a schema-aware helper for a single Convex table, providing typed
 * access to its validators.
 *
 * This function takes a table name and a `v.object` validator and returns a
 * helper object with typed validators for the table's content, the full
 * document (including system fields), and individual system fields.
 *
 * @param tableName - The name of the table.
 * @param validator - The `v.object` validator for the table.
 * @returns An object containing:
 *  - `name`: The name of the table.
 *  - `validator`: The original validator for the table's content.
 *  - `doc`: A `v.object` validator that includes system fields.
 *  - `systemFields`: An object with validators for the system fields.
 *  - `_id`: A `v.id(tableName)` validator for creating typed ID references.
 *
 * @example
 * ```ts
 * import { defineTable } from "convex/server";
 * import { v } from "convex/values";
 *
 * export const usersValidator = v.object({
 *   name: v.string(),
 *   email: v.string(),
 * });
 *
 * export const vUsers = createVTable("users", usersValidator);
 *
 * // Use in a mutation:
 * export const updateUser = mutation({
 *   args: {
 *     id: vUsers._id,
 *     patch: v.object(vUsers.validator.fields),
 *   },
 *   // ...
 * });
 * ```
 */
export function createTableVHelper<TableName extends string, Fields extends PropertyValidators>(
  tableName: TableName,
  validator: VObject<ObjectType<Fields>, Fields, 'required', any>,
) {
  const systemFields = {
    _id: v.id(tableName),
    _creationTime: v.number(),
  }

  const doc = v.object({
    ...validator.fields,
    ...systemFields,
  })

  return {
    name: tableName,
    validator,
    doc,
    systemFields,
    _id: systemFields._id,
  }
}
