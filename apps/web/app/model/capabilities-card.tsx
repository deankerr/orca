'use client'

import type { LucideIcon } from 'lucide-react'
import { BrainCog, ImageIcon, MessageSquare } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { CardContent } from '@/components/ui/card'

import { ModelPageCard } from './model-page-card'
import type { Model, ModelEndpoint } from './types'

function CapabilityFact({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: LucideIcon
}) {
  return (
    <div className="grid min-w-0 grid-cols-[1rem_4rem_minmax(0,1fr)] items-center gap-2 rounded-md border px-3 py-2 text-xs">
      <Icon className="size-4 text-muted-foreground" />
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 truncate text-right font-mono">{value}</div>
    </div>
  )
}

export function CapabilitiesCard({
  endpoints,
  model,
}: {
  endpoints: readonly ModelEndpoint[]
  model: Model
}) {
  const endpointParameterCounts = new Map<string, number>()

  for (const endpoint of endpoints) {
    for (const parameter of endpoint.supportedParameters) {
      endpointParameterCounts.set(parameter, (endpointParameterCounts.get(parameter) ?? 0) + 1)
    }
  }

  const parameters = [...endpointParameterCounts.entries()].toSorted(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )

  return (
    <ModelPageCard title="Capabilities">
      <CardContent className="grid gap-4 md:grid-cols-[16rem_1fr]">
        <div className="grid gap-2">
          <CapabilityFact
            icon={MessageSquare}
            label="Input"
            value={model.inputModalities.join(', ')}
          />
          <CapabilityFact
            icon={ImageIcon}
            label="Output"
            value={model.outputModalities.join(', ')}
          />
          <CapabilityFact
            icon={BrainCog}
            label="Reasoning"
            value={model.reasoning ? 'yes' : 'no'}
          />
        </div>

        <div>
          <div className="mb-2 text-xs text-muted-foreground uppercase">Supported Parameters</div>
          <div className="flex flex-wrap gap-1.5">
            {parameters.length > 0 ? (
              parameters.map(([parameter, count]) => (
                <Badge key={parameter} variant="outline" className="h-6 rounded-sm font-mono">
                  {parameter}
                  <span className="text-muted-foreground">{count}</span>
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">
                No provider parameters reported.
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </ModelPageCard>
  )
}
