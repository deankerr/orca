import { LinkIcon } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

import { PopoverCardContent, PopoverCardTitle, PopoverCardTrigger } from './popover-card'

// --- Popover content ---

export function EndpointUuidPopoverContent({
  uuid,
  modelSlug,
}: {
  uuid: string
  modelSlug: string
}) {
  const copy = useCopyToClipboard()
  const endpointUrl = `/?q=${modelSlug}&uuid=${uuid.slice(0, 6)}`

  return (
    <PopoverCardContent>
      <PopoverCardTitle>
        Endpoint UUID
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-5"
          render={<Link href={endpointUrl} />}
          nativeButton={false}
          aria-label="Open endpoint details"
        >
          <LinkIcon className="size-3" />
        </Button>
      </PopoverCardTitle>
      <Button
        variant="ghost"
        className="-mx-2 h-7 px-2 font-mono text-[85%] text-muted-foreground dark:hover:bg-accent/30"
        size="sm"
        onClick={() => copy(uuid, 'Copied Endpoint UUID')}
      >
        {uuid}
      </Button>
    </PopoverCardContent>
  )
}

// --- Trigger ---

export function EndpointUuid({
  uuid,
  modelSlug,
  handle,
  ...props
}: { uuid: string; modelSlug: string } & React.ComponentProps<typeof PopoverCardTrigger>) {
  const shortUuid = uuid.slice(0, 6)

  return (
    <PopoverCardTrigger
      handle={handle}
      nativeButton={false}
      payload={{ type: 'endpoint-uuid' as const, uuid, modelSlug }}
      render={<Badge variant="outline" className="bg-card/50 font-mono tracking-wider shadow" />}
      {...props}
    >
      {shortUuid}
    </PopoverCardTrigger>
  )
}
