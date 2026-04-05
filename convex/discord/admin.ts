/**
 * Discord bot administration actions
 *
 * Run these from the Convex dashboard to manage the bot:
 * - registerCommands: Register slash commands with Discord
 * - getApplicationInfo: Fetch bot/application details
 *
 * Required environment variables:
 *   DISCORD_APPLICATION_ID - From Discord Developer Portal
 *   DISCORD_BOT_TOKEN - Bot token from Discord Developer Portal
 */

import { z } from 'zod'

import { internalAction } from '../_generated/server'
import { createDiscordClient } from './api'

// Command definitions following Discord's ApplicationCommand structure
const COMMANDS = [
  {
    name: 'orca',
    description: 'ORCA Alert Bot - Get notified when AI models change',
    options: [
      {
        name: 'subscribe',
        description: 'Subscribe to model/endpoint changes',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'pattern',
            description: 'Pattern to match (e.g., * for all, anthropic/, llama, :free)',
            type: 3, // STRING
            required: true,
          },
        ],
      },
      {
        name: 'list',
        description: 'List all subscriptions',
        type: 1, // SUB_COMMAND
      },
      {
        name: 'delete',
        description: 'Delete a subscription by pattern',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'pattern',
            description: 'Pattern to delete (from /orca list)',
            type: 3, // STRING
            required: true,
          },
        ],
      },
      {
        name: 'help',
        description: 'Show help information',
        type: 1, // SUB_COMMAND
      },
    ],
  },
]

const RegisteredCommandSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
})

const ApplicationInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  bot_public: z.boolean(),
  bot_require_code_grant: z.boolean(),
  icon: z.string().nullable(),
})

type RegisteredCommand = z.infer<typeof RegisteredCommandSchema>
type ApplicationInfo = z.infer<typeof ApplicationInfoSchema>

function hasText(value: string | undefined): value is string {
  return value !== undefined && value !== ''
}

/**
 * Register slash commands with Discord
 *
 * Run this once after setting up the Discord application, or whenever
 * command definitions change.
 */
export const registerCommands = internalAction({
  args: {},
  handler: async (): Promise<{
    success: boolean
    commands?: RegisteredCommand[]
    error?: string
  }> => {
    const applicationId = process.env.DISCORD_APPLICATION_ID
    const botToken = process.env.DISCORD_BOT_TOKEN

    if (!hasText(applicationId)) {
      return { success: false, error: 'DISCORD_APPLICATION_ID not configured' }
    }

    if (!hasText(botToken)) {
      return { success: false, error: 'DISCORD_BOT_TOKEN not configured' }
    }

    console.log('[discord:admin] registering commands', {
      applicationId,
      commands: COMMANDS.map((c) => c.name),
    })

    const discord = createDiscordClient(botToken)

    try {
      const result = await discord(`/applications/${applicationId}/commands`, {
        method: 'PUT',
        body: COMMANDS,
        schema: z.array(RegisteredCommandSchema),
      })

      console.log('[discord:admin] commands registered', {
        count: result.length,
        commands: result.map((c) => ({ id: c.id, name: c.name })),
      })

      return {
        success: true,
        commands: result.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
        })),
      }
    } catch (error) {
      console.error('[discord:admin] registration failed', { error: error })
      return { success: false, error: String(error) }
    }
  },
})

/**
 * Get application/bot information from Discord
 *
 * Useful for verifying the bot is correctly configured.
 */
export const getApplicationInfo = internalAction({
  args: {},
  handler: async (): Promise<{
    success: boolean
    application?: ApplicationInfo
    error?: string
  }> => {
    const botToken = process.env.DISCORD_BOT_TOKEN

    if (!hasText(botToken)) {
      return { success: false, error: 'DISCORD_BOT_TOKEN not configured' }
    }

    const discord = createDiscordClient(botToken)

    try {
      const app = await discord('/applications/@me', {
        schema: ApplicationInfoSchema,
      })

      console.log('[discord:admin] application info', {
        id: app.id,
        name: app.name,
        bot_public: app.bot_public,
      })

      return {
        success: true,
        application: {
          id: app.id,
          name: app.name,
          description: app.description,
          bot_public: app.bot_public,
          bot_require_code_grant: app.bot_require_code_grant,
          icon: app.icon,
        },
      }
    } catch (error) {
      console.error('[discord:admin] failed to get application info', { error: error })
      return { success: false, error: String(error) }
    }
  },
})
