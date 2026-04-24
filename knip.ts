import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type { KnipConfig, WorkspaceProjectConfig } from 'knip'

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'])
const SOURCE_GLOB = '**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'
const ROOT_SOURCE_GLOBS = [
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '.github/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
]
const CONVEX_SPECIAL_ENTRY_PATHS = new Set([
  'convex/convex.config.ts',
  'convex/crons.ts',
  'convex/http.ts',
  'convex/schema.ts',
])
const CONVEX_FUNCTION_REGISTRATION =
  /\bexport\s+const\s+[A-Za-z0-9_$]+\s*=\s*(?:query|mutation|action|internalQuery|internalMutation|internalAction)\s*\(/m

function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join('/')
}

function listFiles(dirPath: string): string[] {
  return readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      return listFiles(entryPath)
    }

    return entry.isFile() ? [entryPath] : []
  })
}

function getConvexEntrypoints(workspaceDir: string): string[] {
  const convexDir = path.join(workspaceDir, 'convex')
  if (!existsSync(convexDir)) {
    return []
  }

  return listFiles(convexDir)
    .filter((filePath) => SOURCE_EXTENSIONS.has(path.extname(filePath)))
    .filter((filePath) => !filePath.includes(`${path.sep}_generated${path.sep}`))
    .filter((filePath) => {
      const relativePath = toPosixPath(path.relative(workspaceDir, filePath))
      if (CONVEX_SPECIAL_ENTRY_PATHS.has(relativePath)) {
        return true
      }

      const contents = readFileSync(filePath, 'utf-8')
      return CONVEX_FUNCTION_REGISTRATION.test(contents)
    })
    .map((filePath) => toPosixPath(path.relative(workspaceDir, filePath)))
    .toSorted()
}

function createConvexWorkspaceConfig(workspaceName: string): WorkspaceProjectConfig {
  const workspaceDir = path.join(process.cwd(), workspaceName)

  return {
    convex: false,
    entry: getConvexEntrypoints(workspaceDir),
    project: [SOURCE_GLOB, '!**/*.d.ts', '!convex/**/_generated/**'],
  }
}

const config: KnipConfig = {
  ignoreIssues: {
    'apps/web/components/data-grid/**': ['exports', 'types'],
    'apps/web/components/ui/**': ['exports', 'types'],
  },
  workspaces: {
    '.': {
      entry: ROOT_SOURCE_GLOBS,
      ignoreDependencies: ['ultracite'],
      project: ROOT_SOURCE_GLOBS,
    },
    'apps/web': {
      entry: ['scripts/*.ts', '**/*.test.ts'],
      ignoreBinaries: ['gh'],
      ignoreDependencies: [
        'remeda',
        'svgo',
        '@lobehub/icons',
        '@lobehub/icons-static-png',
        '@radix-ui/colors',
        'culori',
        'postcss',
      ],
      ignoreFiles: ['components/ui/**'],
    },
    'packages/backend': createConvexWorkspaceConfig('packages/backend'),
    'packages/backend-experimental': createConvexWorkspaceConfig('packages/backend-experimental'),
  },
}

export default config
