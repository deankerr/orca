import type { LucideIcon } from 'lucide-react'
import { CopyIcon, ArrowRightIcon, Table2Icon, ActivityIcon } from 'lucide-react'
import Link from 'next/link'

import { EntityIdentity } from '@/components/shared/entity-identity'
import { Button } from '@/components/ui/button'
import { SheetTitle } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

import { useEntityOverview } from './entity-overview-context'

const actionClassName =
  'group flex min-h-10 w-full items-center gap-2.5 rounded-md bg-card px-3 text-xs font-medium ring-1 ring-foreground/10 transition-[color,box-shadow,transform] outline-none hover:ring-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-[0.96]'

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

export function OverviewAction({
  href,
  onClick,
  icon: Icon,
  children,
}: {
  href?: string
  onClick?: () => void
  icon: LucideIcon
  children: React.ReactNode
}) {
  const content = (
    <>
      <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
      <span>{children}</span>
      <ArrowRightIcon className="ms-auto size-3.5 text-muted-foreground transition-transform group-hover:text-foreground" />
    </>
  )

  if (href !== undefined) {
    return (
      <Link href={href} onClick={onClick} className={actionClassName}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={cn(actionClassName, 'cursor-pointer')}>
      {content}
    </button>
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
  const { close } = useEntityOverview()

  return (
    <div className="flex flex-col gap-2">
      <OverviewAction
        href={`/?${new URLSearchParams({ q: slug })}`}
        onClick={close}
        icon={Table2Icon}
      >
        Endpoints
      </OverviewAction>
      <OverviewAction
        href={`/monitor?${new URLSearchParams({ [type]: slug })}`}
        onClick={close}
        icon={ActivityIcon}
      >
        Monitor
      </OverviewAction>
      {children}
    </div>
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
