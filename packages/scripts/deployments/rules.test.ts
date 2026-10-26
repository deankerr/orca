import { expect, test } from 'vitest'

import {
  Deployments,
  parseDotenv,
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

const live = {
  host: 'fserv',
  remoteBranches: new Set(['main', 'feat/open']),
  worktreePaths: ['/home/dean/code/orca', '/home/dean/.t3/worktrees/orca/t3-live'],
}

test('worktree references are owned per host and directory', () => {
  expect(worktreeReference('FServ.local', '/a/b/t3-3555E62C')).toBe(
    'dev/wt/fserv-local/t3-3555e62c',
  )
})

test('prunes only owned dev deployments without a worktree and previews without a branch', () => {
  const deployments = Deployments.parse([
    cloud({ reference: 'dev/wt/fserv/t3-live' }),
    cloud({ name: 'gone', reference: 'dev/wt/fserv/t3-gone' }),
    cloud({ reference: 'dev/wt/fserv-2/t3-other-host' }),
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
    ['dev/wt/fserv/t3-gone', 'worktree removed'],
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

test('dotenv writes replace managed keys and keep the rest', () => {
  const text = '# comment\nA=1\nB="two"\n'

  expect(parseDotenv(text)).toEqual(
    new Map([
      ['A', '1'],
      ['B', 'two'],
    ]),
  )
  expect(writeDotenv(text, { B: '2', C: '3' })).toBe('# comment\nA=1\nB=2\nC=3\n')
  expect(writeDotenv('', { A: '1' })).toBe('A=1\n')
})
