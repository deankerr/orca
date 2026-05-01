import { defineConfig } from 'oxfmt'

import { ignorePatterns } from './node_modules/ultracite/config/shared/ignores.mjs'

export default defineConfig({
  ignorePatterns: [
    ...ignorePatterns,
    '.agents/skills',
    '.claude/skills',
    '**/components/ui',
    '**/components/evilcharts',
  ],
  semi: false,
  singleQuote: true,
  sortImports: {},
  sortPackageJson: { sortScripts: true },
  sortTailwindcss: {
    functions: ['cn', 'clsx', 'twMerge'],
    stylesheet: 'apps/web/app/globals.css',
  },
})
