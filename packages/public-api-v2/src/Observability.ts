import * as Axiom from 'alchemy/Axiom'
import { Stack } from 'alchemy/Stack'

const telemetryNames = (stage: string) => ({
  ingest: `orca-public-api-v2-${stage}-ingest`,
  logs: `orca-public-api-v2-${stage}-logs`,
})

/** Short-lived operational logs remain telemetry rather than product state. */
export const PublicApiV2Logs = Axiom.Dataset(
  'Logs',
  // oxlint-disable-next-line react-hooks/rules-of-hooks -- Alchemy Stack context, not React.
  Stack.useSync(({ stage }) => ({
    description: `ORCA Public API V2 operational logs for Alchemy stage '${stage}'`,
    kind: 'otel:logs:v1' as const,
    name: telemetryNames(stage).logs,
    retentionDays: 7,
    useRetentionPeriod: true,
  })),
)

/** Runtime bearer restricted to creating records in this stage's logs dataset. */
export const PublicApiV2LogIngest = Axiom.ApiToken(
  'LogIngest',
  // oxlint-disable-next-line react-hooks/rules-of-hooks -- Alchemy Stack context, not React.
  Stack.useSync(({ stage }) => {
    const resourceNames = telemetryNames(stage)
    return {
      datasetCapabilities: {
        [resourceNames.logs]: { ingest: ['create'] },
      },
      description: `ORCA Public API V2 log ingest for Alchemy stage '${stage}'`,
      name: resourceNames.ingest,
    }
  }),
)
