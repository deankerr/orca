// oxlint-disable sort-keys -- the raw shape mirrors the upstream payload; the canonical shape is
// grouped by what a field is (identity, capability, policy documents).

// * Layer 1 for the provider entity: parse one raw upstream `provider_info`, emit the canonical
// * row. ⚠️ `RawProvider` is STRICT — an unknown key upstream fails loudly here rather than
// * passing through unseen.
// * ⚠️ Read notes/data-architecture/provider-identity.md before touching anything here: upstream
// * flattens three overlapping concepts into strings, and this entity is only the middle one —
// * the `provider_info` records upstream actually ships.
import * as Schema from 'effect/Schema'

// * ── raw ───────────────────────────────────────────────────────────────────────────────────
const RawProvider = Schema.Struct({
  // * OR-internal wiring (which adapter class serves this provider) — not a provider fact
  adapterName: Schema.String,
  baseUrl: Schema.String,
  byokEnabled: Schema.Boolean,
  // * the behavioural fields (training, retainsPrompts, …) are deliberately not carried into the
  // * canonical provider: endpoints override them, so a provider-level claim like "doesn't retain
  // * prompts" is never trustworthy — those are endpoint-centric. Only the policy document URLs
  // * belong here (verified identical across every endpoint of a provider).
  dataPolicy: Schema.Struct({
    canPublish: Schema.Boolean,
    privacyPolicyURL: Schema.optional(Schema.String),
    requiresUserIDs: Schema.Boolean,
    retainsPrompts: Schema.Boolean,
    retentionDays: Schema.optional(Schema.Number),
    termsOfServiceURL: Schema.optional(Schema.String),
    training: Schema.Boolean,
    trainingOpenRouter: Schema.Boolean,
  }),
  datacenters: Schema.optional(Schema.Array(Schema.String)),
  displayName: Schema.String,
  // * OpenRouter org bookkeeping, mostly "{}" placeholder strings — no signal
  editors: Schema.Array(Schema.String),
  hasChatCompletions: Schema.Boolean,
  hasCompletions: Schema.Boolean,
  // * absent on ~18 providers, never null — normalized to null in the canonical shape
  headquarters: Schema.optional(Schema.String),
  // * className is frontend styling for dark mode; we only keep the asset url
  icon: Schema.Struct({ className: Schema.optional(Schema.String), url: Schema.String }),
  isAbortable: Schema.Boolean,
  moderationRequired: Schema.Boolean,
  name: Schema.String,
  owners: Schema.Array(Schema.String),
  pricingStrategy: Schema.String,
  sendClientIp: Schema.Boolean,
  slug: Schema.String,
  statusPageUrl: Schema.NullOr(Schema.String),
})

// * ── canonical ─────────────────────────────────────────────────────────────────────────────
// * The facts we are prepared to claim about a provider — identity, location, capability flags,
// * billing family, and the policy *documents*.
export const Provider = Schema.Struct({
  slug: Schema.String,
  // * ⚠️ the only reliable endpoint → provider join. Upstream's `provider_slug` on an endpoint
  // * frequently matches no provider record, so `name` carries the relationship and its
  // * uniqueness is a load-bearing invariant, not a coincidence.
  name: Schema.String,
  display_name: Schema.String,
  headquarters: Schema.NullOr(Schema.String),
  datacenters: Schema.Array(Schema.String),
  icon_url: Schema.String,

  byok_enabled: Schema.Boolean,
  has_chat_completions: Schema.Boolean,
  has_completions: Schema.Boolean,
  is_abortable: Schema.Boolean,
  moderation_required: Schema.Boolean,
  send_client_ip: Schema.Boolean,
  pricing_strategy: Schema.String,

  status_page_url: Schema.NullOr(Schema.String),
  privacy_policy_url: Schema.NullOr(Schema.String),
  terms_of_service_url: Schema.NullOr(Schema.String),
})
export type Provider = Schema.Schema.Type<typeof Provider>

const decodeRawProvider = Schema.decodeUnknownSync(RawProvider, { onExcessProperty: 'error' })

// * One raw `provider_info` in, one canonical provider out. ⚠️ The same record is embedded in
// * every endpoint the provider serves, so deduping the pass's copies is the caller's job.
export function canonicalizeProvider(raw: unknown): Provider {
  const p = decodeRawProvider(raw)
  return {
    slug: p.slug,
    name: p.name,
    display_name: p.displayName,
    headquarters: p.headquarters ?? null,
    datacenters: p.datacenters ?? [],
    icon_url: p.icon.url,

    byok_enabled: p.byokEnabled,
    has_chat_completions: p.hasChatCompletions,
    has_completions: p.hasCompletions,
    is_abortable: p.isAbortable,
    moderation_required: p.moderationRequired,
    send_client_ip: p.sendClientIp,
    pricing_strategy: p.pricingStrategy,

    status_page_url: p.statusPageUrl,
    privacy_policy_url: p.dataPolicy.privacyPolicyURL ?? null,
    terms_of_service_url: p.dataPolicy.termsOfServiceURL ?? null,
  }
}
