'use client'

import type { AlertFact, EntityAlert } from '@orca/backend/alerts/curate'
import { InfoIcon, PlusCircleIcon } from 'lucide-react'

import { EntityAvatar } from '@/components/shared/entity-avatar'
import {
  EntityIdentity,
  EntityIdentityContent,
  EntityIdentityName,
  EntityIdentitySlug,
} from '@/components/shared/entity-identity'
import { InlineMarkdown } from '@/components/shared/inline-markdown'
import { Badge } from '@/components/ui/badge'
import { findFact, priceFields } from '@/lib/backend'
import { cn } from '@/lib/utils'

import { EntityOverviewTrigger } from '../entity-overview/trigger'
import { FieldChangeList, FieldItem, FieldItemSet, FieldUnit } from './field-display'
import { fieldLabel, formatChangeUnit, formatChangeValue } from './field-format'

function lifecycleLabel(event: EntityAlert): string {
  const kind = event.entity_kind

  if ('changes' in event) {
    return `${kind} updated`
  }

  if ('before' in event) {
    return kind === 'endpoint' ? 'endpoint unlisted' : `${kind} has no more listed endpoints`
  }

  if (event.previously_known === false) {
    return `${kind} discovered`
  }

  if (kind === 'endpoint') {
    return event.previously_known === true ? 'endpoint relisted' : 'endpoint listed'
  }

  return kind === 'provider' && event.previously_known === true
    ? 'provider has listed endpoints again'
    : `${kind} now has listed endpoints`
}

export function EntityEventCard({
  event,
  onEndpointSelect,
}: {
  event: EntityAlert
  onEndpointSelect: (id: string) => void
}) {
  const removed = 'before' in event
  const endpoint = event.entity_kind === 'endpoint' ? event.context.endpoint : null

  return (
    <div className="rounded-none border bg-card/50">
      <div className="grid auto-cols-fr grid-flow-col items-center border-b border-border/50 [&>div]:flex [&>div]:px-3 [&>div]:py-1.5 [&>div]:not-first:justify-end">
        {event.entity_kind !== 'provider' && (
          <div>
            <EventIdentity
              type="model"
              id={event.context.model.model_id}
              name={event.context.model.display_name}
              unlisted={event.entity_kind === 'model' && removed}
            />
          </div>
        )}
        {event.entity_kind !== 'model' && (
          <div className={cn(endpoint && 'border-l border-border/50 bg-card')}>
            <EventIdentity
              type="provider"
              id={event.context.provider.provider_id}
              name={endpoint?.provider_display_name ?? event.context.provider.display_name}
              label={endpoint?.provider_tag}
              unlisted={event.entity_kind === 'provider' && removed}
              className={cn(endpoint && 'flex-row-reverse text-right')}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-2.5">
        <Badge variant={removed ? 'destructive' : 'secondary'}>
          {'after' in event ? <PlusCircleIcon /> : <InfoIcon />}
          {lifecycleLabel(event)}
        </Badge>
        {endpoint && (
          <button
            type="button"
            className="cursor-pointer font-mono text-xs text-muted-foreground underline-offset-4 hover:underline"
            title={`View endpoint history: ${endpoint.endpoint_id}`}
            aria-label={`View endpoint history: ${endpoint.endpoint_id}`}
            onClick={() => {
              onEndpointSelect(endpoint.endpoint_id)
            }}
          >
            {endpoint.endpoint_id.slice(0, 6)}
          </button>
        )}
      </div>

      <EventDetails event={event} />
    </div>
  )
}

function EventDetails({ event }: { event: EntityAlert }) {
  if ('changes' in event) {
    return (
      <div className="px-6 pb-2.5">
        <FieldChangeList fields={event.changes} />
      </div>
    )
  }

  if (event.entity_kind === 'model') {
    return (
      <div className="space-y-2.5 px-6 pb-2.5">
        {'before' in event && <p className="text-xs text-muted-foreground">When last observed:</p>}
        <ModelFacts facts={'after' in event ? event.after : event.before} />
      </div>
    )
  }

  if (event.entity_kind !== 'endpoint' || !('after' in event)) {
    return null
  }

  return (
    <div className="px-6 pb-2.5">
      <FactList
        facts={event.after}
        fields={[
          'context_length',
          'max_completion_tokens',
          'quantization',
          ...Object.keys(priceFields),
          'pricing.discount',
          'data_policy.training',
          'data_policy.retains_prompts',
          'data_policy.retention_days',
        ]}
      />
      {event.pricing_is_scheduled === true && (
        <p className="mt-1.5 font-mono text-xs">Price schedule detected.</p>
      )}
    </div>
  )
}

function EventIdentity({
  type,
  id,
  name,
  label = id,
  unlisted = false,
  className,
}: {
  type: 'model' | 'provider'
  id: string
  name: string
  label?: string | undefined
  unlisted?: boolean
  className?: string
}) {
  return (
    <EntityOverviewTrigger type={type} slug={id}>
      <EntityIdentity
        data-unavailable={unlisted || undefined}
        className={cn(
          'data-unavailable:[&_[data-slot=entity-avatar]]:brightness-50 data-unavailable:[&_[data-slot=entity-identity-name]]:text-muted-foreground data-unavailable:[&_[data-slot=entity-identity-slug]]:line-through',
          className,
        )}
      >
        <EntityAvatar slug={id} />
        <EntityIdentityContent>
          <EntityIdentityName>{name}</EntityIdentityName>
          <EntityIdentitySlug>{label}</EntityIdentitySlug>
        </EntityIdentityContent>
      </EntityIdentity>
    </EntityOverviewTrigger>
  )
}

function ModelFacts({ facts }: { facts: readonly AlertFact[] }) {
  const description = findFact(facts, 'description', 'prose')?.value
  const warning = findFact(facts, 'warning_message', 'prose')?.value

  return (
    <>
      {description !== undefined && description !== null && (
        <p className="text-xs whitespace-pre-line text-muted-foreground">
          <InlineMarkdown text={description} />
        </p>
      )}
      <FieldItemSet>
        <FieldItem label="modalities">
          <div className="flex flex-wrap items-center gap-1.5 py-0.5">
            {findFact(facts, 'input_modalities', 'list')?.value?.map((item) => (
              <Badge key={`in:${item}`} variant="secondary">
                {item}
              </Badge>
            ))}
            <span className="text-muted-foreground">→</span>
            {findFact(facts, 'output_modalities', 'list')?.value?.map((item) => (
              <Badge key={`out:${item}`} variant="secondary">
                {item}
              </Badge>
            ))}
            {findFact(facts, 'supports_reasoning', 'flag')?.value === true && (
              <Badge variant="secondary">reasoning</Badge>
            )}
          </div>
        </FieldItem>
      </FieldItemSet>
      <FactList facts={facts} fields={['knowledge_cutoff']} />
      {warning !== undefined && warning !== null && (
        <p className="text-xs whitespace-pre-line text-muted-foreground">
          <InlineMarkdown text={warning} />
        </p>
      )}
    </>
  )
}

function FactList({ facts, fields }: { facts: readonly AlertFact[]; fields: string[] }) {
  return (
    <FieldItemSet>
      {fields.map((field) => {
        const item = facts.find((candidate) => candidate.field === field)

        // Unknown facts, false flags, and a zero discount have nothing to show.
        if (
          item === undefined ||
          item.value === null ||
          item.value === false ||
          (item.kind === 'percent' && item.value === 0)
        ) {
          return null
        }

        const unit = formatChangeUnit(item)

        return (
          <FieldItem key={field} label={fieldLabel(field)}>
            {formatChangeValue(item)}
            {unit && <FieldUnit>{unit}</FieldUnit>}
          </FieldItem>
        )
      })}
    </FieldItemSet>
  )
}
