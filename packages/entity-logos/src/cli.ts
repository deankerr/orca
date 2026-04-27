import { Command } from 'commander'

import { build } from './pipeline'
import { pullRemoteLogos } from './pipeline/remote'

const program = new Command()

program.name('logos').description('Build and pull ORCA entity logos').showHelpAfterError()

program
  .command('build')
  .description('Build public logo assets and the package manifest from local sources')
  .option('--pull', 'Pull missing provider logos from the remote source before building')
  .action(async (options: { pull?: boolean }) => {
    if (options.pull === true) {
      await pullRemoteLogos()
    }

    await build()
  })

program
  .command('pull')
  .description('Download missing provider logos into the remote source directory')
  .action(async () => {
    await pullRemoteLogos()
  })

program.parse()
