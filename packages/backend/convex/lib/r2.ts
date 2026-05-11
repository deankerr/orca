import { AwsClient } from 'aws4fetch'
import { gunzipSync, gzipSync } from 'fflate'

import { getEnv } from './env'

type StoreR2ArtifactArgs = {
  workflow: string
  timestamp: number
  format_version: number
  data: unknown
}

type R2Artifact = {
  artifact_id: string
  workflow: string
  timestamp: number
  format_version: number
  data: unknown
}

type StoreR2ArtifactResult = {
  artifact_id: string
}

export async function storeR2Artifact(args: StoreR2ArtifactArgs): Promise<StoreR2ArtifactResult> {
  const { timestamp } = args
  const artifact_id = createArtifactId({ workflow: args.workflow, timestamp })
  const r2_key = artifactIdToR2Key(artifact_id)
  const artifact: R2Artifact = {
    artifact_id,
    workflow: args.workflow,
    timestamp,
    format_version: args.format_version,
    data: args.data,
  }

  const compressed = gzipSync(new TextEncoder().encode(JSON.stringify(artifact)))
  const body = new ArrayBuffer(compressed.byteLength)
  new Uint8Array(body).set(compressed)

  const response = await createR2Client().fetch(buildR2ObjectUrl(r2_key), {
    method: 'PUT',
    headers: {
      'content-length': String(body.byteLength),
      'content-type': 'application/gzip',
    },
    body,
  })

  if (!response.ok) {
    throw new Error(`R2 PUT failed: ${response.status} ${response.statusText}`)
  }

  console.log('artifact stored:', r2_key)
  return { artifact_id }
}

export async function getR2Artifact(artifact_id: string): Promise<unknown> {
  const response = await createR2Client().fetch(buildR2ObjectUrl(artifactIdToR2Key(artifact_id)), {
    method: 'GET',
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`R2 GET failed: ${response.status} ${response.statusText}`)
  }

  const compressed = new Uint8Array(await response.arrayBuffer())
  const json = new TextDecoder().decode(gunzipSync(compressed))

  return JSON.parse(json) as unknown
}

function createArtifactId(args: { workflow: string; timestamp: number }) {
  const workflow = args.workflow.replaceAll(/^\/+|\/+$/g, '')

  if (!isValidWorkflow(workflow)) {
    throw new Error(`Invalid R2 workflow: ${args.workflow}`)
  }

  if (!Number.isFinite(args.timestamp)) {
    throw new TypeError(`Invalid R2 artifact timestamp: ${args.timestamp}`)
  }

  return `${workflow}/${new Date(args.timestamp).toISOString().replace('T', '/')}`
}

function artifactIdToR2Key(artifact_id: string) {
  if (!isValidArtifactId(artifact_id)) {
    throw new Error(`Invalid R2 artifact_id: ${artifact_id}`)
  }

  return `${artifact_id}.json.gz`
}

function isValidArtifactId(artifact_id: string) {
  return (
    !artifact_id.startsWith('/') &&
    !artifact_id.includes('..') &&
    !artifact_id.endsWith('.json.gz') &&
    /^[a-z0-9][a-z0-9-]*\/\d{4}-\d{2}-\d{2}\/\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(artifact_id)
  )
}

function isValidWorkflow(workflow: string) {
  return /^[a-z0-9][a-z0-9-]*$/.test(workflow)
}

function createR2Client() {
  return new AwsClient({
    accessKeyId: getEnv('ORCA_R2_ACCESS_KEY_ID'),
    secretAccessKey: getEnv('ORCA_R2_SECRET_ACCESS_KEY'),
    service: 's3',
    region: 'auto',
  })
}

function buildR2ObjectUrl(r2_key: string) {
  const accountId = getEnv('ORCA_R2_ACCOUNT_ID')
  const bucket = getEnv('ORCA_R2_BUCKET')
  const encodedKey = r2_key.split('/').map(encodeURIComponent).join('/')

  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodedKey}`
}
