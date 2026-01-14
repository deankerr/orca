import { InteractionType, type APIInteraction } from 'discord-api-types/v10'
import { InteractionResponseFlags, InteractionResponseType, verifyKey } from 'discord-interactions'

import { internal } from '../_generated/api'
import type { ActionCtx } from '../_generated/server'
import { COLORS, PATTERN_MAX_LENGTH, SUBSCRIPTIONS_PER_USER_LIMIT } from './constants'

function pongResponse(): Response {
  return Response.json({ type: InteractionResponseType.PONG })
}

function messageResponse(content: string, ephemeral = false): Response {
  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      flags: ephemeral ? InteractionResponseFlags.EPHEMERAL : 0,
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
  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [embed],
      flags: ephemeral ? InteractionResponseFlags.EPHEMERAL : 0,
    },
  })
}

function getUserId(interaction: APIInteraction): string | null {
  if ('member' in interaction && interaction.member) {
    return interaction.member.user.id
  }
  if ('user' in interaction && interaction.user) {
    return interaction.user.id
  }
  return null
}

function parseSubcommand(interaction: APIInteraction): {
  subcommand: string | null
  options: Record<string, string | number | boolean>
} {
  if (!('data' in interaction) || !interaction.data) {
    return { subcommand: null, options: {} }
  }

  const data = interaction.data
  if (!('options' in data) || !data.options) {
    return { subcommand: null, options: {} }
  }

  const firstOption = data.options[0]
  if (!firstOption) {
    return { subcommand: null, options: {} }
  }

  // Subcommands have type 1
  if (firstOption.type === 1 && 'options' in firstOption) {
    const options: Record<string, string | number | boolean> = {}
    for (const opt of firstOption.options ?? []) {
      if ('value' in opt) {
        options[opt.name] = opt.value as string | number | boolean
      }
    }
    return { subcommand: firstOption.name, options }
  }

  return { subcommand: null, options: {} }
}

function isDMContext(interaction: APIInteraction): boolean {
  return !('guild_id' in interaction) || !interaction.guild_id
}

function isUserInstallInGuild(interaction: APIInteraction): boolean {
  if (!('authorizing_integration_owners' in interaction)) return false
  const owners = interaction.authorizing_integration_owners
  if (!owners) return false
  const hasGuild = 'guild_id' in interaction && !!interaction.guild_id
  // Has guild_id but authorized via user install (key "1"), not guild install (key "0")
  return hasGuild && !!owners['1'] && !owners['0']
}

function getChannelId(interaction: APIInteraction): string | undefined {
  if ('channel_id' in interaction) return interaction.channel_id
  if ('channel' in interaction && interaction.channel) return interaction.channel.id
  return undefined
}

function getGuildId(interaction: APIInteraction): string | undefined {
  if ('guild_id' in interaction) return interaction.guild_id
  return undefined
}

// Only alphanumeric, hyphen, underscore, forward slash, colon
const PATTERN_REGEX = /^[a-zA-Z0-9\-_/:]+$/

function validatePattern(pattern: string): string | null {
  if (pattern.length > PATTERN_MAX_LENGTH) {
    return `Pattern must be ${PATTERN_MAX_LENGTH} characters or less.`
  }

  // Single asterisk is valid (matches all)
  if (pattern === '*') {
    return null
  }

  // Asterisks are only valid as the single "*" pattern
  if (pattern.includes('*')) {
    return 'Wildcards like `gpt*` are not supported. Use `*` for all changes, or a simple pattern like `gpt` to match any slug containing "gpt".'
  }

  if (!PATTERN_REGEX.test(pattern)) {
    return 'Pattern can only contain letters, numbers, hyphens, underscores, forward slashes, and colons.'
  }

  return null
}

async function handleSubscribe(
  ctx: ActionCtx,
  interaction: APIInteraction,
  options: Record<string, string | number | boolean>,
): Promise<Response> {
  const userId = getUserId(interaction)
  if (!userId) {
    return messageResponse('Unable to identify user.', true)
  }

  const pattern = options.pattern as string | undefined
  if (!pattern) {
    return messageResponse('Please provide a pattern. Example: `/orca subscribe anthropic/`', true)
  }

  const validationError = validatePattern(pattern)
  if (validationError) {
    return messageResponse(validationError, true)
  }

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
        color: COLORS.create,
      },
      false,
    )
  } else {
    const channelId = getChannelId(interaction)
    const guildId = getGuildId(interaction)

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
        color: COLORS.create,
      },
      false,
    )
  }
}

async function handleList(ctx: ActionCtx, interaction: APIInteraction): Promise<Response> {
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
        color: COLORS.update,
        footer: { text: `${subs.length} subscriptions` },
      },
      true,
    )
  } else {
    const channelId = getChannelId(interaction)

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
        color: COLORS.update,
        footer: { text: `${subs.length} subscriptions` },
      },
      true,
    )
  }
}

async function handleDelete(
  ctx: ActionCtx,
  interaction: APIInteraction,
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
        color: COLORS.delete,
      },
      false,
    )
  } else {
    const channelId = getChannelId(interaction)

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
        color: COLORS.delete,
      },
      false,
    )
  }
}

function handleHelp(): Response {
  return embedResponse(
    {
      title: 'ORCA Alert Bot',
      description:
        'Get notified when AI models and endpoints change on OpenRouter.\n\nUse in a **server channel** to subscribe the channel, or in **DMs** to get personal alerts.',
      color: COLORS.help,
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

  const isValid = await verifyKey(body, signature, timestamp, publicKey)
  if (!isValid) {
    return new Response('Invalid signature', { status: 401 })
  }

  const interaction = JSON.parse(body) as APIInteraction

  if (interaction.type === InteractionType.Ping) {
    console.log('[discord:interactions] PING received')
    return pongResponse()
  }

  if (interaction.type === InteractionType.ApplicationCommand) {
    const commandName =
      'data' in interaction && interaction.data && 'name' in interaction.data
        ? interaction.data.name
        : undefined

    console.log('[discord:interactions] command received', {
      command: commandName,
      channel_id: getChannelId(interaction),
      guild_id: getGuildId(interaction),
    })

    if (commandName !== 'orca') {
      return messageResponse(`Unknown command: ${commandName}`, true)
    }

    const { subcommand, options } = parseSubcommand(interaction)

    switch (subcommand) {
      case 'subscribe':
        return await handleSubscribe(ctx, interaction, options)
      case 'list':
        return await handleList(ctx, interaction)
      case 'delete':
        return await handleDelete(ctx, interaction, options)
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
