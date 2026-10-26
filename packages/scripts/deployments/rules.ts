/** Pure naming, parsing, and pruning rules for per-worktree and preview deployments. */

import { createHash } from 'node:crypto'
import path from 'node:path'

import { z } from 'zod'

/** Marks dev deployments this tooling owns; others are never pruned. */
const WORKTREE_PREFIX = 'dev/wt/'

const slug = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')

const digest = (text: string, length: number) =>
  createHash('sha256').update(text).digest('hex').slice(0, length)

/** A clone is identified by its absolute Git common directory, shared by all its worktrees. */
export type Owner = { clone: string; host: string }

/** References this clone owns on this host; other clones' and hosts' deployments are never pruned. */
const ownedPrefix = ({ clone, host }: Owner) =>
  `${WORKTREE_PREFIX}${slug(host)}/${digest(clone, 8)}/`

/** Owned dev reference for one worktree: readable directory name plus a hash of its full path. */
export const worktreeReference = (owner: Owner, worktreePath: string) =>
  `${ownedPrefix(owner)}${slug(path.basename(worktreePath)).slice(0, 40)}-${digest(worktreePath, 6)}`

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

export type Live = Owner & {
  /** Remote branch names; must be a complete listing, as absence deletes previews. */
  remoteBranches: ReadonlySet<string>
  worktreePaths: readonly string[]
}

/**
 * Deployments whose owner is gone: this clone's worktree deployments without a worktree, and
 * previews whose branch left the remote. Defaults and unowned dev deployments are kept.
 */
export function selectStale(deployments: readonly CloudDeployment[], live: Live): Stale[] {
  const owned = ownedPrefix(live)
  const worktrees = new Set(live.worktreePaths.map((p) => worktreeReference(live, p)))

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

const dotenvKey = (line: string) => /^(?<key>[A-Z0-9_]+)=/u.exec(line.trim())?.groups?.key

/** Keys assigned in dotenv text; values are never read, so quoting needs no interpretation. */
export const dotenvKeys = (text: string) =>
  new Set(
    text
      .split('\n')
      .map(dotenvKey)
      .filter((key) => key !== undefined),
  )

/** Set `values` in dotenv text: replace the first assignment, drop repeats, append the rest. */
export function writeDotenv(text: string, values: Readonly<Record<string, string>>): string {
  const pending = new Map(Object.entries(values))
  const lines = text === '' ? [] : text.replace(/\n$/u, '').split('\n')

  const updated = lines.flatMap((line) => {
    const key = dotenvKey(line)

    if (key === undefined || !(key in values)) {
      return [line]
    }

    const value = pending.get(key)
    pending.delete(key)

    return value === undefined ? [] : [`${key}=${value}`]
  })

  return `${[...updated, ...[...pending].map(([key, value]) => `${key}=${value}`)].join('\n')}\n`
}
