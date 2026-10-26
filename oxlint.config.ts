import { defineConfig } from 'oxlint'
import antiSlop from 'ultracite/oxlint/anti-slop'
import core from 'ultracite/oxlint/core'
import next from 'ultracite/oxlint/next'
import react from 'ultracite/oxlint/react'

export default defineConfig({
  extends: [core, react, next],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    '**/.agents/skills',
    '**/.claude/skills',
    '**/components/ui',
    '**/worker-configuration.d.ts',
  ],
  // the anti-slop preset is mostly too strict for our boundary parsing, so only its plugin is loaded
  jsPlugins: antiSlop.jsPlugins,
  options: {
    reportUnusedDisableDirectives: 'warn',
    typeAware: true,
    typeCheck: true,
  },
  overrides: [
    {
      // TODO: alert changes carry untyped JSON values; remove once changes are decoded by field kind
      files: [
        'apps/web/features/monitor/{event-renderers,field-display}.tsx',
        'apps/web/features/monitor/field-format.ts',
        'packages/backend/convex/products/discord/renderers/{fields,modelCard,pricing}.ts',
        'packages/backend/convex/products/feed/text.ts',
        'packages/backend/convex/products/shared/alerts/{curate,decode,facts,filter}.ts',
      ],
      rules: {
        'anti-slop/no-runtime-typeof': 'off',
        'anti-slop/no-unknown-parameters': 'off',
        'anti-slop/no-unknown-returns': 'off',
        'anti-slop/no-unsafe-dictionary-type': 'off',
      },
    },
    {
      files: ['packages/backend/**/*', 'packages/discord-sender/**/*'],
      rules: {
        'unicorn/filename-case': 'off',
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
    // anti-slop's no-known-value-widening flags the Record aliases this rule produces
    'typescript/consistent-indexed-object-style': 'off',
    'typescript/consistent-type-definitions': 'off',
    'unicorn/consistent-function-scoping': 'off',

    // project specific
    'anti-slop/no-chained-type-assertions': 'error',
    'anti-slop/no-known-value-widening': 'error',
    // type predicates are the named boundary the rule pushes toward
    'anti-slop/no-runtime-typeof': ['error', { allowInTypeGuards: true }],
    'anti-slop/no-unknown-parameters': 'error',
    'anti-slop/no-unknown-returns': 'error',
    'anti-slop/no-unsafe-dictionary-type': 'error',
    'anti-slop/require-readable-spacing': 'error',
    'anti-slop/require-safety-comment-for-type-assertion': 'error',
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
