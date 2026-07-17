'use client'

import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { codeToHtml } from 'shiki'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

export function ClientApiCodeBlock() {
  const query = useQuery(convexQuery(api.public_api.preview_v2.getModels, { limit: 5 }))
  const code = JSON.stringify(query.data ?? null, null, 2)

  return (
    <div className="flex flex-col overflow-hidden rounded-md border lg:min-h-0 lg:flex-1">
      {/* * Header */}
      <div className="flex items-center gap-2 border-b bg-secondary px-4 py-2 text-xs text-muted-foreground">
        <span className="font-mono">Sample</span>
      </div>

      {/* * Content */}
      <ScrollArea className="h-[28rem] overflow-hidden lg:h-auto lg:min-h-0 lg:min-w-0 lg:flex-1 lg:[&>[data-slot=scroll-area-viewport]]:min-h-0 lg:[&>[data-slot=scroll-area-viewport]]:min-w-0">
        {query.isPending ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Spinner className="size-3" />
              <span>Fetching data...</span>
            </div>
          </div>
        ) : query.isError ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            Unable to load sample data
          </div>
        ) : (
          <HighlightedJsonCode code={code} />
        )}
      </ScrollArea>
    </div>
  )
}

async function highlight(code: string) {
  return await codeToHtml(code, {
    lang: 'json',
    themes: {
      light: 'github-light',
      dark: 'github-dark-default',
    },
  })
}

function HighlightedJsonCode({ code }: { code: string }) {
  const [highlighted, setHighlighted] = useState<{ code: string; html: string } | null>(null)
  const hasCode = code.length > 0

  useEffect(() => {
    let isActive = true

    if (!hasCode) {
      return undefined
    }

    const loadHighlight = async () => {
      try {
        const nextHtml = await highlight(code)
        if (isActive) {
          setHighlighted({ code, html: nextHtml })
        }
      } catch (highlightError) {
        console.error('Syntax highlighting failed:', highlightError)
      }
    }

    void loadHighlight()

    return () => {
      isActive = false
    }
  }, [code, hasCode])

  if (highlighted === null || highlighted.code !== code || highlighted.html === '') {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Spinner className="size-3" />
          <span>Formatting data...</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'text-sm',
        '[&_.shiki]:!bg-transparent',
        '[&_pre]:py-4',
        '[&_code]:grid',
        '[&_code]:w-full',
        '[&_.line]:px-4',
        '[&_.line]:w-full',
        'dark:[&_.shiki]:!text-[var(--shiki-dark)]',
        'dark:[&_.shiki_span]:!text-[var(--shiki-dark)]',
      )}
      // oxlint-disable-next-line react/no-danger required by shiki
      dangerouslySetInnerHTML={{ __html: highlighted.html }}
    />
  )
}
