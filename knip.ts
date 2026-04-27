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
    'packages/entity-logos': {
      ignoreDependencies: ['@lobehub/icons-static-avatar', '@lobehub/icons-static-png'],
    },
  },
}

export default config
