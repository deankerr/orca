// Embed colors by change kind
export const COLORS = {
  create: 0x22_c5_5e, // green
  update: 0x3b_82_f6, // blue
  delete: 0xef_44_44, // red
  help: 0x8b_5c_f6, // purple
} as const

// Global limit per user (all subscription types combined)
export const SUBSCRIPTIONS_PER_USER_LIMIT = 50

// Maximum pattern length
export const PATTERN_MAX_LENGTH = 100
