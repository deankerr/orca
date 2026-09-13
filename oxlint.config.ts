import { defineConfig } from 'oxlint'
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
  options: {
    reportUnusedDisableDirectives: 'warn',
    typeAware: true,
    typeCheck: true,
  },
  overrides: [
    {
      // legacy web/backend code
      files: ['apps/web/**/*.{ts,tsx}', 'packages/backend/**/*.{ts,tsx}'],
      rules: {
        complexity: 'off',
        'no-nested-ternary': 'off',
        'sort-keys': 'off',
        'unicorn/no-useless-undefined': 'off',
      },
    },
    {
      // legacy snapshots workflows
      files: ['packages/backend/convex/snapshots/**/*.{ts,tsx}'],
      rules: {
        'typescript/no-explicit-any': 'off',
        'typescript/no-non-null-assertion': 'off',
        'typescript/no-unsafe-argument': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-type-assertion': 'off',
        'typescript/prefer-nullish-coalescing': 'off',
        'typescript/strict-boolean-expressions': 'off',
        'unicorn/no-array-sort': 'off',
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
    'no-await-in-loop': 'off',
    'no-shadow': 'off',
    'promise/prefer-await-to-then': 'off',
    'react/jsx-handler-names': 'off',
    'require-await': 'off',
    'require-unicode-regexp': 'off',
    'unicorn/filename-case': 'off',
  },
})
