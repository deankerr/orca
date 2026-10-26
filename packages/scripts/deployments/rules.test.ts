import { expect, test } from 'vitest'

import {
  Deployments,
  dotenvKeys,
  parseRemoteBranches,
  parseWorktreePaths,
  selectStale,
  worktreeReference,
  writeDotenv,
} from './rules'

const cloud = (overrides: Partial<Record<string, boolean | string>>) => ({
  deploymentType: 'dev',
  deploymentUrl: 'https://x.convex.cloud',
  isDefault: false,
  kind: 'cloud',
  name: 'happy-animal-1',
  reference: 'dev/x',
  ...overrides,
})

const owner = { clone: '/home/dean/code/orca/.git', host: 'fserv' }
const otherClone = { clone: '/home/dean/code/orca-copy/.git', host: 'fserv' }
const livePath = '/home/dean/.t3/worktrees/orca/t3-live'

const live = {
  ...owner,
  remoteBranches: new Set(['main', 'feat/open']),
  worktreePaths: ['/home/dean/code/orca', livePath],
}

test('worktree references are owned per host and clone, and unique per path', () => {
  const reference = worktreeReference({ ...owner, host: 'FServ.local' }, '/a/b/T3_live')

  expect(reference).toMatch(/^dev\/wt\/fserv-local\/[0-9a-f]{8}\/t3-live-[0-9a-f]{6}$/u)
  expect(worktreeReference(owner, '/a/feature_one')).not.toBe(
    worktreeReference(owner, '/a/feature-one'),
  )
  expect(worktreeReference(owner, '/a/x')).not.toBe(worktreeReference(owner, '/b/x'))
  expect(worktreeReference(owner, `/a/${'x'.repeat(200)}`).length).toBeLessThanOrEqual(100)
})

test('prunes only owned dev deployments without a worktree and previews without a branch', () => {
  const deployments = Deployments.parse([
    cloud({ reference: worktreeReference(owner, livePath) }),
    cloud({ name: 'gone', reference: worktreeReference(owner, '/gone') }),
    cloud({ reference: worktreeReference(otherClone, '/other-clone-worktree') }),
    cloud({ reference: worktreeReference({ ...owner, host: 'fserv-2' }, '/other-host') }),
    cloud({ reference: 'dev/api-v5' }),
    cloud({ isDefault: true, reference: 'dev/dean-kerr' }),
    cloud({ deploymentType: 'preview', previewIdentifier: 'feat/open', reference: 'preview/a' }),
    cloud({ deploymentType: 'preview', previewIdentifier: 'feat/merged', reference: 'preview/b' }),
    cloud({ deploymentType: 'prod', isDefault: true, reference: 'production' }),
    { kind: 'local', name: 'local-1' },
  ])

  expect(
    selectStale(deployments, live).map(({ deployment, reason }) => [deployment.reference, reason]),
  ).toEqual([
    [worktreeReference(owner, '/gone'), 'worktree removed'],
    ['preview/b', 'branch feat/merged deleted'],
  ])
})

test('remote branch listings without main are rejected', () => {
  expect(parseRemoteBranches('abc\trefs/heads/main\ndef\trefs/heads/t3/x\n')).toEqual(
    new Set(['main', 't3/x']),
  )
  expect(() => parseRemoteBranches('')).toThrow(/lacks main/u)
})

test('worktree paths come from porcelain output', () => {
  const output = 'worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /wt/a\nHEAD def\n'

  expect(parseWorktreePaths(output)).toEqual(['/repo', '/wt/a'])
})

test('dotenv writes replace managed keys, drop their repeats, and keep the rest', () => {
  const text = '# comment\nA=1\nB=old\nSECRET="long#suffix"\nB=older\n'

  expect(dotenvKeys(text)).toEqual(new Set(['A', 'B', 'SECRET']))
  expect(writeDotenv(text, { B: '2', C: '3' })).toBe(
    '# comment\nA=1\nB=2\nSECRET="long#suffix"\nC=3\n',
  )
  expect(writeDotenv('', { A: '1' })).toBe('A=1\n')
})
