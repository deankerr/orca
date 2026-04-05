'use client'

import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { codeToHtml } from 'shiki'

import { CopyToClipboardButton } from '@/components/shared/copy-to-clipboard-button'
import { Badge } from '@/components/ui/badge'
import { Item, ItemActions, ItemContent, ItemTitle } from '@/components/ui/item'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { api } from '@/convex/_generated/api'
import { cn } from '@/lib/utils'

export function ClientApiPreview({ apiUrl }: { apiUrl: string }) {
  const {
    data = '',
    isLoading,
    error,
  } = useQuery(convexQuery(api.public_api.preview_v2.getModels, { limit: 5 }))

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4 overflow-hidden p-6">
      <Item variant="outline">
        <ItemContent>
          <ItemTitle>Preview V2</ItemTitle>
          <code className="font-mono text-xs break-all">{apiUrl}</code>
        </ItemContent>
        <ItemActions>
          <CopyToClipboardButton
            value={apiUrl}
            size="icon"
            variant="secondary"
            disabled={!apiUrl}
            aria-label="Copy API URL"
          />
        </ItemActions>
      </Item>

      <JsonApiCodeBlock code={JSON.stringify(data, null, 2)} isLoading={isLoading} error={error} />
    </div>
  )
}

async function highlight(code: string) {
  return codeToHtml(code, {
    lang: 'json',
    themes: {
      light: 'github-light',
      dark: 'github-dark-default',
    },
  })
}

type JsonApiCodeBlock = {
  code: string
  isLoading?: boolean
  error?: Error | null
}

function JsonApiCodeBlock({ code, isLoading, error }: JsonApiCodeBlock) {
  const [html, setHtml] = useState<string | null>(null)
  const hasCode = code.length > 0
  const isPending = isLoading === true
  const hasError = error !== null && error !== undefined
  const hasHtml = html !== null && html !== ''
  const headerContent = (() => {
    if (isPending) {
      return (
        <>
          <Spinner className="size-3" />
          <span className="font-mono">Loading...</span>
        </>
      )
    }

    if (hasError) {
      return (
        <Badge variant="destructive" className="font-mono">
          Error: {error.message}
        </Badge>
      )
    }

    return <span className="font-mono">Sample</span>
  })()

  let emptyStateLabel: string | null = null
  if (isPending) {
    emptyStateLabel = 'Fetching data...'
  } else if (hasError) {
    emptyStateLabel = 'Unable to load sample data'
  }

  useEffect(() => {
    let isActive = true

    if (!hasCode || isPending || hasError) {
      return
    }

    const loadHighlight = async () => {
      try {
        const nextHtml = await highlight(code)
        if (isActive) {
          setHtml(nextHtml)
        }
      } catch (highlightError) {
        console.error('Syntax highlighting failed:', highlightError)
      }
    }

    void loadHighlight()

    return () => {
      isActive = false
    }
  }, [code, hasCode, isPending, hasError])

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-md border">
      {/* * Header */}
      <div className="flex items-center gap-2 border-b bg-secondary px-4 py-2 text-xs text-muted-foreground">
        {headerContent}
      </div>

      {/* * Content */}
      <ScrollArea className="flex-1">
        {!isPending && !hasError && hasHtml ? (
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
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            {emptyStateLabel}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
