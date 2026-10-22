import { expect, test } from 'bun:test'

import { TopAppsTargets } from './topApps'

test('top-app targets preserve canonical slugs and variants across modalities, excluding latest aliases', () => {
  const model = (id: string, output: string) => ({
    architecture: { output_modalities: [output] },
    canonical_slug: 'author/model-version',
    id,
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
      variant,
      version_slug: 'author/model-version',
    })),
  )

  for (const id of ['', 'author/model:', 'author/model:free:batch']) {
    expect(TopAppsTargets.safeParse({ data: [model(id, 'text')] }).success).toBe(false)
  }

  expect(
    TopAppsTargets.safeParse({ data: [{ canonical_slug: '', id: 'author/model' }] }).success,
  ).toBe(false)
})
