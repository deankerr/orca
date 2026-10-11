'use client'

import { useQuery } from '@tanstack/react-query'

import { useQueryResult } from '@/features/product-readiness/use-query-result'

import type { OverviewRequest } from './context'
import { DataValue, DataLink, DataDate, DataDescription } from './data'
import { OverviewHeader, OverviewActions, PricingHistoryAction, OverviewStatus } from './layout'
import { modelOverviewQuery } from './query-options'
import { reasoningLabel, orderEfforts } from './reasoning'

export function ModelOverview({ request }: { request: OverviewRequest }) {
  const { slug } = request
  const { data, isPending, error, refetch, isSuccess } = useQuery(modelOverviewQuery(slug))
  useQueryResult(request.measurement, isSuccess && data !== null && data !== undefined)

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
          <PricingHistoryAction modelId={slug} />
        </OverviewActions>
        <DataDescription value={data.description} />
        <dl>
          <DataValue label="Author" value={data.author_display_name} />
          <DataDate label="Listed on OpenRouter" value={data.or_created_at} />
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
