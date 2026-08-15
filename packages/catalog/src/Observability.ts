import * as Axiom from 'alchemy/Axiom'
import { Stack } from 'alchemy/Stack'

const names = (stage: string) => ({
  ingest: `orca-catalog-${stage}-ingest`,
  logs: `orca-catalog-${stage}-logs`,
})

/**
 * Operational logs are deliberately stage-local and short-lived. They describe the running
 * catalog service; they are not product history and never enter the archive.
 */
export const CatalogLogs = Axiom.Dataset(
  'Logs',
  // oxlint-disable-next-line react-hooks/rules-of-hooks -- Alchemy Stack context, not a React hook.
  Stack.useSync(({ stage }) => ({
    description: `ORCA catalog operational logs for Alchemy stage '${stage}'`,
    kind: 'otel:logs:v1' as const,
    name: names(stage).logs,
    retentionDays: 7,
    useRetentionPeriod: true,
  })),
)

/** A runtime-only bearer restricted to creating records in this stage's logs dataset. */
export const CatalogLogIngest = Axiom.ApiToken(
  'LogIngest',
  // oxlint-disable-next-line react-hooks/rules-of-hooks -- Alchemy Stack context, not a React hook.
  Stack.useSync(({ stage }) => {
    const resourceNames = names(stage)
    return {
      datasetCapabilities: {
        [resourceNames.logs]: { ingest: ['create'] },
      },
      description: `ORCA catalog log ingest for Alchemy stage '${stage}'`,
      name: resourceNames.ingest,
    }
  }),
)
