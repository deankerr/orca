import { ConvexError } from 'convex/values'

import type { ObjectIdentity } from '../objects'
import type { NameSelection } from '../objects/local'
import { parseScan } from '../scan/parse'
import { scanTime } from '../scan/time'

export interface ScanReader {
  load: (identity: ObjectIdentity) => Promise<string | null>
  namesAtOrAfter: (selection: NameSelection) => Promise<string[]>
}

/** Select before downloading; only the requested scan's contents enter memory. */
export async function loadScan(reader: ScanReader, requested = 'latest') {
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
      throw new ConvexError({ message: 'The source has no stored scans.', path: 'scans' })
    }

    if (matchedTime === undefined) {
      throw new ConvexError({ message: 'Invalid scan object name', name })
    }

    scanAt = matchedTime
  }

  scanTime.parse(scanAt)
  return parseScan(scanAt, await reader.load({ name: `scan.${scanAt}.jsonl`, path: 'scans' }))
}
