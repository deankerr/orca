import { ScanArtifactEntry } from './schema'

export type ScanArtifact = {
  id: string
  scan_at: string
  text: string
}

export function createScanArtifact(
  entries: Omit<ScanArtifactEntry, 'scan_at'>[],
  scan_at: string = new Date().toISOString(),
): ScanArtifact {
  const text = `${entries
    .map((entry) =>
      JSON.stringify({
        scan_at,
        ...entry,
      }),
    )
    .join('\n')}\n`

  return {
    id: `scan.${scan_at}.jsonl`,
    scan_at,
    text,
  }
}

export function parseScanArtifact(text: string): ScanArtifactEntry[] {
  const entries = []

  for (const line of text.split('\n')) {
    if (line.length === 0) {
      continue
    }

    entries.push(ScanArtifactEntry.parse(JSON.parse(line)))
  }

  return entries
}
