import { credentialsFilePath } from 'alchemy/Auth/Credentials'

// This is a one-shot Bun adapter, so direct fetch is its platform boundary.
// @effect-diagnostics globalFetch:off
// @effect-diagnostics asyncFunction:off

const STACK_NAME = 'OrcaCatalog'
const STATE_CREDENTIALS = 'cloudflare-state-store'

await triggerDeployedCatalog()

async function triggerDeployedCatalog() {
  const apiKey = requireEnvironmentVariable('CATALOG_API_KEY')
  const workerUrl = await findDeployedWorkerUrl()
  const result = await startCatalogRun(workerUrl, apiKey)

  await Bun.write(Bun.stdout, `${JSON.stringify(result, null, 2)}\n`)
}

async function findDeployedWorkerUrl() {
  const stage = Bun.env.STAGE ?? `dev_${Bun.env.USER ?? 'unknown'}`
  const stateCredentials = await readAlchemyStateCredentials()

  // Alchemy updates this stack output whenever the Worker's address changes, so the script never
  // needs its own cached or manually configured deployment URL.
  const response = await fetch(
    `${stateCredentials.url}/state/stacks/${STACK_NAME}/stages/${encodeURIComponent(stage)}/output`,
    { headers: { authorization: `Bearer ${stateCredentials.authToken}` } },
  )
  if (!response.ok) {
    throw new Error(`Could not read the ${stage} Catalog stack output from Alchemy`)
  }

  const stackOutput: unknown = await response.json()
  if (!isRecord(stackOutput) || typeof stackOutput.url !== 'string') {
    throw new Error(`The ${stage} Catalog stack has not been deployed`)
  }
  return stackOutput.url
}

async function readAlchemyStateCredentials() {
  const profile = Bun.env.ALCHEMY_PROFILE ?? 'default'
  const credentials: unknown = JSON.parse(
    await Bun.file(credentialsFilePath(profile, STATE_CREDENTIALS)).text(),
  )

  if (
    !isRecord(credentials) ||
    typeof credentials.url !== 'string' ||
    typeof credentials.authToken !== 'string'
  ) {
    throw new Error(`Alchemy state credentials were not found for profile "${profile}"`)
  }
  return { authToken: credentials.authToken, url: credentials.url }
}

async function startCatalogRun(workerUrl: string, apiKey: string) {
  // The same env value is bound to the Worker as a config secret during deployment and loaded by
  // Bun here, leaving only one development credential to configure.
  const response = await fetch(new URL('/run', workerUrl), {
    headers: { authorization: `Bearer ${apiKey}` },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(`Catalog trigger failed (${response.status}): ${await response.text()}`)
  }
  return await response.json()
}

function requireEnvironmentVariable(name: string) {
  const value = Bun.env[name]
  if (value === undefined) {
    throw new Error(`${name} is required`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
