import { defineConfig } from 'oxlint'
import antiSlop from 'ultracite/oxlint/anti-slop'
import core from 'ultracite/oxlint/core'
import next from 'ultracite/oxlint/next'
import react from 'ultracite/oxlint/react'

export default defineConfig({
  extends: [core, react, next, antiSlop],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    '**/.agents/skills',
    '**/.claude/skills',
    '**/components/ui',
    '**/worker-configuration.d.ts',
  ],
  options: {
    reportUnusedDisableDirectives: 'warn',
    typeAware: true,
    typeCheck: true,
  },
  overrides: [
    {
      files: ['packages/backend/**/*', 'packages/discord-sender/**/*'],
      rules: {
        'unicorn/filename-case': 'off',
      },
    },
    {
      // Web code reaches backend values through one reviewed entry point, keeping server code out of bundles.
      excludeFiles: ['apps/web/lib/backend.ts', 'apps/web/scripts/**'],
      files: ['apps/web/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                allowTypeImports: true,
                group: ['@orca/backend/**', '!@orca/backend/api'],
                message:
                  'Import backend values through `@/lib/backend`; use `import type` for backend types.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['**/*.test.{ts,tsx}', '**/*.testing.ts'],
      rules: {
        // fixtures and assertions cast test doubles routinely
        'anti-slop/require-safety-comment-for-type-assertion': 'off',
        // scenario tests are long assertion sequences
        complexity: 'off',
      },
    },
  ],
  rules: {
    // standard ultracite overrides
    'array-type': 'off',
    'func-style': 'off',
    'no-inline-comments': 'off',
    'no-redeclare': 'off',
    'no-use-before-define': 'off',
    'no-warning-comments': 'off',
    'react/function-component-definition': 'off',
    'sort-keys': ['error', 'asc', { allowLineSeparatedGroups: true, natural: true }],
    'typescript/consistent-type-definitions': 'off',
    'unicorn/consistent-function-scoping': 'off',

    // project specific
    // Convex transactions, rate-limited delivery, and ordered test scenarios are serial by design
    'no-await-in-loop': 'off',
    // rejects hook setters passed straight through, e.g. `onValueChange={filters.setModelId}`
    'react/jsx-handler-names': 'off',
    // conflicts with `typescript/promise-function-async` for functions implementing async interfaces
    'require-await': 'off',
    // conflicts with `typescript/consistent-return` and `no-empty-function`
    'unicorn/no-useless-undefined': 'off',
  },
})
