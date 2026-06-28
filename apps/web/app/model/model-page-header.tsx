'use client'

import { ArrowLeft, Calendar, ExternalLink } from 'lucide-react'
import Link from 'next/link'

import { CopyToClipboardButton } from '@/components/shared/copy-to-clipboard-button'
import { EntityAvatar } from '@/components/shared/entity-avatar'
import { InlineMarkdown } from '@/components/shared/inline-markdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { Model } from './types'
import { formatDate } from './utils'

export function ModelHeader({ model }: { model: Model }) {
  return (
    <header className="border-b bg-background/95">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/" />}>
            <ArrowLeft data-icon="inline-start" />
            Endpoints
          </Button>

          <div className="flex items-center gap-2">
            <CopyToClipboardButton size="sm" variant="outline" value={model.slug}>
              {model.slug}
            </CopyToClipboardButton>
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={
                <a
                  href={`https://openrouter.ai/${model.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open model on OpenRouter"
                />
              }
            >
              <ExternalLink data-icon="inline-start" />
              OpenRouter
            </Button>
          </div>
        </div>

        <div className="flex min-w-0 gap-3">
          <EntityAvatar slug={model.slug} className="mt-1 size-11 rounded-md" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-normal md:text-3xl">
              {model.name}
            </h1>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="size-3" />
                {formatDate(model.or_added_at)}
              </span>

              <Badge variant="outline" className="rounded-sm uppercase">
                {model.author_name}
              </Badge>

              {model.unavailable_at !== undefined && (
                <Badge variant="destructive" className="rounded-sm">
                  Unavailable
                </Badge>
              )}
            </div>

            <dl className="mt-3 flex min-w-0 flex-wrap gap-x-4 gap-y-2 text-xs">
              <div className="flex min-w-0 items-baseline gap-1.5">
                <dt className="text-muted-foreground">Input</dt>
                <dd className="min-w-0 truncate font-mono">{model.input_modalities.join(', ')}</dd>
              </div>
              <div className="flex min-w-0 items-baseline gap-1.5">
                <dt className="text-muted-foreground">Output</dt>
                <dd className="min-w-0 truncate font-mono">{model.output_modalities.join(', ')}</dd>
              </div>
              <div className="flex min-w-0 items-baseline gap-1.5">
                <dt className="text-muted-foreground">Reasoning</dt>
                <dd className="font-mono">{model.reasoning ? 'yes' : 'no'}</dd>
              </div>
            </dl>

            {model.description !== undefined && model.description !== '' && (
              <p className="mt-4 max-w-4xl text-sm leading-6 text-muted-foreground">
                <InlineMarkdown text={model.description} />
              </p>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
