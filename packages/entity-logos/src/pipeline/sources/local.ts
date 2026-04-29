import { join } from 'node:path'

import { normalizeLogoKey } from '../../logo-key'
import type { LogoAsset, LogoSource } from '../types'

type LocalSource = {
  source: LogoSource
  sourceDir: string
}

const LOCAL_ICON_PATTERN = '*.{png,jpg,jpeg,svg,webp}'

export async function collectLocalLogos(localSource: LocalSource): Promise<LogoAsset[]> {
  const glob = new Bun.Glob(LOCAL_ICON_PATTERN)
  const logos: LogoAsset[] = []

  for await (const file of glob.scan({ cwd: localSource.sourceDir })) {
    logos.push({
      key: normalizeLogoKey(file),
      source: localSource.source,
      sourcePath: join(localSource.sourceDir, file),
    })
  }

  return logos.toSorted((a, b) => a.key.localeCompare(b.key))
}
