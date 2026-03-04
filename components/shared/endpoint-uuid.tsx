import Link from 'next/link'

import { LinkIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

import {
  PopoverCard,
  PopoverCardContent,
  PopoverCardTitle,
  PopoverCardTrigger,
} from './popover-card'

export function EndpointUuid({
  uuid,
  modelSlug,
  ...props
}: { uuid: string; modelSlug: string } & React.ComponentProps<typeof PopoverCardTrigger>) {
  const shortUuid = uuid.slice(0, 6)
  const endpointUrl = `/?q=${modelSlug}&uuid=${shortUuid}`

  const copy = useCopyToClipboard()

  return (
    <PopoverCard>
      <PopoverCardTrigger
        nativeButton={false}
        render={<Badge variant="outline" className="bg-card/50 font-mono tracking-wider shadow" />}
        {...props}
      >
        {shortUuid}
      </PopoverCardTrigger>

      <PopoverCardContent>
        <PopoverCardTitle>
          Endpoint UUID
          <Button variant="ghost" size="icon-sm" className="size-5" asChild>
            <Link href={endpointUrl}>
              <LinkIcon className="size-3" />
            </Link>
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
    </PopoverCard>
  )
}
