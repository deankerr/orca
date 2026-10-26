import { randomBytes } from 'node:crypto'
import { homedir, hostname } from 'node:os'
import path from 'node:path'

import { Command } from 'commander'
import { z } from 'zod'

import {
  Deployments,
  dotenvKeys,
  parseRemoteBranches,
  parseWorktreePaths,
  selectStale,
  worktreeReference,
  writeDotenv,
} from './rules'
import type { CloudDeployment } from './rules'

const ROOT_DIR = path.resolve(import.meta.dir, '../../..')
const BACKEND_DIR = path.resolve(ROOT_DIR, 'packages/backend')
const WEB_ENV = path.resolve(ROOT_DIR, 'apps/web/.env.local')

const TEAM = 'deankerr'
const PROJECT = 'orca-b8162'
const EXPIRATION = 'in 14 days'
const API = 'https://api.convex.dev/v1'

async function run(cmd: string[], cwd = ROOT_DIR): Promise<string> {
  const proc = Bun.spawn(cmd, { cwd, stderr: 'inherit', stdout: 'pipe' })
  const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])

  if (code !== 0) {
    throw new Error(`${cmd.slice(0, 3).join(' ')} failed (${code})`)
  }

  return stdout
}

/** Stream a step's output; setup runs in a visible T3 terminal. */
async function step(cmd: string[], cwd = BACKEND_DIR): Promise<void> {
  const code = await Bun.spawn(cmd, { cwd, stdio: ['inherit', 'inherit', 'inherit'] }).exited

  if (code !== 0) {
    throw new Error(`${cmd.slice(0, 4).join(' ')} failed (${code})`)
  }
}

const CliConfig = z.object({ accessToken: z.string().min(1) })

/** Management API client authorized by the Convex CLI login. */
async function management() {
  const configPath = path.join(homedir(), '.convex/config.json')
  const { accessToken } = CliConfig.parse(await Bun.file(configPath).json())

  const request = async (method: 'GET' | 'POST', route: string): Promise<Response> => {
    const response = await fetch(`${API}${route}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      method,
    })

    if (!response.ok) {
      throw new Error(`${method} ${route} failed: ${response.status} ${await response.text()}`)
    }

    return response
  }

  const get = async <T>(route: string, schema: z.ZodType<T>): Promise<T> => {
    const response = await request('GET', route)

    return schema.parse(await response.json())
  }

  const { id } = await get(`/teams/${TEAM}/projects/${PROJECT}`, z.object({ id: z.number() }))

  return {
    delete: async (deployment: CloudDeployment) => {
      await request('POST', `/deployments/${deployment.name}/delete`)
    },
    list: async () => await get(`/projects/${id}/list_deployments`, Deployments),
  }
}

const GitPaths = z.tuple([z.string(), z.string(), z.string()])

/** This checkout's owner and absolute worktree path, comparable with `git worktree list`. */
async function checkout() {
  const output = await run([
    'git',
    'rev-parse',
    '--path-format=absolute',
    '--show-toplevel',
    '--git-dir',
    '--git-common-dir',
  ])

  const [worktree, gitDir, clone] = GitPaths.parse(output.trim().split('\n'))

  return { linked: gitDir !== clone, owner: { clone, host: hostname() }, worktree }
}

/** The reference of this linked worktree; the main checkout owns the personal dev deployment. */
async function ownReference(command: string) {
  const { linked, owner, worktree } = await checkout()

  if (!linked) {
    throw new Error(
      `The main checkout owns the personal dev deployment; run ${command} in a worktree`,
    )
  }

  return worktreeReference(owner, worktree)
}

/** Web app keys setup manages; an existing cookie secret is left untouched. */
type WebEnv = {
  NEXT_PUBLIC_CONVEX_URL: string
  WORKOS_API_KEY: string
  WORKOS_CLIENT_ID: string
  WORKOS_COOKIE_PASSWORD?: string
}

type Management = Awaited<ReturnType<typeof management>>

async function prune(api: Management, { dryRun }: { dryRun: boolean }) {
  const [{ owner }, deployments, worktrees, heads] = await Promise.all([
    checkout(),
    api.list(),
    run(['git', 'worktree', 'list', '--porcelain']),
    run(['git', 'ls-remote', '--heads', 'origin']),
  ])

  const stale = selectStale(deployments, {
    ...owner,
    remoteBranches: parseRemoteBranches(heads),
    worktreePaths: parseWorktreePaths(worktrees),
  })

  for (const { deployment, reason } of stale) {
    console.log(`${dryRun ? 'Would delete' : 'Deleting'} ${deployment.reference} (${reason})`)

    if (!dryRun) {
      await api.delete(deployment)
    }
  }

  console.log(`${stale.length} stale of ${deployments.length} deployments`)
}

/** Create or reselect this worktree's deployment, push, initialize, and configure the web app. */
async function setup({ prune: pruneFirst }: { prune: boolean }) {
  const reference = await ownReference('setup')
  const api = await management()

  if (pruneFirst) {
    try {
      await prune(api, { dryRun: false })
    } catch (error) {
      console.warn(`Skipping prune: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const qualified = `${TEAM}:${PROJECT}:${reference}`

  const find = async () => {
    const deployments = await api.list()

    return deployments.find((deployment) => deployment.reference === reference)
  }

  await step(
    (await find()) === undefined
      ? [
          'bunx',
          'convex',
          'deployment',
          'create',
          qualified,
          '--type',
          'dev',
          '--expiration',
          EXPIRATION,
          '--select',
        ]
      : ['bunx', 'convex', 'deployment', 'select', qualified],
  )

  await step(['bun', 'run', 'dev', '--once', '--run', 'init'])

  const deployment = await find()

  if (!deployment) {
    throw new Error(`${reference} is missing after creation`)
  }

  // The CLI's .env.local omits AuthKit values; the deployment's project defaults hold them.
  const deploymentEnv = async (key: string) =>
    z
      .string()
      .trim()
      .min(1, `${key} unset`)
      .parse(await run(['bunx', 'convex', 'env', 'get', key], BACKEND_DIR))

  const web = Bun.file(WEB_ENV)
  const webText = (await web.exists()) ? await web.text() : ''

  const values: WebEnv = {
    NEXT_PUBLIC_CONVEX_URL: deployment.deploymentUrl,
    WORKOS_API_KEY: await deploymentEnv('WORKOS_API_KEY'),
    WORKOS_CLIENT_ID: await deploymentEnv('WORKOS_CLIENT_ID'),
  }

  // An existing session secret is kept verbatim, whatever its quoting.
  if (!dotenvKeys(webText).has('WORKOS_COOKIE_PASSWORD')) {
    values.WORKOS_COOKIE_PASSWORD = randomBytes(32).toString('hex')
  }

  await Bun.write(WEB_ENV, writeDotenv(webText, values))

  console.log(`Ready: ${reference} (${deployment.deploymentUrl}), expires ${EXPIRATION}`)
}

/** Delete this worktree's deployment; a later setup creates a fresh one. */
async function teardown() {
  const reference = await ownReference('teardown')
  const api = await management()
  const deployments = await api.list()
  const deployment = deployments.find((candidate) => candidate.reference === reference)

  if (deployment === undefined) {
    console.log(`No deployment ${reference}`)

    return
  }

  await api.delete(deployment)
  console.log(`Deleted ${reference}`)
}

const program = new Command('deployments')

program
  .command('setup')
  .description("Create this worktree's dev deployment, initialize it, and configure the web app")
  .option('--no-prune', 'Skip deleting stale deployments first')
  .action(setup)

program.command('teardown').description("Delete this worktree's dev deployment").action(teardown)

program
  .command('prune')
  .description('Delete deployments whose worktree or preview branch no longer exists')
  .option('--dry-run', 'List stale deployments without deleting them', false)
  .action(async (options: { dryRun: boolean }) => {
    await prune(await management(), options)
  })

await program.parseAsync()
