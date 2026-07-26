// * Pull one capture pass out of R2 and write its artifacts, unzipped, where they can be read.
// * Nothing is interpreted: files land as they were stored, minus the gzip.
// * Run: bun run raw [pass] [--list [n]] [--pretty] [--scope <match>] [--out <dir>]
import { Buffer } from 'node:buffer'

import { Command } from 'commander'
import * as Schema from 'effect/Schema'
import prettyBytes from 'pretty-bytes'

import { forget, passes, readText, select } from './artifacts.ts'
import type { Pass } from './artifacts.ts'

const program = new Command()
  .name('raw')
  .description('write capture passes, unzipped, to a local directory')
  .argument('[pass]', 'captured_at, or a prefix of one (default: the latest pass)')
  .option('-l, --list [count]', 'list the most recent passes and exit')
  .option('-n, --last <count>', 'how many passes, ending at the selected one', '1')
  .option('-o, --out <dir>', 'directory to write into', 'output')
  .option('-p, --pretty', 'indent the JSON, and split observations into one file per scope')
  .option('-r, --refresh', 're-read the Worker url and the key listing from the stack')
  .option('-s, --scope <match>', 'only observations whose slug contains this (implies --pretty)')
  .parse()

const options = program.opts<{
  last: string
  list?: boolean | string
  out: string
  pretty?: boolean
  refresh?: boolean
  scope?: string
}>()

// * only what naming a file needs — the observation itself is written through untouched
const Observation = Schema.Struct({ slug: Schema.String, variant: Schema.optional(Schema.String) })
const decodeObservation = Schema.decodeUnknownSync(Observation)

const write = async (path: string, contents: string) => {
  await Bun.write(path, contents)
  console.log(`${path} ${prettyBytes(Buffer.byteLength(contents))}`)
}

// * one pass on disk, under its own captured_at; returns how many files it wrote
const writePass = async (pass: Pass) => {
  const outDir = `${options.out.replace(/\/+$/, '')}/${pass.captured_at}/`
  const pretty = options.pretty === true || options.scope !== undefined
  let written = 0

  for (const key of pass.keys) {
    const name = key.slice(`raw/${pass.captured_at}/`.length).replace(/\.gz$/, '')

    // * --scope asks for observations, so the catalog and the pass summary are not fetched at all
    // * — over --last N passes that is the difference between a few hundred KB and a few hundred MB
    if (options.scope !== undefined && !name.startsWith('observations/')) {
      continue
    }
    const text = await readText(key)

    // * one JSON object per line — verbatim as jsonl, or one indented file per scope
    if (name.startsWith('observations/')) {
      if (!pretty) {
        await write(outDir + name, text)
        written += 1
        continue
      }
      for (const line of text.trim().split('\n')) {
        const observation: unknown = JSON.parse(line)
        const { slug, variant } = decodeObservation(observation)
        if (options.scope !== undefined && !slug.includes(options.scope)) {
          continue
        }
        const file = `${slug.replaceAll('/', '_')}__${variant ?? 'none'}.json`
        await write(`${outDir}observations/${file}`, JSON.stringify(observation, null, 2))
        written += 1
      }
      continue
    }

    await write(outDir + name, pretty ? JSON.stringify(JSON.parse(text), null, 2) : text)
    written += 1
  }

  return written
}

const main = async () => {
  if (options.refresh === true) {
    await forget()
  }
  const all = await passes()

  // * --list: say what is there and stop
  if (options.list !== undefined) {
    if (all.length === 0) {
      throw new Error('no complete passes in the bucket')
    }
    const count = typeof options.list === 'string' ? Number(options.list) : 20
    for (const pass of all.slice(-count)) {
      console.log(`${pass.captured_at}  ${pass.keys.length} objects`)
    }
    console.log(`${all.length} passes, ${all.at(0)?.captured_at} … ${all.at(-1)?.captured_at}`)
    return
  }

  const selected = select(all, { last: options.last, pass: program.args[0] })
  let written = 0
  for (const pass of selected) {
    written += await writePass(pass)
  }

  if (written === 0) {
    console.log(`nothing matched --scope ${options.scope}`)
    return
  }
  const range =
    selected.length === 1
      ? selected[0]?.captured_at
      : `${selected.at(0)?.captured_at} … ${selected.at(-1)?.captured_at}`
  console.log(`${selected.length} passes (${range}): ${written} files → ${options.out}/`)
}

// * a bad argument is a normal outcome for a CLI — say what is wrong, not where it was thrown
await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
