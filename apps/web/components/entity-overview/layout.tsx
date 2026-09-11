'use client'

import type { LucideIcon } from 'lucide-react'
import {
  CopyIcon,
  ArrowRightIcon,
  Table2Icon,
  ActivityIcon,
  ChartNoAxesCombinedIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

import { EntityIdentity } from '@/components/shared/entity-identity'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { SheetTitle } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

import { preloadPricingHistoryPlot } from '../pricing-history/preload'
import { buildPricingHistoryHref } from '../pricing-history/query-state'
import { useEntityOverview } from './context'
import { buildEndpointsHref, buildMonitorHref } from './hrefs'

export function OverviewHeader({ slug, name }: { slug: string; name: string }) {
  const copy = useCopyToClipboard()

  return (
    <header className="flex items-center gap-2 border-b p-4 pe-14">
      <SheetTitle className="sr-only">{name}</SheetTitle>
      <EntityIdentity slug={slug} name={name} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copy Identifier"
        onClick={() => {
          void copy(slug, `Copied: ${slug}`)
        }}
      >
        <CopyIcon />
      </Button>
    </header>
  )
}

function OverviewAction({
  href,
  onClick,
  onMouseEnter,
  onFocus,
  icon: Icon,
  children,
}: {
  href: string
  onClick?: () => void
  onMouseEnter?: () => void
  onFocus?: () => void
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <Item
      variant="outline"
      size="sm"
      render={
        <Link
          href={href}
          scroll={false}
          onClick={onClick}
          onMouseEnter={onMouseEnter}
          onFocus={onFocus}
        />
      }
    >
      <ItemMedia variant="icon">
        <Icon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{children}</ItemTitle>
      </ItemContent>
      <ItemActions className="[&_svg:not([class*='size-'])]:size-4">
        <ArrowRightIcon />
      </ItemActions>
    </Item>
  )
}

export function OverviewActions({
  type,
  slug,
  children,
}: {
  type: 'model' | 'provider'
  slug: string
  children?: React.ReactNode
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams().toString()
  const { close } = useEntityOverview()

  return (
    <ItemGroup>
      <OverviewAction
        href={buildEndpointsHref({ pathname, searchParams, slug })}
        onClick={close}
        icon={Table2Icon}
      >
        Endpoints
      </OverviewAction>
      <OverviewAction
        href={buildMonitorHref({ pathname, searchParams, type, slug })}
        onClick={close}
        icon={ActivityIcon}
      >
        Monitor
      </OverviewAction>
      {children}
    </ItemGroup>
  )
}

export function PricingHistoryAction({ modelId }: { modelId: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams().toString()

  return (
    <OverviewAction
      href={buildPricingHistoryHref({ pathname, searchParams, modelId })}
      icon={ChartNoAxesCombinedIcon}
      onMouseEnter={preloadPricingHistoryPlot}
      onFocus={preloadPricingHistoryPlot}
    >
      Pricing History
    </OverviewAction>
  )
}

export function OverviewStatus({
  pending,
  error,
  retry,
  kind,
}: {
  pending: boolean
  error: boolean
  retry: () => void
  kind: string
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
      <SheetTitle className="sr-only">{kind} Overview</SheetTitle>
      {pending ? (
        <output className="flex items-center gap-2">
          <Spinner />
          Loading…
        </output>
      ) : error ? (
        <>
          <p role="alert">Could not load {kind.toLowerCase()}.</p>
          <Button onClick={retry}>Retry</Button>
        </>
      ) : (
        <p>{kind} not found.</p>
      )}
    </div>
  )
}
