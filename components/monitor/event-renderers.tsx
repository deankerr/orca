'use client'

import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon, PlusCircleIcon } from 'lucide-react'

import type {
  EndpointChange,
  EntityChange,
  ModelChange,
  ProviderChange,
} from '@/convex/db/or/views/changes'
import { formatPricingFields } from '@/convex/shared/formatters'
import { cn } from '@/lib/utils'

import { EntityAvatar } from '../shared/entity-avatar'
import { Badge } from '../ui/badge'
import { EventCard, EventCardBody } from './event-card'
import { FieldChangeList, FieldItem, FieldItemSet, FieldUnit } from './field-display'
import { InlineMarkdown } from './inline-markdown'

// -- Identity helper

function EventCardIdentity({
  slug,
  name,
  removed,
  avatarClassName,
  className,
  ...props
}: {
  slug: string
  name?: string
  removed?: boolean
  avatarClassName?: string
} & React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)} {...props}>
      <EntityAvatar
        slug={slug}
        className={cn('size-6', removed && 'brightness-50', avatarClassName)}
      />
      <div className="min-w-0">
        {name && (
          <div
            className={cn(
              'truncate text-xs leading-tight font-medium',
              removed && 'text-muted-foreground',
            )}
          >
            {name}
          </div>
        )}
        <div
          className={cn(
            'truncate font-mono text-xs leading-none text-muted-foreground',
            removed && 'line-through',
          )}
        >
          {slug}
        </div>
      </div>
    </div>
  )
}

// -- Public API

export function EntityEventCard({ change }: { change: EntityChange }) {
  if (change.entity_type === 'model') {
    return <ModelEventCard change={change} />
  }
  if (change.entity_type === 'endpoint') {
    return <EndpointEventCard change={change} />
  }
  return <ProviderEventCard change={change} />
}

// -- Model events

function ModelEventCard({ change }: { change: ModelChange }) {
  const { model, event } = change

  return (
    <EventCard>
      <EventCardBody className="flex items-center gap-2 border-b border-border/50 px-3 py-2.5">
        <EventCardIdentity
          slug={model.slug}
          name={model.name}
          removed={event.kind === 'entity_unavailable'}
        />

        {event.kind === 'entity_available' && (
          <Badge className="ml-auto">
            <PlusCircleIcon />
            model available
          </Badge>
        )}

        {event.kind === 'entity_unavailable' && (
          <Badge className="ml-auto" variant="destructive">
            <AlertTriangleIcon />
            model unavailable
          </Badge>
        )}
      </EventCardBody>

      {event.kind === 'entity_available' && model.description && (
        <EventCardBody>
          <p className="text-xs whitespace-pre-line text-muted-foreground">
            <InlineMarkdown text={model.description} />
          </p>
        </EventCardBody>
      )}

      {event.kind === 'entity_available' && model.input_modalities && (
        <EventCardBody>
          <FieldItemSet>
            <FieldItem label="modalities">
              <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                {model.input_modalities.map((m) => (
                  <Badge key={`in-${m}`} variant="secondary">
                    {m}
                  </Badge>
                ))}
                <span className="text-muted-foreground">→</span>
                {model.output_modalities?.map((m) => (
                  <Badge key={`out-${m}`} variant="secondary">
                    {m}
                  </Badge>
                ))}
                {model.reasoning && <Badge variant="secondary">reasoning</Badge>}
              </div>
            </FieldItem>
          </FieldItemSet>
        </EventCardBody>
      )}

      {event.kind === 'entity_updated' && (
        <EventCardBody>
          <FieldChangeList fields={event.fields} />
        </EventCardBody>
      )}
    </EventCard>
  )
}

// -- Endpoint events

function EndpointEventCard({ change }: { change: EndpointChange }) {
  const { model, provider, endpoint, event } = change

  return (
    <EventCard>
      <div className="grid grid-cols-2 border-b border-border/50">
        <div className="px-3 py-2.5">
          <EventCardIdentity slug={model.slug} name={model.name} />
        </div>

        <div className="flex justify-end border-l border-border/50 bg-card px-3 py-2.5">
          <EventCardIdentity
            className="flex-row-reverse text-right"
            slug={provider.slug}
            name={provider.name}
            removed={event.kind === 'entity_unavailable'}
          />
        </div>
      </div>

      {event.kind === 'entity_available' && (
        <EventCardBody>
          <Badge variant="secondary">
            <PlusCircleIcon />
            endpoint available
          </Badge>
        </EventCardBody>
      )}

      {event.kind === 'entity_available' && (endpoint.context_length || endpoint.pricing) && (
        <EventCardBody className="pt-0">
          <NewEndpointFields endpoint={endpoint} />
        </EventCardBody>
      )}

      {event.kind === 'entity_unavailable' && (
        <EventCardBody>
          <Badge variant="secondary">
            <InfoIcon />
            endpoint unavailable
          </Badge>
        </EventCardBody>
      )}

      {event.kind === 'entity_updated' && (
        <EventCardBody>
          <FieldChangeList fields={event.fields} />
        </EventCardBody>
      )}
    </EventCard>
  )
}

function NewEndpointFields({ endpoint }: { endpoint: EndpointChange['endpoint'] }) {
  const pricing = endpoint.pricing ? formatPricingFields(endpoint.pricing) : []
  if (!endpoint.context_length && pricing.length === 0) {
    return null
  }

  return (
    <FieldItemSet>
      {endpoint.context_length && (
        <FieldItem label="context">{endpoint.context_length.toLocaleString()}</FieldItem>
      )}
      {endpoint.max_output && (
        <FieldItem label="max_output">{endpoint.max_output.toLocaleString()}</FieldItem>
      )}
      {pricing.map((p) => {
        const name = p.field.startsWith('text_cache_') ? p.field.slice(5) : p.field
        return (
          <FieldItem key={p.field} label={name}>
            {p.value}
            {p.unit && (
              <span className="ml-1">
                <FieldUnit>{p.unit}</FieldUnit>
              </span>
            )}
          </FieldItem>
        )
      })}
    </FieldItemSet>
  )
}

// -- Provider events

function ProviderEventCard({ change }: { change: ProviderChange }) {
  const { provider, event } = change

  return (
    <EventCard>
      <EventCardBody className="flex border-b border-border/50 px-3 py-2.5">
        <EventCardIdentity
          slug={provider.slug}
          name={provider.name}
          removed={event.kind === 'entity_unavailable'}
        />
        {event.kind === 'entity_available' && (
          <Badge className="ml-auto">
            <CheckCircle2Icon />
            provider available
          </Badge>
        )}

        {event.kind === 'entity_unavailable' && (
          <Badge className="ml-auto" variant="destructive">
            <AlertTriangleIcon />
            provider unavailable
          </Badge>
        )}
      </EventCardBody>

      {event.kind === 'entity_updated' && (
        <EventCardBody>
          <FieldChangeList fields={event.fields} />
        </EventCardBody>
      )}
    </EventCard>
  )
}
