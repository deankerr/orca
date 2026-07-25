import { z } from 'zod'

// * raw provider_info exactly as upstream ships it — strict, so any schema drift in a new
// * pass fails loudly here instead of silently passing fields through
const RawProvider = z.strictObject({
  // * OR-internal wiring (which adapter class serves this provider) — not a provider fact
  adapterName: z.string(),
  baseUrl: z.string(),
  byokEnabled: z.boolean(),
  // * the behavioural fields (training, retainsPrompts, …) are deliberately not carried into
  // * the canonical provider: endpoints override them, so a provider-level claim like
  // * "doesn't retain prompts" is never trustworthy — those are endpoint-centric. Only the
  // * policy document URLs belong here (verified identical across every endpoint of a provider).
  dataPolicy: z.strictObject({
    canPublish: z.boolean(),
    privacyPolicyURL: z.string().optional(),
    requiresUserIDs: z.boolean(),
    retainsPrompts: z.boolean(),
    retentionDays: z.number().optional(),
    termsOfServiceURL: z.string().optional(),
    training: z.boolean(),
    trainingOpenRouter: z.boolean(),
  }),
  datacenters: z.array(z.string()).optional(),
  displayName: z.string(),
  // * OpenRouter org bookkeeping, mostly "{}" placeholder strings — no signal
  editors: z.array(z.string()),
  hasChatCompletions: z.boolean(),
  hasCompletions: z.boolean(),
  // * absent on ~18 providers, never null — normalized to null in the canonical shape
  headquarters: z.string().optional(),
  // * className is frontend styling for dark mode; we only keep the asset url
  icon: z.strictObject({ className: z.string().optional(), url: z.string() }),
  isAbortable: z.boolean(),
  moderationRequired: z.boolean(),
  name: z.string(),
  owners: z.array(z.string()),
  pricingStrategy: z.string(),
  sendClientIp: z.boolean(),
  slug: z.string(),
  statusPageUrl: z.string().nullable(),
})

// * canonical provider: flat and snake_cased for SQL storage. Facts we're prepared to
// * claim about a provider — identity, location, capability flags, and billing family.
export const Provider = z.strictObject({
  byok_enabled: z.boolean(),
  datacenters: z.array(z.string()),
  display_name: z.string(),
  has_chat_completions: z.boolean(),
  has_completions: z.boolean(),
  headquarters: z.string().nullable(),
  icon_url: z.string(),
  is_abortable: z.boolean(),
  moderation_required: z.boolean(),
  name: z.string(),
  pricing_strategy: z.string(),
  privacy_policy_url: z.string().nullable(),
  send_client_ip: z.boolean(),
  slug: z.string(),
  status_page_url: z.string().nullable(),
  terms_of_service_url: z.string().nullable(),
})
export type Provider = z.infer<typeof Provider>

export function canonicalizeProviders(raws: unknown[]): Provider[] {
  return raws
    .map((raw) => {
      const p = RawProvider.parse(raw)
      return Provider.parse({
        byok_enabled: p.byokEnabled,
        datacenters: p.datacenters ?? [],
        display_name: p.displayName,
        has_chat_completions: p.hasChatCompletions,
        has_completions: p.hasCompletions,
        headquarters: p.headquarters ?? null,
        icon_url: p.icon.url,
        is_abortable: p.isAbortable,
        moderation_required: p.moderationRequired,
        name: p.name,
        pricing_strategy: p.pricingStrategy,
        privacy_policy_url: p.dataPolicy.privacyPolicyURL ?? null,
        send_client_ip: p.sendClientIp,
        slug: p.slug,
        status_page_url: p.statusPageUrl,
        terms_of_service_url: p.dataPolicy.termsOfServiceURL ?? null,
      })
    })
    .toSorted((a, b) => a.slug.localeCompare(b.slug))
}
