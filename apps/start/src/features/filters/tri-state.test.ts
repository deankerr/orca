import { describe, expect, it } from 'vitest'

import { nextPropertyState } from './tri-state'

describe('nextPropertyState', () => {
  it('cycles off, required, excluded, then off', () => {
    expect(nextPropertyState('off')).toBe('with')
    expect(nextPropertyState('with')).toBe('without')
    expect(nextPropertyState('without')).toBe('off')
  })
})
