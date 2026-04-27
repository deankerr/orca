import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import { PACKAGE_OUTPUT_MANIFEST } from '../constants'
import { packagePath } from './paths'
import type { CatalogLogo } from './types'

type ManifestLogo = {
  key: string
  avatar?: 'webp'
  color?: 'png'
}

type Manifest = {
  logos: ManifestLogo[]
}

const MANIFEST_PATH = packagePath(PACKAGE_OUTPUT_MANIFEST)

export async function writeManifest(logos: CatalogLogo[]): Promise<void> {
  await mkdir(dirname(MANIFEST_PATH), { recursive: true })
  await Bun.write(MANIFEST_PATH, `${JSON.stringify(toManifest(logos), null, 2)}\n`)
}

function toManifest(logos: CatalogLogo[]): Manifest {
  return {
    logos: logos.map((logo) => ({
      avatar: logo.avatar === undefined ? undefined : 'webp',
      color: logo.color === undefined ? undefined : 'png',
      key: logo.key,
    })),
  }
}
