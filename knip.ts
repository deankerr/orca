import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  ignoreIssues: {
    'apps/web/components/ui/**': ['exports', 'types', 'files'],
    'apps/web/features/endpoints-data-grid/data-grid/**': ['exports', 'types'],
  },
  workspaces: {
    'apps/web': {
      entry: ['scripts/*.ts', '**/*.test.ts'],
      ignoreDependencies: ['@radix-ui/colors'],
    },
    'packages/scripts': {
      entry: ['**/*.test.ts'],
    },
  },
}

export default config
