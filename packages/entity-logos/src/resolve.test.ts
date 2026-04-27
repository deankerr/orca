import { describe, expect, test } from 'bun:test'

import { resolveLogo } from './resolve'

describe('resolveLogo', () => {
  test('collapses dashed names', () => {
    expect(resolveLogo('sentence-transformers/foo')?.key).toBe('sentencetransformers')
    expect(resolveLogo('shisa-ai/foo')?.key).toBe('shisaai')
    expect(resolveLogo('anthracite-org/foo')?.key).toBe('anthraciteorg')
    expect(resolveLogo('io-net/foo')?.key).toBe('ionet')
  })

  test('resolves namespaced slugs by useful parts', () => {
    expect(resolveLogo('openai/gpt-4o')?.key).toBe('openai')
    expect(resolveLogo('anthropic/claude-3-5-sonnet')?.key).toBe('claude')
  })

  test('applies known runtime replacements', () => {
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
