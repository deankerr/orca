'use client'

import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import { useQuery } from '@tanstack/react-query'
import { ActivityIcon, ExternalLinkIcon, SearchIcon } from 'lucide-react'
import Link from 'next/link'
import * as R from 'remeda'

import { EntityAvatar } from '@/components/shared/entity-avatar'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

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
  const copyToClipboard = useCopyToClipboard()

  return (
    <div className="flex gap-4">
      <EntityAvatar slug={slug} fallbackText={name} className="size-11 shrink-0 rounded-md" />
      <div className="min-w-0">
        <div className="truncate text-base leading-snug font-semibold">{name}</div>
        <button
          type="button"
          onClick={() => void copyToClipboard(slug, `Copied: ${slug}`)}
          title="Click to copy"
          className="mt-1 cursor-pointer truncate text-left font-mono text-xs text-muted-foreground transition-colors hover:text-primary/90"
        >
          {slug}
        </button>
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
          <ExternalLinkChip href={`https://openrouter.ai/${model.slug}`} label="openrouter.ai" />
          {R.isDefined(model.hugging_face_id) && (
            <ExternalLinkChip
              href={`https://huggingface.co/${model.hugging_face_id}`}
              label="huggingface.co"
            />
          )}
        </>
      }
    >
      <OverviewSection className="has-[:only-child]:hidden">
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
        <ExternalLinkChip
          href={`https://openrouter.ai/provider/${provider.slug}`}
          label="openrouter.ai"
        />
      }
    >
      <OverviewSection className="has-[:only-child]:hidden">
        <OverviewLabel>Details</OverviewLabel>
        <OverviewRow label="Headquarters" value={provider.headquarters} />
        <OverviewRow label="Datacenters" value={provider.datacenters?.join(', ')} />
        <OverviewRow
          label="Status Page"
          value={
            R.isDefined(provider.status_page_url) && (
              <InlineExternalLink href={provider.status_page_url} />
            )
          }
        />
        <OverviewRow
          label="Terms of Service"
          value={
            R.isDefined(provider.terms_of_service_url) && (
              <InlineExternalLink href={provider.terms_of_service_url} />
            )
          }
        />
        <OverviewRow
          label="Privacy Policy"
          value={
            R.isDefined(provider.privacy_policy_url) && (
              <InlineExternalLink href={provider.privacy_policy_url} />
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

        <OverviewSection>
          <OverviewLabel>Endpoints</OverviewLabel>
          <ActionLink href={`/?q=${slug}`} onClick={close}>
            Filter by this {type}
            <SearchIcon className="size-3" />
          </ActionLink>
        </OverviewSection>

        <OverviewSection>
          <OverviewLabel>Monitor</OverviewLabel>
          <ActionLink href={`/monitor?${type}=${slug}`} onClick={close}>
            Filter by this {type}
            <ActivityIcon className="size-3" />
          </ActionLink>
        </OverviewSection>
      </div>
    </>
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

function OverviewSection({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <section className={cn('rounded-md border bg-card/60 p-3', className)}>{children}</section>
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
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 text-right font-mono">{value}</div>
    </div>
  )
}

function ActionLink({
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
      className="inline-flex items-center gap-1 font-mono text-xs text-primary uppercase underline decoration-primary/40 decoration-dashed underline-offset-3"
    >
      {children}
    </Link>
  )
}

function ExternalLinkChip({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[0.625rem] text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground"
    >
      {label}
      <ExternalLinkIcon className="size-2.5" />
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
      className="inline-flex items-center gap-1 text-primary underline decoration-primary/40 decoration-dashed underline-offset-3"
    >
      {hostname}
      <ExternalLinkIcon className="size-3" />
    </a>
  )
}
