'use client'

import { useEffect, useState } from 'react'

import { codeToHtml } from 'shiki'

import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

async function highlight(code: string) {
  return codeToHtml(code, {
    lang: 'json',
    themes: {
      light: 'github-light',
      dark: 'github-dark-default',
    },
  })
}

type ApiCodeViewerProps = {
  code: string
  isLoading?: boolean
  error?: Error | null
}

export function ApiCodeViewer({ code, isLoading, error }: ApiCodeViewerProps) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    if (!code || isLoading || error) {
      return
    }

    highlight(code)
      .then(setHtml)
      .catch((err) => console.error('Syntax highlighting failed:', err))
  }, [code, isLoading, error])

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-md border">
      {/* * Header */}
      <div className="flex items-center gap-2 border-b bg-secondary px-4 py-2 text-xs text-muted-foreground">
        {isLoading ? (
          <>
            <Spinner className="size-3" />
            <span className="font-mono">Loading...</span>
          </>
        ) : error ? (
          <Badge variant="destructive" className="font-mono">
            Error: {error.message}
          </Badge>
        ) : (
          <span className="font-mono">Sample</span>
        )}
      </div>

      {/* * Content */}
      <ScrollArea className="flex-1">
        {!isLoading && !error && html ? (
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
            {isLoading ? 'Fetching data...' : error ? 'Unable to load sample data' : null}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
