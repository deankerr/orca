'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { OrcaPublicApiV2Schema } from '@/lib/backend'
import { cn } from '@/lib/utils'

import { highlightJson } from './highlight-json'
import { API_PATH } from './public-api'

const SAMPLE_MODEL_LIMIT = 5

async function fetchPublicApiPreviewSample() {
  const response = await fetch(API_PATH)

  if (!response.ok) {
    throw new Error(`Failed to fetch API: ${response.status}`)
  }

  const { updated_at, models } = OrcaPublicApiV2Schema.parse(await response.json())

  // oxlint-disable-next-line sort-keys -- Rendered with JSON.stringify as a sample of the API response, which lists updated_at first.
  return { updated_at, models: models.slice(0, SAMPLE_MODEL_LIMIT) }
}

export function ClientApiCodeBlock() {
  const query = useQuery({
    queryFn: fetchPublicApiPreviewSample,
    queryKey: ['public-api-preview', API_PATH],
  })

  const code = JSON.stringify(query.data ?? null, null, 2)

  return (
    <div className="flex flex-col overflow-hidden rounded-md border lg:min-h-0 lg:flex-1">
      {/* * Header */}
      <div className="flex items-center gap-2 border-b bg-secondary px-4 py-2 text-xs text-muted-foreground">
        <span className="font-mono">Sample</span>
      </div>

      {/* * Content */}
      <ScrollArea className="h-[28rem] overflow-hidden lg:h-auto lg:min-h-0 lg:min-w-0 lg:flex-1 lg:[&>[data-slot=scroll-area-viewport]]:min-h-0 lg:[&>[data-slot=scroll-area-viewport]]:min-w-0">
        <PreviewContent pending={query.isPending} failed={query.isError} code={code} />
      </ScrollArea>
    </div>
  )
}

function PreviewContent({
  pending,
  failed,
  code,
}: {
  pending: boolean
  failed: boolean
  code: string
}) {
  if (pending) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Spinner className="size-3" />
          <span>Fetching data...</span>
        </div>
      </div>
    )
  }

  if (failed) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Unable to load sample data
      </div>
    )
  }

  return <HighlightedJsonCode code={code} />
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
        const nextHtml = await highlightJson(code)

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
      // oxlint-disable-next-line react/no-danger -- Required to render Shiki's highlighted HTML.
      dangerouslySetInnerHTML={{ __html: highlighted.html }}
    />
  )
}
