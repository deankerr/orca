import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  plugins: [
    devtools(),
    nitro(),
    tailwindcss(),
    tanstackStart(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  // Isolated installs leave CommonJS dependencies such as use-sync-external-store unable to resolve
  // their runtime require('react') from the server output; bundling every SSR dependency resolves it.
  ...(command === 'build' && { ssr: { noExternal: true } }),
}))
