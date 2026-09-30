import { ConvexError, v } from 'convex/values'

import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { env, internalAction } from '../_generated/server'
import type { ActionCtx } from '../_generated/server'
import { renderDiscord } from './eventRenderers/discord'

/** Operator-only, single-attempt delivery. Repeating the call posts the event again. */
export const send = internalAction({
  args: { event_id: v.id('v4_events') },
  returns: v.union(v.literal('sent'), v.literal('skipped')),
  handler: async (ctx, { event_id }) => await sendEvent(ctx, event_id),
})

/** Temporary dev gallery: replay the same 25 examples in order, pausing one second between requests. */
export const sendExamples = internalAction({
  args: {},
  returns: v.object({ sent: v.number(), skipped: v.number() }),
  handler: async (ctx) => {
    const counts = { sent: 0, skipped: 0 }

    for (const [index, event_id] of exampleEventIds.entries()) {
      if (index > 0) {
        // oxlint-disable-next-line promise/avoid-new -- Convex timers expose callbacks; this is a fixed pause in a temporary operator action.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 1000)
        })
      }

      const result = await sendEvent(ctx, event_id)
      counts[result] += 1
    }

    return counts
  },
})

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Captured v4_events document IDs from the dev gallery; each query validates the ID.
const exampleEventIds = [
  'rs7ezvw1fp56wx91f5eqxwfxwn8fdtwm', // Model added
  'rs70y89xd3h23m1rs1qmn72spn8fcsew', // Model removed
  'rs70ymeve7szjtzjw0nbvxrnws8fc22a', // Endpoint added
  'rs781dhv61rx355bbhvtbbnfhd8fdq6r', // Endpoint removed
  'rs789hap2brbzp98wg44yg7tyn8fc9d9', // Provider added
  'rs7ae0dzk3frrsw4sbdnt2tvf18fd3r1', // Provider removed
  'rs76qdy65ws30brh3q2a2qqs098fdvqh', // Provider renamed
  'rs7dvy4sj93da0bh0psk25djas8fdvd8', // Description rewritten
  'rs75s6k95gwzdphxcdy5pgw86h8fcs00', // Description expanded
  'rs747jm0d99s5tq9xsxegnc1kn8fdk2h', // Warning added
  'rs7cx62nre7rbtyxrq9s9znzad8fdw5k', // Warning cleared and modality removed
  'rs751r0zk5v3tzqspxpt6zv98n8fcr4e', // Parameters added
  'rs7205p8r0b7cp3k6q5rxk7gn18fcrbw', // Parameter removed
  'rs73rrckebsk4cgqbft3mnan018fd78x', // Mandatory reasoning and effort removed
  'rs7e9zb8yvrt69fpdx6eaez01d8fc3g8', // Context and output reduced
  'rs798x0hyz5fmcm5q5c3he24hh8fddpr', // Rate limit cleared
  'rs75s1a231br8jxxp6emsjhr2d8fc9r8', // Rate limit added
  'rs7dbfmcfwpvyfc87mrqf51q1x8fct5e', // Quantization and provider tag changed
  'rs77ecqy4eq81h122kq0sa6rns8fcx2q', // Discount added
  'rs77eq8d10ytb0kfpaxwhqjrs58fcjgd', // Discount removed
  'rs771qjw31tttn4sdfhc3r5m1h8fdpf6', // Discount adjusted
  'rs742zpe2xp5afskfkca0940k58fcrmg', // Cache meter added
  'rs7057mnmbzpmh7994zk3jtt9d8fdw1m', // Cache meter removed
  'rs768gr48a6r90agzka6ccbm098fc1kc', // Completions disabled
  'rs74thqa1dws03j03zaspvw5ad8fc3t2', // Cache write pricing
] as Id<'v4_events'>[]

async function sendEvent(ctx: ActionCtx, event_id: Id<'v4_events'>): Promise<'sent' | 'skipped'> {
  const webhook = env.ORCA_DISCORD_WEBHOOK_URL

  if (webhook === undefined || webhook === '') {
    throw new ConvexError('Set ORCA_DISCORD_WEBHOOK_URL before sending Discord events.')
  }

  const event = await ctx.runQuery(internal.v4.events.query.get, { event_id })

  if (event === null) {
    throw new ConvexError({ message: 'Event not found.', event_id })
  }

  const message = renderDiscord(event, {
    publicUrl: env.ORCA_PUBLIC_URL,
    logoOrigin: env.ENTITY_LOGO_SERVICE_ORIGIN,
  })

  if (message === null) {
    return 'skipped'
  }

  const url = new URL(webhook)
  url.searchParams.set('wait', 'true')

  if (message.components !== undefined) {
    url.searchParams.set('with_components', 'true')
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  })

  if (!response.ok) {
    throw new ConvexError({
      message: 'Discord webhook rejected the event.',
      status: response.status,
    })
  }

  return 'sent'
}
