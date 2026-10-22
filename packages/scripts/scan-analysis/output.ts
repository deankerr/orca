import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
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

  await mkdir(path.dirname(output), { recursive: true })

  try {
    await writeFile(temporary, contents)
    await rename(temporary, output)
  } finally {
    await rm(temporary, { force: true })
  }

  return output
}
