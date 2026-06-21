'use client'

import type { LucideIcon } from 'lucide-react'
import { BrainCog, ImageIcon, MessageSquare } from 'lucide-react'

import { CardContent } from '@/components/ui/card'

import { ModelPageCard } from './model-page-card'
import type { Model } from './types'

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

export function CapabilitiesCard({ model }: { model: Model }) {
  return (
    <ModelPageCard title="Capabilities">
      <CardContent className="grid gap-2 pb-4 sm:grid-cols-3">
        <CapabilityFact
          icon={MessageSquare}
          label="Input"
          value={model.inputModalities.join(', ')}
        />
        <CapabilityFact icon={ImageIcon} label="Output" value={model.outputModalities.join(', ')} />
        <CapabilityFact icon={BrainCog} label="Reasoning" value={model.reasoning ? 'yes' : 'no'} />
      </CardContent>
    </ModelPageCard>
  )
}
