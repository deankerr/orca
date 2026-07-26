// oxlint-disable sort-keys -- declaration order is the stored column order.

// * The catalog listing, reduced to the one thing it is evidence of: does this model variant slug
// * have at least one endpoint right now.
// *
// * Upstream's catalog contains OR's ENTIRE model history — 815 entries, 374 of them with no
// * endpoints at all (gpt-3.5-turbo-0125, claude-instant-1…). A model with zero endpoints 404s on
// * the stats request, and ⚠️ that 404 means "zero endpoints now", not "gone". Without this
// * listing there is no way to tell a withdrawn model from one still listed and unserved, so the
// * distinction gets guessed — and the guess is always the destructive one.
// *
// * It is cheap (one boolean per slug, changing rarely) and it is currently computed during
// * canonicalization and thrown away. Shipping it as a canonical output is the smallest change
// * that makes close-out honest.
import * as Schema from 'effect/Schema'

import { Bit, bit, columnsOf } from './lanes.ts'
import type { Lane } from './lanes.ts'

// * `~`-prefixed alias slugs (`~openai/gpt-latest`) are router pointers, not capturable models,
// * and never reach here. Keyed by the endpoint's variant slug where one exists, so `x/y:free`
// * and `x/y` stay distinct.
export const CatalogRow = Schema.Struct({
  variant_slug: Schema.String,
  has_endpoints: Bit,
})
export type CatalogRow = Schema.Schema.Type<typeof CatalogRow>

export const CATALOG: Lane = {
  table: 'catalog_versions',
  kind: 'versions',
  keys: ['variant_slug'],
  columns: columnsOf(CatalogRow),
  // * one request returns the whole listing, so absence from it is evidence in its own right —
  // * a slug that stopped being listed really has been withdrawn, regardless of how the
  // * per-scope endpoint requests went
  closeOut: { on: 'listing' },
}

export const toCatalogRows = (catalog: Record<string, boolean>): CatalogRow[] =>
  Object.entries(catalog).map(([variant_slug, has_endpoints]) => ({
    variant_slug,
    has_endpoints: bit(has_endpoints),
  }))
