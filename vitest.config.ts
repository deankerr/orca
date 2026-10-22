import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        '**/node_modules/**',
        '**/_generated/**',
        '**/*.test.ts',
        '**/*.testing.ts',
        '**/*.d.ts',
        '**/*.config.*',
        '**/.next/**',
      ],
      include: ['apps/*/**/*.ts', 'apps/*/**/*.tsx', 'packages/*/**/*.ts'],
      provider: 'v8',
    },
    projects: [
      {
        root: 'packages/backend',
        test: { environment: 'edge-runtime', include: ['convex/**/*.test.ts'], name: 'backend' },
      },
      {
        root: 'packages/discord-sender',
        test: {
          environment: 'edge-runtime',
          include: ['src/**/*.test.ts'],
          name: 'discord-sender',
        },
      },
      {
        resolve: { alias: { '@': fileURLToPath(new URL('apps/web', import.meta.url)) } },
        root: 'apps/web',
        test: { environment: 'node', include: ['**/*.test.ts'], name: 'web' },
      },
      {
        root: 'apps/logos',
        test: { environment: 'node', include: ['src/**/*.test.ts'], name: 'logos' },
      },
      {
        root: 'packages/json-profile',
        test: { environment: 'node', include: ['**/*.test.ts'], name: 'json-profile' },
      },
      {
        root: 'packages/scripts',
        test: { environment: 'node', include: ['**/*.test.ts'], name: 'scripts' },
      },
    ],
    restoreMocks: true,
    server: { deps: { inline: [/@convex-dev\//u] } },
  },
})
