'use client'

import type { EntityAlert, FieldValue } from '@orca/backend/convex/alerts/shared/curate'
import { fact } from '@orca/backend/convex/alerts/shared/facts'
import { priceMeters } from '@orca/backend/convex/alerts/shared/pricing'
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
import { cn } from '@/lib/utils'

import { EntityOverviewTrigger } from '../entity-overview/trigger'
import { FieldChangeList, FieldItem, FieldItemSet, FieldUnit } from './field-display'
import { fieldLabel, formatChangeUnit, formatChangeValue } from './field-format'

export function lifecycleLabel(event: EntityAlert): string {
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

      {'changes' in event ? (
        <div className="px-6 pb-2.5">
          <FieldChangeList fields={event.changes} />
        </div>
      ) : event.entity_kind === 'model' ? (
        <div className="space-y-2.5 px-6 pb-2.5">
          {removed && <p className="text-xs text-muted-foreground">When last observed:</p>}
          <ModelFacts facts={'after' in event ? event.after : event.before} />
        </div>
      ) : event.entity_kind === 'endpoint' && 'after' in event ? (
        <div className="px-6 pb-2.5">
          <FactList
            facts={event.after}
            paths={[
              'context_length',
              'max_completion_tokens',
              'quantization',
              ...Object.keys(priceMeters),
              'pricing.discount',
              'data_policy.training',
              'data_policy.retainsPrompts',
              'data_policy.retentionDays',
            ]}
          />
          {fact(event.after, 'pricing.is_scheduled') === true && (
            <p className="mt-1.5 font-mono text-xs">Price schedule detected.</p>
          )}
        </div>
      ) : null}
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
  label?: string
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

function ModelFacts({ facts }: { facts: Record<string, FieldValue> }) {
  return (
    <>
      {typeof facts.description === 'string' && facts.description !== '' && (
        <p className="text-xs whitespace-pre-line text-muted-foreground">
          <InlineMarkdown text={facts.description} />
        </p>
      )}
      <FieldItemSet>
        <FieldItem label="modalities">
          <div className="flex flex-wrap items-center gap-1.5 py-0.5">
            {Array.isArray(facts.input_modalities) &&
              facts.input_modalities.map((item) => (
                <Badge key={`in:${item}`} variant="secondary">
                  {item}
                </Badge>
              ))}
            <span className="text-muted-foreground">→</span>
            {Array.isArray(facts.output_modalities) &&
              facts.output_modalities.map((item) => (
                <Badge key={`out:${item}`} variant="secondary">
                  {item}
                </Badge>
              ))}
            {facts.supports_reasoning === true && <Badge variant="secondary">reasoning</Badge>}
          </div>
        </FieldItem>
      </FieldItemSet>
      <FactList facts={facts} paths={['knowledge_cutoff']} />
      {typeof facts.warning_message === 'string' && facts.warning_message !== '' && (
        <p className="text-xs whitespace-pre-line text-muted-foreground">
          <InlineMarkdown text={facts.warning_message} />
        </p>
      )}
    </>
  )
}

function FactList({ facts, paths }: { facts: Record<string, FieldValue>; paths: string[] }) {
  return (
    <FieldItemSet>
      {paths.map((path) => {
        const value = fact(facts, path)

        if (value === undefined || (path === 'pricing.discount' && value === 0)) {
          return null
        }

        const unit = formatChangeUnit(path, value)

        return (
          <FieldItem key={path} label={fieldLabel(path)}>
            {formatChangeValue(value, path)}
            {unit && <FieldUnit>{unit}</FieldUnit>}
          </FieldItem>
        )
      })}
    </FieldItemSet>
  )
}
