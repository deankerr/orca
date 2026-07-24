import { describe, expect, test } from 'bun:test'

import { entityLogoUrl } from './entity-logo'

const origin = 'https://logos.example'

describe('entityLogoUrl author overrides', () => {
  test.each([
    ['wandb-legacy/model', 'wandb'],
    ['amazon-nova/model', 'nova'],
  ])('maps the %s author to %s', (slug, key) => {
    expect(entityLogoUrl({ origin, slug, variant: 'avatar' })).toBe(
      `${origin}/v1/avatar/${key}.webp`,
    )
  })

  test.each(['author/wandb-legacy', 'author/amazon-nova'])(
    'does not apply an author override to the model slot in %s',
    (slug) => {
      expect(entityLogoUrl({ origin, slug, variant: 'avatar' })).toBe(
        `${origin}/v1/avatar/author.webp`,
      )
    },
  )
})
