import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { connect } from '@orca/backend/objects/client'
import { Command, Option } from 'commander'

const deployment = new Option('-d, --deployment <name>', 'object source deployment').default(
  'dependable-husky-550',
)

// Reads only; the key comes from the environment so it never appears in shell history or output.
function reader(options: { deployment: string }) {
  return connect({ apiKey: process.env.ORCA_OBJECTS_API_KEY ?? '', deployment: options.deployment })
}

const program = new Command()
  .name('scan-download')
  .description('List and download raw stored scans through the object API')
  .showHelpAfterError()

program
  .command('names')
  .description('Print scan object names at or after a name prefix, such as scan.2026-10-24')
  .argument('<at-or-after>', 'first name to include, compared lexically')
  .option('-n, --limit <count>', 'maximum names', '1')
  .addOption(new Option('--order <order>', 'listing order').choices(['asc', 'desc']).default('asc'))
  .addOption(deployment)
  .action(
    async (
      atOrAfter: string,
      options: { deployment: string; limit: string; order: 'asc' | 'desc' },
    ) => {
      const names = await reader(options).namesAtOrAfter({
        atOrAfter,
        limit: Number(options.limit),
        order: options.order,
        path: 'scans',
      })
      console.log(names.join('\n'))
    },
  )

program
  .command('load')
  .description('Write each named scan as decompressed JSONL into a directory')
  .argument('<names...>', 'scan object names from the names command')
  .requiredOption('-o, --output <directory>', 'destination directory outside the repository')
  .addOption(deployment)
  .action(async (names: string[], options: { deployment: string; output: string }) => {
    const source = reader(options)
    await mkdir(options.output, { recursive: true })

    for (const name of names) {
      const [text] = await source.loadMany([{ name, path: 'scans' }])

      if (text === null || text === undefined) {
        throw new Error(`Missing scan ${name}`)
      }

      await writeFile(path.join(options.output, name), text)
      console.error(`Wrote ${name}`)
    }
  })

await program.parseAsync()
