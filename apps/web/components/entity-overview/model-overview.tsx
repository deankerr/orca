'use client'

import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import { useQuery } from '@tanstack/react-query'

import { DataValue, DataLink, DataDate, DataDescription } from './overview-data'
import {
  OverviewHeader,
  OverviewActions,
  OverviewChartAction,
  OverviewStatus,
} from './overview-layout'
import { reasoningLabel, orderEfforts } from './reasoning'

export function ModelOverview({ slug }: { slug: string }) {
  const { data, isPending, error, refetch } = useQuery(
    convexQuery(api.v3.public.entityOverviews.model, { modelId: slug }),
  )

  if (!data) {
    return (
      <OverviewStatus
        pending={isPending}
        error={!!error}
        kind="Model"
        retry={() => {
          void refetch()
        }}
      />
    )
  }

  return (
    <>
      <OverviewHeader slug={slug} name={data.display_name} />
      <div className="flex flex-col gap-4 p-4">
        <OverviewActions type="model" slug={slug}>
          <OverviewChartAction modelId={slug} />
        </OverviewActions>
        <DataDescription value={data.description} />
        <dl>
          <DataValue label="Author" value={data.author_display_name} />
          <DataDate label="Listed on OpenRouter" value={data.created_at} />
          <DataDate label="Knowledge Cutoff" value={data.knowledge_cutoff} />
          <DataValue label="Input" value={data.input_modalities} />
          <DataValue label="Output" value={data.output_modalities} />
          <DataValue
            label="Reasoning"
            value={reasoningLabel(
              data.supports_reasoning,
              data['reasoning_config.is_mandatory_reasoning'],
            )}
          />
          <DataValue
            label="Effort Levels"
            value={orderEfforts(data['reasoning_config.supported_reasoning_efforts'])}
          />
        </dl>
        <div>
          <DataLink label="OpenRouter" href={`https://openrouter.ai/${slug}`} />
          <DataLink
            label="Hugging Face"
            href={data.hf_slug === null ? null : `https://huggingface.co/${data.hf_slug}`}
          />
        </div>
      </div>
    </>
  )
}
