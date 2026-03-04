// Embed colors by change kind
export const COLORS = {
  create: 0x22c55e, // green
  update: 0x3b82f6, // blue
  delete: 0xef4444, // red
  help: 0x8b5cf6, // purple
} as const

// Emoji constants for embeds and messages
export const EMOJIS = {
  new: '🆕',
  delete: '☠️',
  update: '🔄',
  checkmark: '✅',
  cross: '❌',
  arrow: '▶︎',
  arrowUp: '⬆︎',
  arrowDown: '⬇︎',
} as const

export const DOT_SPACER = ' • '

// Maximum description length for embeds
export const MAX_DESCRIPTION_LENGTH = 900

// Global limit per user (all subscription types combined)
export const SUBSCRIPTIONS_PER_USER_LIMIT = 50

// Maximum pattern length
export const PATTERN_MAX_LENGTH = 100
