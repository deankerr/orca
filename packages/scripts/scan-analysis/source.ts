import type { createObjectReader } from '../../backend/convex/objects/client'
import { parseScan } from '../../backend/convex/scan/parse'
import { scanTime } from '../../backend/convex/scan/time'

/** Select before downloading; only the requested scan's contents enter memory. */
export async function loadScan(
  reader: ReturnType<typeof createObjectReader>,
  requested = 'latest',
) {
  let scanAt = requested

  if (requested === 'latest') {
    const [name] = await reader.namesAtOrAfter({
      atOrAfter: '',
      limit: 1,
      order: 'desc',
      path: 'scans',
    })

    const matchedTime =
      name === undefined ? undefined : /^scan\.(?<time>.+)\.jsonl$/.exec(name)?.groups?.time

    if (name === undefined) {
      throw new Error('The source has no stored scans.')
    }

    if (matchedTime === undefined) {
      throw new Error(`Invalid scan object name: ${name}`)
    }

    scanAt = matchedTime
  }

  scanTime.parse(scanAt)
  return parseScan(scanAt, await reader.load({ name: `scan.${scanAt}.jsonl`, path: 'scans' }))
}
