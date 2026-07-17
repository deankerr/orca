import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  ignoreIssues: {
    'apps/web/components/data-grid/**': ['exports', 'types'],
    'apps/web/components/ui/**': ['exports', 'types', 'files'],
  },
  workspaces: {
    'apps/web': {
      entry: ['scripts/*.ts', '**/*.test.ts'],
      ignoreBinaries: ['gh'],
      ignoreDependencies: ['remeda', '@radix-ui/colors', 'postcss'],
    },
  },
}

export default config
