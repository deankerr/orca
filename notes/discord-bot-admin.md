# Discord Bot Administration

## Dashboard

https://discord.com/developers/applications

Application: ORCA (or whatever you named it)

## Environment Variables

**Convex dashboard** (Settings → Environment Variables) - used by runtime:

```
DISCORD_PUBLIC_KEY       # From General Information - signature verification
DISCORD_BOT_TOKEN        # From Bot → Token - sending messages
```

**`.env` file** (project root) - used by scripts:

```
DISCORD_APPLICATION_ID   # From General Information - command registration
DISCORD_BOT_TOKEN        # From Bot → Token - command registration
```

Note: `DISCORD_BOT_TOKEN` is needed in both places.

## Setup Steps

### 1. Create Application

- Go to Discord Developer Portal
- New Application → Name it "ORCA"

### 2. Create Bot

- Go to Bot section
- Click "Add Bot" (if not already created)
- Copy the token → set as `DISCORD_BOT_TOKEN`

### 2b. Configure Installation Contexts

Go to Installation → Installation Contexts:

- **Guild Install** (enabled by default): Bot can be added to servers, post to channels
- **User Install**: Users can add to their account, use in DMs

Enable both for full functionality. Each has a separate OAuth2 URL.

### 3. Set Interactions Endpoint

- Go to General Information
- Set "Interactions Endpoint URL" to:
  ```
  https://fantastic-mosquito-881.convex.site/discord/interactions
  ```
- Discord will send a PING to verify - must return PONG

### 4. Register Slash Commands

```bash
bun scripts/register-discord-commands.ts
```

### 5. Generate Invite URLs

**For servers (Guild Install):**

- Go to OAuth2 → URL Generator
- Integration type: Guild Install
- Select scopes: `bot`, `applications.commands`
- Select bot permissions: `Send Messages`, `Embed Links`
- Copy URL → use to add bot to servers

**For personal use (User Install):**

- Go to OAuth2 → URL Generator
- Integration type: User Install
- Select scopes: `applications.commands`
- Copy URL → users authorize to use in DMs

### 6. Add Bot to Server

- Open the Guild Install URL in browser
- Select server to add bot to
- Authorize

## Troubleshooting

### 403 Missing Access

Bot can't post to channel. Check:

- Bot is in the server (visible in member list)
- Bot has `Send Messages` permission (from invite URL)
- Channel doesn't have custom permissions blocking bots

### Invalid Signature (401)

- Check `DISCORD_PUBLIC_KEY` is correct
- Make sure you're using the public key, not the token

### Commands Not Showing

- Run `bun scripts/register-discord-commands.ts` again
- Wait a few minutes for Discord to propagate
- Try in a different channel

### "You're using a personal app install..."

User tried to subscribe in a server channel using User Install. The bot can run commands but can't post messages to that channel.

Solutions:

- Use DMs for personal alerts (User Install)
- Have a server admin add the bot via Guild Install URL for channel alerts

## Slash Commands

| Command                     | Description                        |
| --------------------------- | ---------------------------------- |
| `/orca subscribe <pattern>` | Create alert subscription          |
| `/orca list`                | Show subscriptions (channel or DM) |
| `/orca delete <pattern>`    | Remove subscription by pattern     |
| `/orca help`                | Show help                          |

**Install types determine where commands work:**

| Context        | Install Type  | Result                      |
| -------------- | ------------- | --------------------------- |
| Server channel | Guild Install | Alerts post to that channel |
| Server channel | User Install  | Blocked (bot can't post)    |
| DMs            | User Install  | Alerts sent as DMs          |

## Subscription Patterns

Simple includes matching - pattern must appear anywhere in the model slug.

- `*` - All changes (special case)
- `anthropic/` - Anthropic models (provider prefix)
- `llama` - Models containing "llama"
- `:free` - Free tier models (suffix)
- `/claude-3` - Models with "/claude-3" in slug

## Limits

- 50 total subscriptions per user (across all channels and DMs combined)
- Patterns must be unique per context (can't have duplicate patterns in same channel/DM)
