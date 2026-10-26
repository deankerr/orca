/** Pure naming, parsing, and pruning rules for per-worktree and preview deployments. */

import path from 'node:path'

import { z } from 'zod'

/** Marks dev deployments this tooling owns; others are never pruned. */
const WORKTREE_PREFIX = 'dev/wt/'

const slug = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')

const hostPrefix = (host: string) => `${WORKTREE_PREFIX}${slug(host)}/`

/** Owned dev reference for one host's worktree, keyed by its directory name. */
export const worktreeReference = (host: string, worktreePath: string) =>
  `${hostPrefix(host)}${slug(path.basename(worktreePath))}`

const Deployment = z.discriminatedUnion('kind', [
  z.object({
    deploymentType: z.enum(['dev', 'prod', 'preview', 'custom']),
    deploymentUrl: z.string(),
    expiresAt: z.number().nullish(),
    isDefault: z.boolean(),
    kind: z.literal('cloud'),
    name: z.string(),
    previewIdentifier: z
      .string()
      .nullish()
      .transform((branch) => branch ?? undefined),
    reference: z.string(),
  }),
  z.object({ kind: z.literal('local'), name: z.string() }),
])

export const Deployments = z
  .array(Deployment)
  .transform((all) => all.filter((deployment) => deployment.kind === 'cloud'))

export type CloudDeployment = z.output<typeof Deployments>[number]

export type Stale = { deployment: CloudDeployment; reason: string }

export type Live = {
  host: string
  /** Remote branch names; must be a complete listing, as absence deletes previews. */
  remoteBranches: ReadonlySet<string>
  worktreePaths: readonly string[]
}

/**
 * Deployments whose owner is gone: this host's worktree deployments without a worktree, and
 * previews whose branch left the remote. Defaults and unowned dev deployments are kept.
 */
export function selectStale(deployments: readonly CloudDeployment[], live: Live): Stale[] {
  const owned = hostPrefix(live.host)
  const worktrees = new Set(live.worktreePaths.map((p) => worktreeReference(live.host, p)))

  return deployments.flatMap((deployment): Stale[] => {
    if (deployment.isDefault) {
      return []
    }

    if (
      deployment.deploymentType === 'dev' &&
      deployment.reference.startsWith(owned) &&
      !worktrees.has(deployment.reference)
    ) {
      return [{ deployment, reason: 'worktree removed' }]
    }

    const branch = deployment.previewIdentifier

    if (
      deployment.deploymentType === 'preview' &&
      branch !== undefined &&
      !live.remoteBranches.has(branch)
    ) {
      return [{ deployment, reason: `branch ${branch} deleted` }]
    }

    return []
  })
}

/** Parse `git ls-remote --heads`; an empty or main-less listing is treated as unreliable. */
export function parseRemoteBranches(output: string): Set<string> {
  const branches = new Set(
    output
      .split('\n')
      .map((line) => /\trefs\/heads\/(?<branch>.+)$/u.exec(line)?.groups?.branch)
      .filter((branch) => branch !== undefined),
  )

  if (!branches.has('main')) {
    throw new Error('Remote branch listing lacks main; refusing to prune previews')
  }

  return branches
}

/** Parse `git worktree list --porcelain` into worktree paths. */
export const parseWorktreePaths = (output: string) =>
  output
    .split('\n')
    .map((line) => /^worktree (?<path>.+)$/u.exec(line)?.groups?.path)
    .filter((worktreePath) => worktreePath !== undefined)

/** Parse simple `KEY=value` dotenv lines, ignoring comments and blanks. */
export const parseDotenv = (text: string) =>
  new Map(
    text
      .split('\n')
      .map((line) => /^(?<key>[A-Z0-9_]+)=(?<value>.*)$/u.exec(line.trim())?.groups)
      .filter((groups) => groups !== undefined)
      .map(({ key, value }) => [
        key ?? '',
        (value ?? '').replace(/^(?<quote>['"])(?<inner>.*)\k<quote>$/u, '$<inner>'),
      ]),
  )

/** Replace or append `values` in dotenv text, leaving other lines intact. */
export function writeDotenv(text: string, values: Readonly<Record<string, string>>): string {
  const pending = new Map(Object.entries(values))
  const lines = text === '' ? [] : text.replace(/\n$/u, '').split('\n')

  const updated = lines.map((line) => {
    const key = /^(?<key>[A-Z0-9_]+)=/u.exec(line.trim())?.groups?.key
    const value = key === undefined ? undefined : pending.get(key)

    if (key === undefined || value === undefined) {
      return line
    }

    pending.delete(key)

    return `${key}=${value}`
  })

  return `${[...updated, ...[...pending].map(([key, value]) => `${key}=${value}`)].join('\n')}\n`
}
