import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { REMOTE_SOURCE_DIR } from './constants'
import { normalizeLogoKey } from './keys'

const PACKAGE_ROOT = resolve(import.meta.dirname, '..')

type RemoteProvider = {
  slug?: unknown
  icon?: {
    url?: unknown
  }
}

type PullStats = {
  downloaded: number
  existing: number
  missingIcon: number
  failed: number
}

const REMOTE_PROVIDERS_URL = 'https://openrouter.ai/api/frontend/all-providers'

function isProvider(value: unknown): value is RemoteProvider {
  return typeof value === 'object' && value !== null && 'slug' in value
}

function parseProviders(value: unknown): RemoteProvider[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('data' in value) ||
    !Array.isArray(value.data)
  ) {
    throw new Error('Invalid remote providers response')
  }

  return value.data.filter(isProvider)
}

async function iconExists(path: string): Promise<boolean> {
  return Bun.file(path).exists()
}

async function downloadIcon(args: { iconUrl: string; outputPath: string }): Promise<void> {
  const response = await fetch(args.iconUrl)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  await Bun.write(args.outputPath, await response.arrayBuffer())
}

export async function pullRemoteLogos(): Promise<void> {
  const remoteSourceDir = join(PACKAGE_ROOT, REMOTE_SOURCE_DIR)
  await mkdir(remoteSourceDir, { recursive: true })

  console.log(`Pulling provider logos from remote...`)
  const response = await fetch(REMOTE_PROVIDERS_URL)
  if (!response.ok) {
    throw new Error(`Remote providers request failed with HTTP ${response.status}`)
  }

  const providers = parseProviders(await response.json())
  const stats: PullStats = {
    downloaded: 0,
    existing: 0,
    failed: 0,
    missingIcon: 0,
  }

  for (const provider of providers) {
    if (typeof provider.slug !== 'string') {
      stats.failed += 1
      console.warn(`Skipped provider with invalid slug`)
      continue
    }

    const iconUrl = provider.icon?.url
    if (typeof iconUrl !== 'string' || !iconUrl.startsWith('http')) {
      stats.missingIcon += 1
      continue
    }

    const key = normalizeLogoKey(provider.slug)
    const outputPath = join(remoteSourceDir, `${key}.png`)

    if (await iconExists(outputPath)) {
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
