import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { LOBEHUB_AVATAR_SOURCE_DIR, PUBLIC_AVATAR_DIR } from './constants'
import { normalizeLogoKey } from './keys'
import type { LogoEntry } from './manifest'

const PACKAGE_ROOT = resolve(import.meta.dirname, '..')

export async function buildAvatarLogos(): Promise<LogoEntry[]> {
  const sourceDir = join(PACKAGE_ROOT, LOBEHUB_AVATAR_SOURCE_DIR)
  const publicAvatarDir = join(PACKAGE_ROOT, PUBLIC_AVATAR_DIR)
  await rm(publicAvatarDir, { force: true, recursive: true })
  await mkdir(publicAvatarDir, { recursive: true })

  const glob = new Bun.Glob('*.webp')
  const logos: LogoEntry[] = []

  for await (const file of glob.scan({ cwd: sourceDir })) {
    const key = normalizeLogoKey(file)
    const bytes = await Bun.file(join(sourceDir, file)).arrayBuffer()
    await Bun.write(join(publicAvatarDir, `${key}.webp`), bytes)
    logos.push({ avatar: 'webp', key })
  }

  return logos.toSorted((a, b) => a.key.localeCompare(b.key))
}

if (import.meta.main) {
  const logos = await buildAvatarLogos()
  console.log(`Wrote ${logos.length} avatar logos to apps/web/public/logos/avatar/`)
}
