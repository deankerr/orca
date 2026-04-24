import { defineConfig } from 'oxlint'
import core from 'ultracite/oxlint/core'
import next from 'ultracite/oxlint/next'
import react from 'ultracite/oxlint/react'

export default defineConfig({
  extends: [core, react, next],
  jsPlugins: [
    {
      name: 'react-hooks-js',
      specifier: 'eslint-plugin-react-hooks',
    },
  ],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    '.agents/skills',
    '.claude/skills',
    '**/components/ui',
  ],
  rules: {
    // standard ultracite overrides
    'array-type': 'off',
    'func-style': 'off',
    'no-inline-comments': 'off',
    'no-use-before-define': 'off',
    'no-warning-comments': 'off',
    'sort-keys': 'off',
    'typescript/consistent-type-definitions': 'off',
    'typescript/prefer-readonly-parameter-types': 'off',
    'unicorn/consistent-function-scoping': 'off',

    // conflicts
    'require-await': 'off',
    'unicorn/number-literal-case': 'off',

    // React
    'react/jsx-handler-names': 'off',

    // Use the upstream React Hooks plugin for its React Compiler rules.
    'react/rules-of-hooks': 'off',
    'react/exhaustive-deps': 'off',
    'react-hooks-js/rules-of-hooks': 'error',
    'react-hooks-js/exhaustive-deps': 'warn',
    'react-hooks-js/static-components': 'error',
    'react-hooks-js/use-memo': 'error',
    'react-hooks-js/preserve-manual-memoization': 'error',
    'react-hooks-js/incompatible-library': 'warn',
    'react-hooks-js/immutability': 'error',
    'react-hooks-js/globals': 'error',
    'react-hooks-js/refs': 'error',
    'react-hooks-js/set-state-in-effect': 'error',
    'react-hooks-js/error-boundaries': 'error',
    'react-hooks-js/purity': 'error',
    'react-hooks-js/set-state-in-render': 'error',
    'react-hooks-js/unsupported-syntax': 'warn',
    'react-hooks-js/config': 'error',
    'react-hooks-js/gating': 'error',
  },
  overrides: [
    {
      // convex
      files: ['**/convex/**/*.{ts,tsx}'],
      rules: {
        // incompatible
        'unicorn/filename-case': 'off',
        'unicorn/no-useless-undefined': 'off',
        // useful
        'promise/prefer-await-to-then': 'off',
      },
    },
    {
      // legacy web/backend code
      files: ['apps/web/**/*.{ts,tsx,js,jsx}', 'packages/backend/**/*.{ts,tsx,js,jsx}'],
      rules: {
        complexity: 'off',
        'no-nested-ternary': 'off',
        'unicorn/no-nested-ternary': 'off',
        'unicorn/no-useless-undefined': 'off',
      },
    },
    {
      // legacy snapshots workflows
      files: ['packages/backend/convex/snapshots/**/*.{ts,tsx}'],
      rules: {
        'typescript/no-non-null-assertion': 'off',
        'typescript/no-explicit-any': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-argument': 'off',
        'typescript/no-unsafe-type-assertion': 'off',
        'typescript/strict-boolean-expressions': 'off',
        'typescript/prefer-nullish-coalescing': 'off',
      },
    },
  ],
})
