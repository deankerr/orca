import { describe, expect, test } from 'bun:test'

import { resolveLogo } from './index'
import { normalizeLogoKey } from './keys'

describe('normalizeLogoKey', () => {
  test('collapses dashed names', () => {
    expect(normalizeLogoKey('sentence-transformers.png')).toBe('sentencetransformers')
    expect(normalizeLogoKey('shisa-ai.png')).toBe('shisaai')
    expect(normalizeLogoKey('anthracite-org.png')).toBe('anthraciteorg')
    expect(normalizeLogoKey('io-net.png')).toBe('ionet')
  })
})

describe('resolveLogo', () => {
  test('resolves namespaced slugs by useful parts', () => {
    expect(resolveLogo('openai/gpt-4o')?.key).toBe('openai')
    expect(resolveLogo('anthropic/claude-3-5-sonnet')?.key).toBe('claude')
  })

  test('applies known runtime transforms', () => {
    expect(resolveLogo('google-ai-studio')?.key).toBe('aistudio')
    expect(resolveLogo('google-vertex')?.key).toBe('vertexai')
    expect(resolveLogo('amazon-bedrock')?.key).toBe('bedrock')
  })

  test('prefers the longest prefix match', () => {
    expect(resolveLogo('google-cloud/foo')?.key).toBe('googlecloud')
  })

  test('returns public paths only for available assets', () => {
    expect(resolveLogo('deepseek/deepseek-chat')).toEqual({
      avatarPath: '/logos/avatar/deepseek.webp',
      colorPath: '/logos/color/deepseek.png',
      key: 'deepseek',
    })
  })

  test('returns undefined for missing logos', () => {
    expect(resolveLogo('definitely-not-a-real-logo')).toBeUndefined()
  })
})
