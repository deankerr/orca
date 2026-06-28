import { expect, test } from 'bun:test'

import worker from './worker'

type TestEnv = Parameters<typeof worker.fetch>[1]

test('returns the matching group fallback asset for missing public logo images', async () => {
  const assetRequests: Request[] = []
  const env: TestEnv = {
    ASSETS: createAssetsFetcher(async (input) => {
      const request = requestFromInput(input)

      assetRequests.push(request)

      return new Response('fallback-image', {
        headers: {
          'content-type': 'image/webp',
        },
      })
    }),
  }

  const lightResponse = await worker.fetch(
    new Request('https://logos.test/v1/light/missing.webp'),
    env,
  )
  const darkResponse = await worker.fetch(
    new Request('https://logos.test/v1/dark/missing.webp'),
    env,
  )
  const avatarResponse = await worker.fetch(
    new Request('https://logos.test/v1/avatar/missing.webp'),
    env,
  )

  expect(lightResponse.status).toBe(200)
  expect(lightResponse.headers.get('content-type')).toBe('image/webp')
  expect(await lightResponse.text()).toBe('fallback-image')
  expect(darkResponse.status).toBe(200)
  expect(await darkResponse.text()).toBe('fallback-image')
  expect(avatarResponse.status).toBe(200)
  expect(await avatarResponse.text()).toBe('fallback-image')
  expect(assetRequests.map((request) => new URL(request.url).pathname)).toEqual([
    '/v1/light/fallback.webp',
    '/v1/dark/fallback.webp',
    '/v1/avatar/fallback.webp',
  ])
})

test('serves a direct fallback request from the same asset path', async () => {
  const assetRequests: Request[] = []
  const env: TestEnv = {
    ASSETS: createAssetsFetcher(async (input) => {
      const request = requestFromInput(input)

      assetRequests.push(request)

      return new Response('fallback-image')
    }),
  }

  const response = await worker.fetch(
    new Request('https://logos.test/v1/avatar/fallback.webp'),
    env,
  )

  expect(response.status).toBe(200)
  expect(await response.text()).toBe('fallback-image')
  expect(assetRequests.map((request) => new URL(request.url).pathname)).toEqual([
    '/v1/avatar/fallback.webp',
  ])
})

test('keeps non-logo paths as normal 404 responses', async () => {
  const env: TestEnv = {
    ASSETS: createAssetsFetcher(async () => new Response('should not be called')),
  }

  const response = await worker.fetch(new Request('https://logos.test/nope.webp'), env)

  expect(response.status).toBe(404)
  expect(await response.text()).toBe('Not found')
})

test('rejects methods that cannot serve image assets', async () => {
  const env: TestEnv = {
    ASSETS: createAssetsFetcher(async () => new Response('should not be called')),
  }

  const response = await worker.fetch(
    new Request('https://logos.test/v1/light/missing.webp', { method: 'POST' }),
    env,
  )

  expect(response.status).toBe(405)
  expect(response.headers.get('allow')).toBe('GET, HEAD')
})

function createAssetsFetcher(fetch: Fetcher['fetch']): Fetcher {
  return {
    connect: () => {
      throw new Error('connect is not supported by the test asset adapter')
    },
    fetch,
  }
}

function requestFromInput(input: RequestInfo | URL): Request {
  if (input instanceof Request) {
    return input
  }

  return new Request(input)
}
