import { expect, test } from 'bun:test'

import { entityLogoUrl } from './entityLogo'

test('entity logos prefer family brands and fall back for provider suffixes', () => {
  for (const [slug, key] of [
    ['Anthropic/Claude-Sonnet-4', 'claude'],
    ['google/gemma-3', 'gemma'],
    ['google/global', 'google'],
    ['moonshotai/fp4', 'moonshotai'],
    ['anthropic/claude-on-aws', 'anthropic'],
    ['amazon-bedrock/claude-on-aws', 'anthropic'],
    ['wandb-legacy/fp4', 'wandb'],
    ['amazon-nova', 'nova'],
    ['unknown/gemini', 'unknown'],
    ['', 'fallback'],
  ]) {
    expect(entityLogoUrl({ origin: 'https://logos.orb.town/', slug, variant: 'avatar' })).toBe(
      `https://logos.orb.town/v1/avatar/${key}.webp`,
    )
  }
})
