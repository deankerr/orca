import { randomBytes } from 'node:crypto'
import { homedir, hostname } from 'node:os'
import path from 'node:path'

import { Command } from 'commander'
import { z } from 'zod'

import {
  Deployments,
  parseDotenv,
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

async function isLinkedWorktree() {
  const [gitDir, commonDir] = await Promise.all([
    run(['git', 'rev-parse', '--git-dir']),
    run(['git', 'rev-parse', '--git-common-dir']),
  ])

  return gitDir.trim() !== commonDir.trim()
}

type Management = Awaited<ReturnType<typeof management>>

async function prune(api: Management, { dryRun }: { dryRun: boolean }) {
  const [deployments, worktrees, heads] = await Promise.all([
    api.list(),
    run(['git', 'worktree', 'list', '--porcelain']),
    run(['git', 'ls-remote', '--heads', 'origin']),
  ])

  const stale = selectStale(deployments, {
    host: hostname(),
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
  if (!(await isLinkedWorktree())) {
    throw new Error('The main checkout owns the personal dev deployment; run setup in a worktree')
  }

  const api = await management()

  if (pruneFirst) {
    try {
      await prune(api, { dryRun: false })
    } catch (error) {
      console.warn(`Skipping prune: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const reference = worktreeReference(hostname(), ROOT_DIR)
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

  await Bun.write(
    WEB_ENV,
    writeDotenv(webText, {
      NEXT_PUBLIC_CONVEX_URL: deployment.deploymentUrl,
      WORKOS_API_KEY: await deploymentEnv('WORKOS_API_KEY'),
      WORKOS_CLIENT_ID: await deploymentEnv('WORKOS_CLIENT_ID'),
      WORKOS_COOKIE_PASSWORD:
        parseDotenv(webText).get('WORKOS_COOKIE_PASSWORD') ?? randomBytes(32).toString('hex'),
    }),
  )

  console.log(`Ready: ${reference} (${deployment.deploymentUrl}), expires ${EXPIRATION}`)
}

/** Delete this worktree's deployment; a later setup creates a fresh one. */
async function teardown() {
  if (!(await isLinkedWorktree())) {
    throw new Error(
      'The main checkout owns the personal dev deployment; run teardown in a worktree',
    )
  }

  const api = await management()
  const reference = worktreeReference(hostname(), ROOT_DIR)
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
