import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { z } from 'zod'

import { REMOTE_SOURCE_DIR } from '../constants'
import { normalizeLogoKey } from '../logo-key'
import { packagePath } from './paths'

type PullStats = {
  downloaded: number
  existing: number
  missingIcon: number
  failed: number
}

const REMOTE_PROVIDERS_URL = 'https://openrouter.ai/api/frontend/all-providers'

const RemoteProviderSchema = z.object({
  icon: z
    .object({
      url: z.string().optional(),
    })
    .optional(),
  slug: z.string(),
})

const RemoteProvidersSchema = z.object({
  data: z.array(RemoteProviderSchema),
})

export async function pullRemoteLogos(): Promise<void> {
  const remoteSourceDir = packagePath(REMOTE_SOURCE_DIR)
  await mkdir(remoteSourceDir, { recursive: true })

  console.log('Pulling provider logos from remote...')
  const response = await fetch(REMOTE_PROVIDERS_URL)
  if (!response.ok) {
    throw new Error(`Remote providers request failed with HTTP ${response.status}`)
  }

  const { data: providers } = RemoteProvidersSchema.parse(await response.json())
  const stats: PullStats = {
    downloaded: 0,
    existing: 0,
    failed: 0,
    missingIcon: 0,
  }

  for (const provider of providers) {
    const iconUrl = provider.icon?.url
    if (iconUrl === undefined || !iconUrl.startsWith('http')) {
      stats.missingIcon += 1
      continue
    }

    const key = normalizeLogoKey(provider.slug)
    const outputPath = join(remoteSourceDir, `${key}.png`)

    if (await Bun.file(outputPath).exists()) {
      stats.existing += 1
      continue
    }

    try {
      await downloadIcon({ iconUrl, outputPath })
      stats.downloaded += 1
      console.log(`  Downloaded ${key}.png`)
    } catch (error) {
      stats.failed += 1
      console.warn(`  Skipped ${key}:`, error instanceof Error ? error.message : error)
    }
  }

  console.log('Remote logo pull summary')
  console.log(`  Providers: ${providers.length}`)
  console.log(`  Downloaded: ${stats.downloaded}`)
  console.log(`  Already local: ${stats.existing}`)
  console.log(`  Missing icon URL: ${stats.missingIcon}`)
  console.log(`  Failed: ${stats.failed}`)
  console.log('  Removed: 0')
}

async function downloadIcon(args: { iconUrl: string; outputPath: string }): Promise<void> {
  const response = await fetch(args.iconUrl)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  await Bun.write(args.outputPath, await response.arrayBuffer())
}
