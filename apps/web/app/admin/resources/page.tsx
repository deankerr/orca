'use client'

import { api } from '@orca/backend/convex/_generated/api'
import {
  BracesIcon,
  ChartNoAxesColumnIncreasingIcon,
  DatabaseIcon,
  SearchXIcon,
} from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'

import { PageContainer, PageHeader, PageTitle } from '@/components/app-layout/pages'
import { EntityAvatar } from '@/components/shared/entity-avatar'
import { ExternalLink } from '@/components/shared/external-link'
import { SearchInput } from '@/components/shared/search-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useCachedQuery } from '@/hooks/use-cached-query'
import { cn, getConvexHttpUrl } from '@/lib/utils'

type EntityKind = 'models' | 'providers'
type Availability = 'all' | 'available' | 'unavailable'

type ResourceEntity = {
  id: string
  name: string
  slug: string
  isAvailable: boolean
  href?: string
}

const QUICK_LINKS = [
  {
    label: 'Models frontend',
    description: 'OpenRouter model catalogue',
    href: 'https://openrouter.ai/api/frontend/models',
    icon: BracesIcon,
  },
  {
    label: 'Providers frontend',
    description: 'OpenRouter provider catalogue',
    href: 'https://openrouter.ai/api/frontend/all-providers',
    icon: BracesIcon,
  },
  {
    label: 'Analytics finder',
    description: 'Endpoint analytics lookup',
    href: 'https://openrouter.ai/api/frontend/models/find?',
    icon: ChartNoAxesColumnIncreasingIcon,
  },
  {
    label: 'ORCA API v2',
    description: 'Public preview endpoint',
    href: getConvexHttpUrl('/public-api-preview/v2'),
    icon: DatabaseIcon,
  },
] as const

export default function Page() {
  const models = useCachedQuery(api.models.list, {}, 'models-list')
  const providers = useCachedQuery(api.providers.list, {}, 'providers-list')
  const [entityKind, setEntityKind] = useState<EntityKind>('models')
  const [availability, setAvailability] = useState<Availability>('all')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  const entities = useMemo<ResourceEntity[] | undefined>(() => {
    if (entityKind === 'models') {
      return models
        ?.map((model) => ({
          id: model._id,
          name: model.name,
          slug: model.slug,
          isAvailable: model.unavailable_at === undefined,
          href: `https://openrouter.ai/api/frontend/stats/endpoint?permaslug=${model.version_slug}&variant=${model.variant}`,
        }))
        .toSorted((a, b) => a.name.localeCompare(b.name))
    }

    return providers
      ?.map((provider) => ({
        id: provider._id,
        name: provider.name,
        slug: provider.slug,
        isAvailable: provider.unavailable_at === undefined,
      }))
      .toSorted((a, b) => a.name.localeCompare(b.name))
  }, [entityKind, models, providers])

  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase()
  const filteredEntities = useMemo(
    () =>
      entities?.filter((entity) => {
        const matchesAvailability =
          availability === 'all' ||
          (availability === 'available' && entity.isAvailable) ||
          (availability === 'unavailable' && !entity.isAvailable)
        const matchesQuery =
          normalizedQuery === '' ||
          entity.name.toLocaleLowerCase().includes(normalizedQuery) ||
          entity.slug.toLocaleLowerCase().includes(normalizedQuery)

        return matchesAvailability && matchesQuery
      }),
    [availability, entities, normalizedQuery],
  )

  const unavailableCount = entities?.filter((entity) => !entity.isAvailable).length ?? 0

  return (
    <PageContainer className="py-4">
      <PageHeader className="gap-0.5">
        <PageTitle>Resources</PageTitle>
        <p className="text-xs text-muted-foreground">
          API shortcuts and a visual index of every entity logo.
        </p>
      </PageHeader>

      <div className="space-y-6 py-2 sm:px-4">
        <section aria-labelledby="quick-links-heading">
          <div className="mb-2 flex items-baseline gap-2">
            <h2 id="quick-links-heading" className="text-sm font-medium">
              Quick links
            </h2>
            <span className="font-mono text-[0.625rem] tracking-wide text-muted-foreground uppercase">
              JSON
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_LINKS.map((link) => (
              <ExternalLink
                key={link.label}
                href={link.href}
                className="group/link grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg bg-card p-2.5 text-foreground no-underline ring-1 ring-foreground/10 transition-[color,box-shadow,transform] hover:text-foreground hover:ring-foreground/20 active:scale-[0.96] sm:w-72"
              >
                <link.icon className="size-4 text-muted-foreground transition-colors group-hover/link:text-primary" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium">{link.label}</span>
                  <span className="block truncate text-[0.625rem] font-normal text-muted-foreground">
                    {link.description}
                  </span>
                </span>
              </ExternalLink>
            ))}
          </div>
        </section>

        <section aria-labelledby="logo-atlas-heading">
          <div className="mb-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="logo-atlas-heading" className="text-sm font-medium">
                  Logo atlas
                </h2>
                <p className="text-xs text-muted-foreground">
                  {entityKind === 'models'
                    ? 'Select a model logo to open its frontend stats.'
                    : 'Focus or hover a provider logo to see its identity.'}
                </p>
              </div>
              <ResultCount shown={filteredEntities?.length} total={entities?.length} />
            </div>

            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div
                className="flex w-fit gap-1 rounded-lg bg-muted p-[3px]"
                aria-label="Entity type"
              >
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-pressed={entityKind === 'models'}
                  onClick={() => {
                    setEntityKind('models')
                  }}
                  className={cn(
                    'h-6',
                    entityKind === 'models' &&
                      'bg-background text-foreground shadow-sm hover:bg-background',
                  )}
                >
                  Models
                  <CountBadge value={models?.length} />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-pressed={entityKind === 'providers'}
                  onClick={() => {
                    setEntityKind('providers')
                  }}
                  className={cn(
                    'h-6',
                    entityKind === 'providers' &&
                      'bg-background text-foreground shadow-sm hover:bg-background',
                  )}
                >
                  Providers
                  <CountBadge value={providers?.length} />
                </Button>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row lg:max-w-2xl lg:justify-end">
                <SearchInput
                  value={query}
                  onValueChange={setQuery}
                  placeholder={`Search ${entityKind}…`}
                  aria-label={`Search ${entityKind}`}
                  className="sm:max-w-72"
                />
                <div className="flex gap-1 rounded-lg bg-muted p-[3px]" aria-label="Availability">
                  {(['all', 'available', 'unavailable'] as const).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-pressed={availability === value}
                      onClick={() => {
                        setAvailability(value)
                      }}
                      className={cn(
                        'h-6 flex-1 capitalize sm:flex-none',
                        availability === value &&
                          'bg-background text-foreground shadow-sm hover:bg-background',
                      )}
                    >
                      {value}
                      {value === 'unavailable' && unavailableCount > 0 ? (
                        <span className="font-mono text-[0.625rem] text-muted-foreground">
                          {unavailableCount}
                        </span>
                      ) : null}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <LogoAtlas entities={filteredEntities} />
        </section>
      </div>
    </PageContainer>
  )
}

function CountBadge({ value }: { value: number | undefined }) {
  return (
    <Badge
      variant="secondary"
      className="h-4 min-w-5 rounded px-1 font-mono text-[0.5625rem] tabular-nums"
    >
      {value?.toLocaleString() ?? '…'}
    </Badge>
  )
}

function ResultCount({ shown, total }: { shown: number | undefined; total: number | undefined }) {
  return (
    <span className="font-mono text-[0.625rem] text-muted-foreground tabular-nums">
      {shown === undefined || total === undefined
        ? 'Loading…'
        : `${shown.toLocaleString()} / ${total.toLocaleString()} shown`}
    </span>
  )
}

function LogoAtlas({ entities }: { entities: ResourceEntity[] | undefined }) {
  if (entities === undefined) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,3.5rem)] gap-1.5" aria-label="Loading logos">
        {Array.from({ length: 48 }, (_, index) => (
          <Skeleton key={index} className="size-14 rounded-lg" />
        ))}
      </div>
    )
  }

  if (entities.length === 0) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg bg-muted/30 text-center ring-1 ring-foreground/10">
        <SearchXIcon className="size-5 text-muted-foreground" />
        <div>
          <p className="text-xs font-medium">No matching logos</p>
          <p className="text-[0.625rem] text-muted-foreground">
            Try another search or availability filter.
          </p>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider delay={250}>
      <div className="grid grid-cols-[repeat(auto-fill,3.5rem)] gap-1.5">
        {entities.map((entity) => (
          <LogoTile key={entity.id} entity={entity} />
        ))}
      </div>
    </TooltipProvider>
  )
}

function LogoTile({ entity }: { entity: ResourceEntity }) {
  const tileClassName = cn(
    'group/tile relative flex size-14 items-center justify-center rounded-lg bg-card ring-1 ring-foreground/10 transition-[box-shadow,transform,background-color] hover:z-10 hover:bg-muted/50 hover:ring-foreground/25 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.96]',
    !entity.isAvailable && 'opacity-45 grayscale hover:opacity-80 hover:grayscale-0',
  )

  const tile =
    typeof entity.href === 'string' ? (
      <a
        href={entity.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${entity.name} — open frontend stats`}
        className={tileClassName}
      >
        <EntityAvatar slug={entity.slug} className="size-9 border-0 bg-transparent" />
        {entity.isAvailable ? null : <AvailabilityDot />}
      </a>
    ) : (
      <button type="button" aria-label={entity.name} className={tileClassName}>
        <EntityAvatar slug={entity.slug} className="size-9 border-0 bg-transparent" />
        {entity.isAvailable ? null : <AvailabilityDot />}
      </button>
    )

  return (
    <Tooltip>
      <TooltipTrigger render={tile} />
      <TooltipContent className="block max-w-72 px-2.5 py-2" sideOffset={6}>
        <span className="block font-medium">{entity.name}</span>
        <span className="block max-w-64 truncate font-mono text-[0.625rem] opacity-70">
          {entity.slug}
        </span>
        <span className="mt-1 block text-[0.5625rem] font-medium tracking-wide uppercase opacity-60">
          {entity.isAvailable ? 'Available' : 'Unavailable'}
          {entity.href === undefined ? '' : ' · Open stats'}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

function AvailabilityDot() {
  return (
    <span
      aria-hidden="true"
      className="absolute right-1.5 bottom-1.5 size-1.5 rounded-full bg-muted-foreground ring-2 ring-card"
    />
  )
}
