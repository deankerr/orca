import { rejects } from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import type * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { expect, test, vi } from 'vitest'

import { writeReport } from './output'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return { ...actual, writeFile: vi.fn(actual.writeFile) }
})

test('report replacement preserves the previous file when the new write fails partway through', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-report-'))
  const output = path.join(directory, 'report.json')
  const destination = { format: 'json' as const, output, scanAt: '2026-10-03T00:00:00.000Z' }

  await writeFile(output, 'previous report')

  const { writeFile: originalWrite } = await vi.importActual<typeof fs>('node:fs/promises')
  const write = vi.mocked(writeFile).mockImplementationOnce(async (file) => {
    await originalWrite(file, 'partial')
    throw new Error('Simulated failed write')
  })

  try {
    await rejects(writeReport('replacement report', destination), /Simulated failed write/u)
    expect(await readFile(output, 'utf-8')).toBe('previous report')
    expect(await readdir(directory)).toEqual(['report.json'])
    write.mockRestore()

    expect(await writeReport('complete replacement', destination)).toBe(output)
    expect(await readFile(output, 'utf-8')).toBe('complete replacement')
    expect(await readdir(directory)).toEqual(['report.json'])
  } finally {
    write.mockRestore()
    await rm(directory, { force: true, recursive: true })
  }
})
