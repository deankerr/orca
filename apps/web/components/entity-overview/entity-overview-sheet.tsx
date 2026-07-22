'use client'

import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangleIcon, ArrowRightIcon, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import * as R from 'remeda'

import { useExperimentalFeatures } from '@/app/experimental-features-provider'
import { CopyableEntitySlug } from '@/components/shared/copyable-entity-slug'
import { EntityAvatar } from '@/components/shared/entity-avatar'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'

import { useEntityOverview } from './entity-overview-context'

export { EntityOverviewProvider } from './entity-overview-context'

export function EntityOverview() {
  const { entity, close } = useEntityOverview()

  return (
    <Sheet
      open={entity !== null}
      onOpenChange={(open) => {
        if (!open) {
          close()
        }
      }}
    >
      <SheetContent className="overflow-y-auto sm:max-w-[420px]" aria-describedby={undefined}>
        {entity?.type === 'model' && <ModelContent slug={entity.slug} />}
        {entity?.type === 'provider' && <ProviderContent slug={entity.slug} />}
      </SheetContent>
    </Sheet>
  )
}

function EntityHeader({ slug, name }: { slug: string; name: string }) {
  return (
    <div className="flex items-center gap-3">
      <EntityAvatar slug={slug} className="size-8.5 shrink-0 rounded-md" />
      <div className="min-w-0">
        <div className="truncate text-base leading-tight font-semibold">{name}</div>
        <CopyableEntitySlug slug={slug} className="truncate" />
      </div>
    </div>
  )
}

function ModelContent({ slug }: { slug: string }) {
  const { data: model, isPending } = useQuery(convexQuery(api.models.getBySlug, { slug }))

  if (isPending) {
    return <OverviewSkeleton />
  }

  if (!model) {
    return (
      <>
        <SheetTitle className="sr-only">Model Not Found</SheetTitle>
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-xs text-muted-foreground">Model not found</p>
        </div>
      </>
    )
  }

  return (
    <OverviewLayout
      type="model"
      slug={model.slug}
      name={model.name}
      externalLinks={
        <>
          <HeaderExternalLink href={`https://openrouter.ai/${model.slug}`} label="openrouter.ai" />
          {R.isDefined(model.hugging_face_id) && (
            <HeaderExternalLink
              href={`https://huggingface.co/${model.hugging_face_id}`}
              label="huggingface.co"
            />
          )}
        </>
      }
    >
      <OverviewSection>
        <OverviewLabel>Details</OverviewLabel>
        <OverviewRow label="Author" value={model.author_name} />
        <OverviewRow label="Input" value={model.input_modalities.join(', ')} />
        <OverviewRow label="Output" value={model.output_modalities.join(', ')} />
        <OverviewRow label="Reasoning" value={model.reasoning ? 'Yes' : 'No'} />
      </OverviewSection>
    </OverviewLayout>
  )
}

function ProviderContent({ slug }: { slug: string }) {
  const { data: provider, isPending } = useQuery(convexQuery(api.providers.getBySlug, { slug }))

  if (isPending) {
    return <OverviewSkeleton />
  }

  if (!provider) {
    return (
      <>
        <SheetTitle className="sr-only">Provider Not Found</SheetTitle>
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-xs text-muted-foreground">Provider not found</p>
        </div>
      </>
    )
  }

  return (
    <OverviewLayout
      type="provider"
      slug={provider.slug}
      name={provider.name}
      externalLinks={
        <HeaderExternalLink
          href={`https://openrouter.ai/provider/${provider.slug}`}
          label="openrouter.ai"
        />
      }
    >
      <OverviewSection>
        <OverviewLabel>Details</OverviewLabel>
        <OverviewRow label="Headquarters" value={provider.headquarters} />
        <OverviewRow label="Datacenters" value={provider.datacenters?.join(', ')} />
        <OverviewRow
          label="Terms of Service"
          value={
            R.isDefined(provider.terms_of_service_url) ? (
              <InlineExternalLink href={provider.terms_of_service_url} />
            ) : (
              <div className="flex items-center gap-1 text-amber-500">
                not provided
                <AlertTriangleIcon className="size-3" />
              </div>
            )
          }
        />
        <OverviewRow
          label="Privacy Policy"
          value={
            R.isDefined(provider.privacy_policy_url) ? (
              <InlineExternalLink href={provider.privacy_policy_url} />
            ) : (
              <div className="flex items-center gap-1 text-amber-500">
                not provided
                <AlertTriangleIcon className="size-3" />
              </div>
            )
          }
        />
        <OverviewRow
          label="Status Page"
          value={
            R.isDefined(provider.status_page_url) && (
              <InlineExternalLink href={provider.status_page_url} />
            )
          }
        />
      </OverviewSection>
    </OverviewLayout>
  )
}

function OverviewLayout({
  type,
  slug,
  name,
  externalLinks,
  children,
}: {
  type: 'model' | 'provider'
  slug: string
  name: string
  externalLinks: React.ReactNode
  children: React.ReactNode
}) {
  const { close } = useEntityOverview()
  const { enabled: experimentalFeaturesEnabled } = useExperimentalFeatures()

  return (
    <>
      <SheetTitle className="sr-only">{name}</SheetTitle>

      {/* Header */}
      <div className="border-b p-6">
        <div className="mb-4 font-mono text-[0.625rem] tracking-widest text-muted-foreground uppercase">
          {type}
        </div>

        <EntityHeader name={name} slug={slug} />

        <div className="mt-5 flex flex-wrap gap-2">{externalLinks}</div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 p-4">
        {children}

        <div className="rounded-md border bg-card/60 p-3">
          <OverviewLabel>Endpoints</OverviewLabel>
          <PageLink href={`/?q=${slug}`} onClick={close}>
            Filter by this {type}
          </PageLink>
        </div>

        <div className="rounded-md border bg-card/60 p-3">
          <OverviewLabel>Monitor</OverviewLabel>
          <PageLink href={`/monitor?${type}=${slug}`} onClick={close}>
            Filter by this {type}
          </PageLink>
        </div>

        {type === 'model' && (
          <div className="flex flex-col items-start px-1">
            {experimentalFeaturesEnabled && (
              <PageLink href={`/model/${slug}`} onClick={close}>
                Model page
              </PageLink>
            )}
            <PageLink href={`/beta/pricing-history/${slug}`} onClick={close}>
              Pricing history (beta)
            </PageLink>
          </div>
        )}
      </div>
    </>
  )
}

function OverviewSection({ children }: { children: React.ReactNode }) {
  return <section className="space-y-2 rounded-md border bg-card/60 p-3">{children}</section>
}

function OverviewLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 font-mono text-[0.625rem] tracking-widest text-muted-foreground uppercase">
      {children}
    </div>
  )
}

function OverviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!R.isTruthy(value)) {
    return null
  }
  return (
    <div className="flex justify-between gap-3 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 text-right font-mono">{value}</div>
    </div>
  )
}

function PageLink({
  href,
  onClick,
  children,
}: {
  href: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group inline-flex min-h-10 items-center gap-1.5 rounded-sm font-mono text-xs text-muted-foreground uppercase underline decoration-border decoration-dashed underline-offset-4 transition-[color,scale,text-decoration-color] outline-none hover:text-foreground hover:decoration-foreground/50 focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-[0.96]"
    >
      {children}
      <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

function HeaderExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex min-h-10 items-center gap-1.5 rounded-sm font-mono text-xs text-muted-foreground underline decoration-border decoration-dashed underline-offset-4 transition-[color,scale,text-decoration-color] outline-none hover:text-foreground hover:decoration-foreground/50 focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-[0.96]"
    >
      {label}
      <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </a>
  )
}

function InlineExternalLink({ href }: { href: string }) {
  let hostname = href
  try {
    ;({ hostname } = new URL(href))
  } catch {
    /* fall back to displaying the raw href */
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex items-center gap-1 rounded-sm text-muted-foreground underline decoration-border decoration-dashed underline-offset-4 transition-[color,scale,text-decoration-color] outline-none hover:text-foreground hover:decoration-foreground/50 focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-[0.96]"
    >
      {hostname}
      <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </a>
  )
}

function OverviewSkeleton() {
  return (
    <>
      <SheetTitle className="sr-only">Loading</SheetTitle>
      <div className="border-b p-6">
        <Skeleton className="mb-4 h-2.5 w-14" />
        <div className="flex gap-4">
          <Skeleton className="size-12 shrink-0 rounded-md" />
          <div className="flex flex-1 flex-col gap-2 pt-0.5">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-60" />
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <Skeleton className="h-6 w-28 rounded-md" />
        </div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-24 rounded-md" />
        <Skeleton className="h-14 rounded-md" />
        <Skeleton className="h-14 rounded-md" />
      </div>
    </>
  )
}
