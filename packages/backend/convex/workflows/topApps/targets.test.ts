import { expect, test } from 'bun:test'

import { TopAppsTargets } from './targets'

test('top-app targets preserve canonical slugs and variants across modalities, excluding latest aliases', () => {
  const model = (id: string, output: string) => ({
    id,
    canonical_slug: 'author/model-version',
    architecture: { output_modalities: [output] },
  })

  expect(
    TopAppsTargets.parse({
      data: [
        model('author/model', 'embeddings'),
        model('author/model:free', 'image'),
        model('author/model:batch', 'text'),
        model('author/model:future', 'audio'),
        model('~author/model-latest', 'text'),
      ],
    }),
  ).toEqual(
    ['standard', 'free', 'batch', 'future'].map((variant) => ({
      slug: variant === 'standard' ? 'author/model' : `author/model:${variant}`,
      version_slug: 'author/model-version',
      variant,
    })),
  )

  for (const id of ['', 'author/model:', 'author/model:free:batch']) {
    expect(TopAppsTargets.safeParse({ data: [model(id, 'text')] }).success).toBe(false)
  }

  expect(
    TopAppsTargets.safeParse({ data: [{ id: 'author/model', canonical_slug: '' }] }).success,
  ).toBe(false)
})
