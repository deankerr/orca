/**
 * Register Discord slash commands for ORCA bot
 *
 * Run once after setting up the Discord application:
 *   bun scripts/register-discord-commands.ts
 *
 * Required environment variables:
 *   DISCORD_APPLICATION_ID - From Discord Developer Portal
 *   DISCORD_BOT_TOKEN - Bot token from Discord Developer Portal
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10'

// Command definitions following Discord's ApplicationCommand structure
const commands = [
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

async function registerCommands() {
  const applicationId = process.env.DISCORD_APPLICATION_ID
  const botToken = process.env.DISCORD_BOT_TOKEN

  if (!applicationId) {
    console.error('Error: DISCORD_APPLICATION_ID environment variable not set')
    process.exit(1)
  }

  if (!botToken) {
    console.error('Error: DISCORD_BOT_TOKEN environment variable not set')
    process.exit(1)
  }

  console.log('Registering Discord slash commands...')
  console.log(`Application ID: ${applicationId}`)
  console.log(`Commands to register: ${commands.map((c) => `/${c.name}`).join(', ')}`)

  const url = `${DISCORD_API_BASE}/applications/${applicationId}/commands`

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify(commands),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`Failed to register commands: ${response.status}`)
    console.error(error)
    process.exit(1)
  }

  const result = await response.json()
  console.log('Commands registered successfully!')
  console.log('Registered commands:')

  for (const cmd of result as Array<{ name: string; id: string }>) {
    console.log(`  - /${cmd.name} (ID: ${cmd.id})`)
  }

  console.log('\nNext steps:')
  console.log('1. Set Interactions Endpoint URL in Discord Developer Portal:')
  console.log('   https://<your-convex-deployment>.convex.site/discord/interactions')
  console.log('2. Add bot to a server using OAuth2 URL with bot + applications.commands scopes')
  console.log('3. Test with /orca help in a channel')
}

registerCommands().catch(console.error)
