import { rename, rm } from 'node:fs/promises'
import path from 'node:path'

/** Publish only completed reports; each implicit destination belongs to one invocation. */
export async function writeReport(
  contents: string,
  destination: { scanAt: string; format: 'html' | 'json'; output?: string },
): Promise<string> {
  const output = path.resolve(
    destination.output ??
      `scan-profile.${destination.scanAt}.${crypto.randomUUID()}.${destination.format}`,
  )

  const temporary = path.join(
    path.dirname(output),
    `.${path.basename(output)}.${crypto.randomUUID()}.tmp`,
  )

  try {
    await Bun.write(temporary, contents)
    await rename(temporary, output)
  } finally {
    await rm(temporary, { force: true })
  }

  return output
}
