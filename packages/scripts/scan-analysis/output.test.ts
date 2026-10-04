import { expect, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { writeReport } from './output'

test('report replacement preserves the previous file when the new write fails partway through', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-report-'))
  const output = path.join(directory, 'report.json')
  const destination = { format: 'json' as const, output, scanAt: '2026-10-03T00:00:00.000Z' }

  await writeFile(output, 'previous report')

  const write = spyOn(Bun, 'write').mockImplementationOnce(async (file) => {
    if (typeof file !== 'string') {
      throw new TypeError('Expected a report path')
    }

    await writeFile(file, 'partial')
    throw new Error('Simulated failed write')
  })

  try {
    await rejects(writeReport('replacement report', destination), /Simulated failed write/)
    expect(await Bun.file(output).text()).toBe('previous report')
    expect(await readdir(directory)).toEqual(['report.json'])
    write.mockRestore()

    expect(await writeReport('complete replacement', destination)).toBe(output)
    expect(await Bun.file(output).text()).toBe('complete replacement')
    expect(await readdir(directory)).toEqual(['report.json'])
  } finally {
    write.mockRestore()
    await rm(directory, { force: true, recursive: true })
  }
})
