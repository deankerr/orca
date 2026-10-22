/// <reference types="node" />
import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type { KnipConfig } from 'knip'

import backendPackage from './packages/backend/package.json' with { type: 'json' }
import discordSenderPackage from './packages/discord-sender/package.json' with { type: 'json' }

// Convex deploys every module in a functions directory, so knip's Convex plugin treats them all as
// entries and never reports their unused exports. Instead, only modules that register Convex
// functions are entries, and the exports Convex consumes are tagged @public before analysis. Every
// other export must be imported to count as used.
const convexDirs = ['packages/backend/convex', 'packages/discord-sender/src/component']

const convexExport =
  /^export (?=default\b|const \w+(?::[^=]+)? = (?:query|mutation|action|internalQuery|internalMutation|internalAction|httpAction)\()/m

const isConvexModule = (file: string) =>
  convexDirs.some((dir) => file.includes(`/${dir}/`)) && !file.includes('/_generated/')

/** Workspace-relative modules in `functionsDir` that register Convex functions, except package exports. */
const convexEntries = (
  workspace: string,
  functionsDir: string,
  { exports }: { exports: Record<string, string> },
) => {
  const exported = new Set(Object.values(exports).map((file) => path.join(file)))

  return globSync('**/*.ts', {
    cwd: path.join(workspace, functionsDir),
    exclude: ['_generated/**', '**/*.test.ts'],
  })
    .map((file) => path.join(functionsDir, file))
    .filter(
      (file) =>
        !exported.has(file) && convexExport.test(readFileSync(path.join(workspace, file), 'utf-8')),
    )
}

const config: KnipConfig = {
  compilers: {
    ts: (text: string, file: string) =>
      isConvexModule(file)
        ? text.replaceAll(new RegExp(convexExport, 'gm'), '/** @public */\nexport ')
        : text,
  },
  // Installed globally rather than as a dependency.
  ignoreBinaries: ['portless'],
  ignoreIssues: {
    '**/_generated/**': ['exports', 'types', 'files'],
    'apps/web/components/ui/**': ['exports', 'types'],
  },
  workspaces: {
    'apps/web': {
      entry: ['scripts/*.ts', '**/*.test.ts'],
    },
    'packages/backend': {
      convex: false,
      entry: [
        ...convexEntries('packages/backend', 'convex', backendPackage),
        'convex/**/*.test.ts',
      ],
      includeEntryExports: true,
    },
    'packages/discord-sender': {
      entry: convexEntries('packages/discord-sender', 'src/component', discordSenderPackage),
      includeEntryExports: true,
    },
    'packages/json-profile': {
      entry: ['**/*.test.ts'],
    },
    'packages/scripts': {
      entry: ['**/*.test.ts'],
    },
  },
}

export default config
