import nacl from 'tweetnacl'

import { internal } from '../_generated/api'
import type { ActionCtx } from '../_generated/server'
import { SUBSCRIPTIONS_PER_USER_LIMIT } from './subscriptions'

// Discord interaction types
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
} as const

// Discord response types
const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
} as const

// Web-compatible hex encoding (no Buffer in Convex runtime)
function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

// Verify Discord's Ed25519 signature
export function verifyDiscordSignature(args: {
  signature: string
  timestamp: string
  body: string
  publicKey: string
}): boolean {
  const { signature, timestamp, body, publicKey } = args

  const message = new TextEncoder().encode(timestamp + body)
  const sig = fromHex(signature)
  const key = fromHex(publicKey)

  return nacl.sign.detached.verify(message, sig, key)
}

// Discord integration owner types
// "0" = guild install, "1" = user install
type AuthorizingIntegrationOwners = {
  '0'?: string // guild_id if guild-installed
  '1'?: string // user_id if user-installed
}

// Discord interaction payload (minimal typing for what we need)
type DiscordInteraction = {
  type: number
  id: string
  token: string
  guild_id?: string
  channel_id?: string
  // Present when app has install contexts configured
  authorizing_integration_owners?: AuthorizingIntegrationOwners
  member?: {
    user: {
      id: string
      username: string
    }
  }
  user?: {
    id: string
    username: string
  }
  data?: {
    id: string
    name: string
    options?: Array<{
      name: string
      value: string | number | boolean
      type: number
      options?: Array<{
        name: string
        value: string | number | boolean
        type: number
      }>
    }>
  }
}

// Response helpers
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function pongResponse(): Response {
  return jsonResponse({ type: InteractionResponseType.PONG })
}

function messageResponse(content: string, ephemeral = false): Response {
  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      flags: ephemeral ? 64 : 0,
    },
  })
}

function embedResponse(
  embed: {
    title?: string
    description?: string
    color?: number
    fields?: Array<{ name: string; value: string; inline?: boolean }>
    footer?: { text: string }
  },
  ephemeral = false,
): Response {
  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [embed],
      flags: ephemeral ? 64 : 0,
    },
  })
}

// Get user ID from interaction
function getUserId(interaction: DiscordInteraction): string | null {
  return interaction.member?.user.id ?? interaction.user?.id ?? null
}

// Get subcommand and options from interaction
function parseSubcommand(interaction: DiscordInteraction): {
  subcommand: string | null
  options: Record<string, string | number | boolean>
} {
  const topOptions = interaction.data?.options ?? []
  const firstOption = topOptions[0]

  if (!firstOption) {
    return { subcommand: null, options: {} }
  }

  // Subcommands have type 1
  if (firstOption.type === 1) {
    const options: Record<string, string | number | boolean> = {}
    for (const opt of firstOption.options ?? []) {
      options[opt.name] = opt.value
    }
    return { subcommand: firstOption.name, options }
  }

  return { subcommand: null, options: {} }
}

// Determine if this is a DM context
function isDMContext(interaction: DiscordInteraction): boolean {
  // DM interactions have no guild_id
  return !interaction.guild_id
}

// Check if this is a user-installed app being used in a guild channel
// (user can run commands but bot can't post to the channel)
function isUserInstallInGuild(interaction: DiscordInteraction): boolean {
  const owners = interaction.authorizing_integration_owners
  if (!owners) return false
  // Has guild_id but authorized via user install (key "1"), not guild install (key "0")
  return !!interaction.guild_id && !!owners['1'] && !owners['0']
}

// Command handlers
async function handleSubscribe(
  ctx: ActionCtx,
  interaction: DiscordInteraction,
  options: Record<string, string | number | boolean>,
): Promise<Response> {
  const userId = getUserId(interaction)
  if (!userId) {
    return messageResponse('Unable to identify user.', true)
  }

  const pattern = options.pattern as string | undefined
  if (!pattern) {
    return messageResponse('Please provide a pattern. Example: `/orca subscribe anthropic/*`', true)
  }

  // Check for user-install in guild context (bot can't post to channel)
  if (isUserInstallInGuild(interaction)) {
    return messageResponse(
      "You're using a personal app install in a server channel. The bot can't post here.\n\n" +
        '**Options:**\n' +
        '• Use `/orca subscribe` in **DMs** for personal alerts\n' +
        '• Have a server admin add the bot to this server for channel alerts',
      true,
    )
  }

  const isDM = isDMContext(interaction)

  if (isDM) {
    // DM subscription
    const result = await ctx.runMutation(internal.discord.subscriptions.create, {
      input: { type: 'dm', user_id: userId, pattern },
    })

    if (result === 'limit') {
      return messageResponse(
        `You have reached the limit of ${SUBSCRIPTIONS_PER_USER_LIMIT} subscriptions. Delete one first with \`/orca delete\`.`,
        true,
      )
    }

    if (result === 'exists') {
      return messageResponse(
        `Pattern \`${pattern}\` already exists in your DM subscriptions.`,
        true,
      )
    }

    return embedResponse(
      {
        title: 'DM Subscription Created',
        description: `You will receive DM alerts for changes matching \`${pattern}\`.`,
        color: 0x22c55e, // green
      },
      false,
    )
  } else {
    // Channel subscription
    const channelId = interaction.channel_id
    const guildId = interaction.guild_id

    if (!channelId || !guildId) {
      return messageResponse('Unable to identify channel.', true)
    }

    const result = await ctx.runMutation(internal.discord.subscriptions.create, {
      input: {
        type: 'channel',
        guild_id: guildId,
        channel_id: channelId,
        user_id: userId,
        pattern,
      },
    })

    if (result === 'limit') {
      return messageResponse(
        `You have reached the limit of ${SUBSCRIPTIONS_PER_USER_LIMIT} subscriptions. Delete one first with \`/orca delete\`.`,
        true,
      )
    }

    if (result === 'exists') {
      return messageResponse(`Pattern \`${pattern}\` already exists in this channel.`, true)
    }

    return embedResponse(
      {
        title: 'Subscription Created',
        description: `This channel will now receive alerts for changes matching \`${pattern}\`.`,
        color: 0x22c55e, // green
      },
      false,
    )
  }
}

async function handleList(ctx: ActionCtx, interaction: DiscordInteraction): Promise<Response> {
  const isDM = isDMContext(interaction)
  const userId = getUserId(interaction)

  if (isDM) {
    if (!userId) {
      return messageResponse('Unable to identify user.', true)
    }

    const subs = await ctx.runQuery(internal.discord.subscriptions.list, {
      context: { type: 'dm', user_id: userId },
    })

    if (subs.length === 0) {
      return messageResponse(
        'No DM subscriptions. Create one with `/orca subscribe <pattern>`.',
        true,
      )
    }

    const description = subs.map((sub, i) => `${i + 1}. \`${sub.pattern}\``).join('\n')

    return embedResponse(
      {
        title: 'Your DM Subscriptions',
        description,
        color: 0x3b82f6, // blue
        footer: { text: `${subs.length} subscriptions` },
      },
      true,
    )
  } else {
    const channelId = interaction.channel_id

    if (!channelId) {
      return messageResponse('Unable to identify channel.', true)
    }

    const subs = await ctx.runQuery(internal.discord.subscriptions.list, {
      context: { type: 'channel', channel_id: channelId },
    })

    if (subs.length === 0) {
      return messageResponse(
        'No subscriptions in this channel. Create one with `/orca subscribe <pattern>`.',
        true,
      )
    }

    const description = subs.map((sub, i) => `${i + 1}. \`${sub.pattern}\``).join('\n')

    return embedResponse(
      {
        title: 'Channel Subscriptions',
        description,
        color: 0x3b82f6, // blue
        footer: { text: `${subs.length} subscriptions` },
      },
      true,
    )
  }
}

async function handleDelete(
  ctx: ActionCtx,
  interaction: DiscordInteraction,
  options: Record<string, string | number | boolean>,
): Promise<Response> {
  const isDM = isDMContext(interaction)
  const userId = getUserId(interaction)

  const pattern = options.pattern as string | undefined
  if (!pattern) {
    return messageResponse(
      'Please provide a pattern to delete. Use `/orca list` to see patterns.',
      true,
    )
  }

  if (isDM) {
    if (!userId) {
      return messageResponse('Unable to identify user.', true)
    }

    const deleted = await ctx.runMutation(internal.discord.subscriptions.remove, {
      context: { type: 'dm', user_id: userId },
      pattern,
    })

    if (!deleted) {
      return messageResponse(`Pattern \`${pattern}\` not found in your DM subscriptions.`, true)
    }

    return embedResponse(
      {
        title: 'Subscription Deleted',
        description: `Removed subscription for pattern \`${pattern}\`.`,
        color: 0xef4444, // red
      },
      false,
    )
  } else {
    const channelId = interaction.channel_id

    if (!channelId) {
      return messageResponse('Unable to identify channel.', true)
    }

    const deleted = await ctx.runMutation(internal.discord.subscriptions.remove, {
      context: { type: 'channel', channel_id: channelId },
      pattern,
    })

    if (!deleted) {
      return messageResponse(`Pattern \`${pattern}\` not found in this channel.`, true)
    }

    return embedResponse(
      {
        title: 'Subscription Deleted',
        description: `Removed subscription for pattern \`${pattern}\`.`,
        color: 0xef4444, // red
      },
      false,
    )
  }
}

async function handleHelp(): Promise<Response> {
  return embedResponse(
    {
      title: 'ORCA Alert Bot',
      description:
        'Get notified when AI models and endpoints change on OpenRouter.\n\nUse in a **server channel** to subscribe the channel, or in **DMs** to get personal alerts.',
      color: 0x8b5cf6, // purple
      fields: [
        {
          name: '/orca subscribe <pattern>',
          value:
            'Create a subscription. Pattern examples:\n• `*` - all changes\n• `anthropic/` - Anthropic models\n• `llama` - models containing "llama"\n• `:free` - free tier models',
          inline: false,
        },
        {
          name: '/orca list',
          value: 'Show subscriptions (channel or DM based on context).',
          inline: false,
        },
        {
          name: '/orca delete <pattern>',
          value: 'Delete a subscription by its pattern.',
          inline: false,
        },
      ],
      footer: { text: 'Powered by ORCA - orb.town' },
    },
    true,
  )
}

// Handle incoming Discord interaction
export async function handleInteraction(
  ctx: ActionCtx,
  args: {
    body: string
    signature: string
    timestamp: string
    publicKey: string
  },
): Promise<Response> {
  const { body, signature, timestamp, publicKey } = args

  // Verify signature
  if (!verifyDiscordSignature({ signature, timestamp, body, publicKey })) {
    return new Response('Invalid signature', { status: 401 })
  }

  const interaction: DiscordInteraction = JSON.parse(body)

  // Handle PING (Discord verification)
  if (interaction.type === InteractionType.PING) {
    console.log('[discord:interactions] PING received')
    return pongResponse()
  }

  // Handle slash commands
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const commandName = interaction.data?.name

    console.log('[discord:interactions] command received', {
      command: commandName,
      channel_id: interaction.channel_id,
      guild_id: interaction.guild_id,
    })

    if (commandName !== 'orca') {
      return messageResponse(`Unknown command: ${commandName}`, true)
    }

    const { subcommand, options } = parseSubcommand(interaction)

    switch (subcommand) {
      case 'subscribe':
        return handleSubscribe(ctx, interaction, options)
      case 'list':
        return handleList(ctx, interaction)
      case 'delete':
        return handleDelete(ctx, interaction, options)
      case 'help':
        return handleHelp()
      default:
        return handleHelp()
    }
  }

  console.log('[discord:interactions] unhandled interaction type', {
    type: interaction.type,
  })
  return new Response('Unhandled interaction type', { status: 400 })
}
