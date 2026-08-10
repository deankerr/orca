import { defineConfig } from 'oxlint'
import core from 'ultracite/oxlint/core'
import next from 'ultracite/oxlint/next'
import react from 'ultracite/oxlint/react'

export default defineConfig({
  extends: [core, react, next],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    '.agents/skills',
    '.claude/skills',
    '**/components/ui',
    '**/worker-configuration.d.ts',
    'repos/**',
  ],
  overrides: [
    {
      // convex
      files: ['**/convex/**/*.{ts,tsx}'],
      rules: {
        // required in index queries
        'unicorn/no-useless-undefined': 'off',
      },
    },
    {
      // legacy web/backend code
      files: ['apps/web/**/*.{ts,tsx,js,jsx}', 'packages/backend/**/*.{ts,tsx,js,jsx}'],
      rules: {
        complexity: 'off',
        'no-nested-ternary': 'off',
        'sort-keys': 'off',
        'unicorn/no-nested-ternary': 'off',
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
      },
    },
  ],
  rules: {
    // standard ultracite overrides
    'array-type': 'off',
    'func-style': 'off',
    'no-inline-comments': 'off',
    'no-use-before-define': 'off',
    'no-warning-comments': 'off',
    'react/function-component-definition': 'off',
    'sort-keys': ['error', 'asc', { allowLineSeparatedGroups: true, natural: true }],
    'typescript/consistent-type-definitions': 'off',
    'unicorn/consistent-function-scoping': 'off',

    // conflicts
    'require-await': 'off',

    // legacy code
    'no-await-in-loop': 'off',
    'react/jsx-handler-names': 'off',
    'require-unicode-regexp': 'off',

    // effect/alchemy
    'no-shadow': 'off',
    'oxc/no-barrel-file': 'off',
    'promise/prefer-await-to-callbacks': 'off',
    'promise/prefer-await-to-then': 'off', // Effect.catch / combinators
    'unicorn/filename-case': 'off',
    'unicorn/no-array-for-each': 'off',
    'unicorn/no-array-method-this-argument': 'off', // Effect.map(fa, f)
  },
})
