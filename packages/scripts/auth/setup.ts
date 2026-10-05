import { randomBytes } from 'node:crypto'
import { chmod, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseEnv } from 'node:util'

import { NotFoundException, WorkOS } from '@workos-inc/node'

import { developmentAuth, setupDeployment } from './config'

async function command(args: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(args, { cwd, stderr: 'pipe', stdout: 'pipe' })
  const [stdout, , exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  if (exitCode !== 0) {
    // Command output can contain environment credentials; do not forward it to agent logs.
    throw new Error(`${args.slice(0, 4).join(' ')} failed (exit ${exitCode}).`)
  }

  return stdout.trim()
}

async function setup() {
  const root = path.resolve(import.meta.dir, '../../..')
  const commonGit = await command(
    ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    root,
  )

  if (commonGit !== path.resolve(root, '.git')) {
    throw new Error('Run auth:setup from the main checkout; worktrees reuse its .env.auth.local.')
  }

  const backend = path.resolve(root, 'packages/backend')
  const env = {
    ...parseEnv(await readFile(path.resolve(backend, '.env.local'), 'utf-8')),
    ...process.env,
  }
  const deployment = setupDeployment(env)
  const apiKey = env.WORKOS_API_KEY

  if (apiKey === undefined || apiKey === '') {
    throw new Error('WORKOS_API_KEY is missing from the backend environment.')
  }

  const convex = async (...args: string[]) =>
    await command(['bun', 'run', 'convex', ...args], backend)
  const deployedClient = await convex(
    'env',
    'get',
    'WORKOS_CLIENT_ID',
    '--deployment-name',
    deployment,
  )

  if (deployedClient !== developmentAuth.clientId) {
    throw new Error(
      'The selected deployment does not use the shared nonproduction WorkOS environment.',
    )
  }

  console.log(
    `Target: dev (${deployment}) and dev/preview defaults for ${developmentAuth.project}.`,
  )

  const workos = new WorkOS(apiKey, { clientId: developmentAuth.clientId })
  const user = await workos.userManagement
    .getUserByExternalId(developmentAuth.account.externalId)
    .catch((error: unknown) => {
      if (error instanceof NotFoundException) {
        return null
      }

      throw error
    })
  const credentialsPath = path.resolve(root, '.env.auth.local')
  const credentialsExist = await Bun.file(credentialsPath).exists()

  if (user !== null && !credentialsExist) {
    throw new Error(
      'The managed account already exists, but .env.auth.local is missing. Recover its password; setup will not reset it.',
    )
  }

  if (!credentialsExist) {
    // Persist before the API call so an interrupted first run can reuse the same password.
    await writeFile(
      credentialsPath,
      `WORKOS_CLIENT_ID=${developmentAuth.clientId}\nORCA_DEV_ADMIN_PASSWORD=${randomBytes(32).toString('base64url')}\n`,
      { flag: 'wx', mode: 0o600 },
    )
  }

  const credentials = parseEnv(await readFile(credentialsPath, 'utf-8'))
  const password = credentials.ORCA_DEV_ADMIN_PASSWORD

  if (
    credentials.WORKOS_CLIENT_ID !== developmentAuth.clientId ||
    password === undefined ||
    password === ''
  ) {
    throw new Error(
      'The local auth credentials are incomplete or belong to another WorkOS environment.',
    )
  }

  const account =
    user === null
      ? await workos.userManagement.createUser({ ...developmentAuth.account, password })
      : await workos.userManagement.updateUser({ userId: user.id, ...developmentAuth.account })

  // Check the saved credential before granting access. Never print the returned tokens.
  await workos.userManagement.authenticateWithPassword({
    clientId: developmentAuth.clientId,
    email: account.email,
    password,
  })

  await writeFile(
    credentialsPath,
    [
      `WORKOS_CLIENT_ID=${developmentAuth.clientId}`,
      `ORCA_DEV_ADMIN_EMAIL=${account.email}`,
      `ORCA_DEV_ADMIN_PASSWORD=${password}`,
      `ORCA_ADMIN_USER_ID=${account.id}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  )
  await chmod(credentialsPath, 0o600)

  for (const type of ['dev', 'preview']) {
    await convex(
      'env',
      'default',
      'set',
      'ORCA_ADMIN_USER_ID',
      account.id,
      '--type',
      type,
      '--project',
      developmentAuth.project,
    )
  }

  await convex('env', 'set', 'ORCA_ADMIN_USER_ID', account.id, '--deployment-name', deployment)
  console.log(`${user === null ? 'Created' : 'Reused'} ${account.email} (${account.id}).`)
  console.log(
    'Configured the current dev deployment and future dev/preview deployments. Existing previews are not changed.',
  )
  console.log(`Local credentials: ${credentialsPath} (not committed).`)
}

await setup().catch((error: unknown) => {
  // SDK exceptions can carry request/response bodies; print only the message, never the object.
  console.error(error instanceof Error ? error.message : 'Auth setup failed.')
  process.exitCode = 1
})
