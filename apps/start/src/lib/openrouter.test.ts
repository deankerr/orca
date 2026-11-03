import { describe, expect, it } from 'vitest'

import { huggingFaceUrl, modelPageUrl, providerPageUrl } from './openrouter'

describe('modelPageUrl', () => {
  it('links the model slug under the OpenRouter origin', () => {
    expect(modelPageUrl('moonshotai/kimi-k3')).toBe('https://openrouter.ai/moonshotai/kimi-k3')
  })

  it('keeps a variant suffix readable', () => {
    expect(modelPageUrl('openai/gpt-5:free')).toBe('https://openrouter.ai/openai/gpt-5:free')
  })

  it('encodes characters that would break the path', () => {
    expect(modelPageUrl('a/b c?d#e')).toBe('https://openrouter.ai/a/b%20c%3Fd%23e')
  })
})

describe('providerPageUrl', () => {
  it('links the provider slug under /provider', () => {
    expect(providerPageUrl('google-vertex')).toBe('https://openrouter.ai/provider/google-vertex')
  })
})

describe('huggingFaceUrl', () => {
  it('links the repository', () => {
    expect(huggingFaceUrl('moonshotai/Kimi-K3')).toBe('https://huggingface.co/moonshotai/Kimi-K3')
  })
})
