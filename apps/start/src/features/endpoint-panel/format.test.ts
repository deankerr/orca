import { describe, expect, it } from 'vitest'

import { formatDate, formatDays, formatFlag, formatList, formatValue, sentenceCase } from './format'

describe('sentenceCase', () => {
  it('lowercases ordinary words after the first', () => {
    expect(sentenceCase('Prompt Retention')).toBe('Prompt retention')
    expect(sentenceCase('Reasoning Off by Default')).toBe('Reasoning off by default')
  })

  it('keeps acronyms and camel-cased names', () => {
    expect(sentenceCase('User ID Required')).toBe('User ID required')
    expect(sentenceCase('OpenRouter Training')).toBe('OpenRouter training')
    expect(sentenceCase('ZDR')).toBe('ZDR')
  })
})

describe('formatValue', () => {
  it('reads an active flag as yes', () => {
    expect(formatValue(true)).toBe('yes')
  })

  it('groups numbers and joins lists in order', () => {
    expect(formatValue(1000)).toBe('1,000')
    expect(formatValue(['low', 'high'])).toBe('low, high')
    expect(formatValue('fp8')).toBe('fp8')
  })
})

describe('small formats', () => {
  it('dates in UTC', () => {
    expect(formatDate('2026-10-24T23:30:00.000Z')).toBe('2026-10-24')
    expect(formatDate(null)).toBe('—')
  })

  it('states flags, days, and lists', () => {
    expect(formatFlag(true)).toBe('yes')
    expect(formatFlag(false)).toBe('no')
    expect(formatFlag(null)).toBe('—')
    expect(formatDays(1)).toBe('1 day')
    expect(formatDays(30)).toBe('30 days')
    expect(formatList([])).toBe('—')
  })
})
