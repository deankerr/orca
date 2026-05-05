'use client'

import type {
  EndpointChange,
  EntityChange,
  ModelChange,
  ProviderChange,
} from '@orca/backend/convex/changes'
import { formatPricingFields } from '@orca/backend/shared/formatters'
import { baseProviderSlug } from '@orca/backend/shared/utils'
import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon, PlusCircleIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { EntityOverviewTrigger } from '../entity-overview/entity-overview-trigger'
import { EntityIdentity } from '../shared/entity-identity'
import { InlineMarkdown } from '../shared/inline-markdown'
import { Badge } from '../ui/badge'
import { FieldChangeList, FieldItem, FieldItemSet, FieldUnit } from './field-display'

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

export function EventCard({ children, className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-none border bg-card/50', className)} {...props}>
      {children}
    </div>
  )
}

export function EventCardBody({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('px-6 py-2.5 empty:hidden', className)} {...props}>
      {children}
    </div>
  )
}

export function EventCardHeader({ children, className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'grid auto-cols-fr grid-flow-col items-center border-border/50 not-only:border-b [&>div]:flex [&>div]:px-3 [&>div]:py-1.5 [&>div]:not-first:justify-end',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

// -- Provider events

function ProviderEventCard({ change }: { change: ProviderChange }) {
  const { provider, event } = change

  return (
    <EventCard>
      <EventCardHeader>
        <div>
          <EntityOverviewTrigger
            type="provider"
            slug={provider.slug}
            render={
              <EntityIdentity
                slug={provider.slug}
                name={provider.name}
                isAvailable={event.kind !== 'entity_unavailable'}
              />
            }
          />
        </div>

        {event.kind === 'entity_available' && (
          <div>
            <Badge>
              <CheckCircle2Icon />
              provider available
            </Badge>
          </div>
        )}

        {event.kind === 'entity_unavailable' && (
          <div>
            <Badge variant="destructive">
              <AlertTriangleIcon />
              provider unavailable
            </Badge>
          </div>
        )}
      </EventCardHeader>

      {event.kind === 'entity_updated' && (
        <EventCardBody>
          <FieldChangeList fields={event.fields} />
        </EventCardBody>
      )}
    </EventCard>
  )
}

// -- Model events

function ModelEventCard({ change }: { change: ModelChange }) {
  const { model, event } = change
  const hasDescription = model.description !== undefined && model.description !== ''
  const description = model.description ?? ''

  return (
    <EventCard>
      <EventCardHeader>
        <div>
          <EntityOverviewTrigger
            type="model"
            slug={model.slug}
            render={
              <EntityIdentity
                slug={model.slug}
                name={model.name}
                isAvailable={event.kind !== 'entity_unavailable'}
              />
            }
          />
        </div>

        {event.kind === 'entity_available' && (
          <div>
            <Badge>
              <PlusCircleIcon />
              model available
            </Badge>
          </div>
        )}

        {event.kind === 'entity_unavailable' && (
          <div>
            <Badge variant="destructive">
              <AlertTriangleIcon />
              model unavailable
            </Badge>
          </div>
        )}
      </EventCardHeader>

      {event.kind === 'entity_available' && hasDescription && (
        <EventCardBody>
          <p className="text-xs whitespace-pre-line text-muted-foreground">
            <InlineMarkdown text={description} />
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
                {model.reasoning === true && <Badge variant="secondary">reasoning</Badge>}
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
  const hasContextLength = endpoint.context_length !== undefined && endpoint.context_length !== null
  const hasPricing = endpoint.pricing !== undefined

  return (
    <EventCard>
      <EventCardHeader>
        <div>
          <EntityOverviewTrigger
            type="model"
            slug={model.slug}
            render={<EntityIdentity slug={model.slug} name={model.name} />}
          />
        </div>

        <div className="border-l border-border/50 bg-card">
          <EntityOverviewTrigger
            type="provider"
            slug={baseProviderSlug(provider.slug)}
            render={
              <EntityIdentity
                className="flex-row-reverse text-right"
                slug={provider.slug}
                name={provider.name}
                isAvailable={event.kind !== 'entity_unavailable'}
              />
            }
          />
        </div>
      </EventCardHeader>

      {event.kind === 'entity_available' && (
        <EventCardBody>
          <Badge variant="secondary">
            <PlusCircleIcon />
            endpoint available
          </Badge>
        </EventCardBody>
      )}

      {event.kind === 'entity_available' && (hasContextLength || hasPricing) && (
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
  const contextLength = endpoint.context_length
  const maxOutput = endpoint.max_output
  const hasContextLength = contextLength !== undefined && contextLength !== null
  const hasMaxOutput = maxOutput !== undefined && maxOutput !== null

  if (!hasContextLength && pricing.length === 0) {
    return null
  }

  return (
    <FieldItemSet>
      {hasContextLength && <FieldItem label="context">{contextLength.toLocaleString()}</FieldItem>}
      {hasMaxOutput && <FieldItem label="max_output">{maxOutput.toLocaleString()}</FieldItem>}
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
