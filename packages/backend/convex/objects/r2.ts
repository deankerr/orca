import { AwsClient } from 'aws4fetch'

import { getEnv } from '../lib/env'

/** Put/get gzipped bytes by key. */
export type R2Transport = {
  put: (key: string, body: Uint8Array) => Promise<void>
  /** Compressed bytes, or `null` if the key is missing. */
  get: (key: string) => Promise<Uint8Array | null>
}

/** R2 object key for this identity. Listing prefix is `path`. */
export function r2Key(path: string, name: string) {
  return `${path}/${name}`
}

/**
 * R2 HTTP client from env.
 *
 * Missing credentials fail on first use, not at import.
 */
export function createR2Transport(): R2Transport {
  const client = r2Client()

  return {
    async put(key, body) {
      const buffer = new ArrayBuffer(body.byteLength)
      new Uint8Array(buffer).set(body)

      const response = await client.fetch(objectUrl(key), {
        method: 'PUT',
        headers: {
          'content-length': String(body.byteLength),
          'content-type': 'application/gzip',
        },
        body: buffer,
      })

      if (!response.ok) {
        throw new Error(`R2 PUT failed: ${response.status} ${response.statusText}`)
      }
    },
    async get(key) {
      const response = await client.fetch(objectUrl(key), { method: 'GET' })

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        throw new Error(`R2 GET failed: ${response.status} ${response.statusText}`)
      }

      return new Uint8Array(await response.arrayBuffer())
    },
  }
}

function r2Client() {
  return new AwsClient({
    accessKeyId: getEnv('ORCA_R2_ACCESS_KEY_ID'),
    secretAccessKey: getEnv('ORCA_R2_SECRET_ACCESS_KEY'),
    service: 's3',
    region: 'auto',
  })
}

function objectUrl(key: string) {
  const accountId = getEnv('ORCA_R2_ACCOUNT_ID')
  const bucket = getEnv('ORCA_R2_BUCKET')
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')

  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodedKey}`
}
