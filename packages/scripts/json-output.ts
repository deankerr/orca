import { rename, rm } from 'node:fs/promises'
import path from 'node:path'

export async function writeJsonOutput(
  outputDirectory: string | undefined,
  filename: string,
  value: unknown,
): Promise<string> {
  if (outputDirectory === undefined || outputDirectory === '') {
    throw new Error('Set OUTPUT_PATH to the report output directory.')
  }

  const outputPath = path.resolve(outputDirectory, filename)
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${process.pid}.${Bun.randomUUIDv7()}.tmp`,
  )

  try {
    await Bun.write(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
    await rename(temporaryPath, outputPath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }

  return outputPath
}
