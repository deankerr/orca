import { describe, expect, test } from 'vitest'

import { highlightJson } from './highlight-json'

describe('highlightJson', () => {
  test('highlights JSON for both application themes', async () => {
    const html = await highlightJson('{"answer":42}')

    expect(html).toContain('class="shiki shiki-themes github-light github-dark-default"')
    expect(html).toContain('--shiki-dark:')
    expect(html).toContain('answer')
  })
})
