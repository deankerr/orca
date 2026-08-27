import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { writeJsonOutput } from './json-output.ts'

test('writes formatted JSON beneath the configured output directory', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-json-output-'))

  try {
    const outputPath = await writeJsonOutput(directory, 'report.json', { ready: true })

    expect(outputPath).toBe(path.join(directory, 'report.json'))
    expect(await Bun.file(outputPath).text()).toBe('{\n  "ready": true\n}\n')
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('requires an output directory', () => {
  expect(writeJsonOutput(undefined, 'report.json', {})).rejects.toThrow('Set OUTPUT_PATH')
})
