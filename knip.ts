import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  ignoreIssues: {
    'apps/web/components/data-grid/**': ['exports', 'types'],
    'apps/web/components/ui/**': ['exports', 'types', 'files'],
  },
  workspaces: {
    'apps/web': {
      entry: ['scripts/*.ts', '**/*.test.ts'],
      ignoreDependencies: ['@radix-ui/colors'],
    },

    'apps/engine': {
      entry: ['alchemy.run.ts'],
    },
  },
}

export default config
