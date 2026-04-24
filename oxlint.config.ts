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
    // Standard ultracite disables
    'func-style': 'off',
    'import/no-relative-parent-imports': 'off',
    'no-inline-comments': 'off',
    'no-use-before-define': 'off',
    'no-void': 'off',
    'no-warning-comments': 'off',
    'require-await': 'off',
    'typescript/consistent-type-definitions': 'off',
    'typescript/triple-slash-reference': 'off',
    'sort-keys': 'off',
    'array-type': 'off',

    // Project specific
    'no-nested-ternary': 'off',
    'unicorn/no-nested-ternary': 'off',
    'unicorn/number-literal-case': 'off',
    'typescript/no-explicit-any': 'off',
    'typescript/no-non-null-assertion': 'off',
    'typescript/prefer-readonly-parameter-types': 'off',
    complexity: 'off',
    'unicorn/consistent-function-scoping': 'off',
    'unicorn/no-useless-undefined': 'off',

    // React
    'react/react-in-jsx-scope': 'off',
    'react/jsx-filename-extension': 'off',
    'react/jsx-max-depth': 'off',
    'react/no-multi-comp': 'off',
    'react/jsx-handler-names': 'off',
    'react/jsx-props-no-spreading': 'off',
    'react/only-export-components': 'off',

    // Use the upstream React Hooks plugin to recover the React Compiler /
    // Hooks rule surface that Oxlint's native react plugin does not fully cover.
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
      files: ['**/convex/**/*.{ts,tsx}'],
      rules: {
        // Useful pattern with convex ctx.* functions.
        'promise/prefer-await-to-then': 'off',

        // Convex doesn't support kebab-case.
        'unicorn/filename-case': 'off',

        // Incompatible with matching `undefined` in index queries.
        'unicorn/no-useless-undefined': 'off',
      },
    },
    {
      files: [
        'packages/backend/convex/snapshots/**/*.{ts,tsx}',
        'packages/backend/convex/db/or/sources.ts',
      ],
      rules: {
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
