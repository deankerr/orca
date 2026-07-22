'use client'

import { ActivityIcon, CalendarIcon, ExternalLinkIcon, SearchIcon } from 'lucide-react'
import Link from 'next/link'

import { CopyableEntitySlug } from '@/components/shared/copyable-entity-slug'
import { EntityAvatar } from '@/components/shared/entity-avatar'
import { InlineMarkdown } from '@/components/shared/inline-markdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { Model } from './types'
import { formatDate } from './utils'

export function ModelHeader({ model }: { model: Model }) {
  return (
    <header className="border-b bg-background/95">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[3rem_minmax(0,1fr)] gap-x-3 px-3 py-5 lg:grid-cols-[3rem_minmax(0,1fr)_auto]">
        <EntityAvatar slug={model.slug} className="size-12 rounded-md" />

        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance md:text-3xl">
            {model.name}
          </h1>
          <CopyableEntitySlug slug={model.slug} className="mt-0.5 text-sm break-all" />
        </div>

        <nav
          aria-label="Model links"
          className="col-span-2 mt-3 flex flex-wrap items-center gap-1.5 sm:col-span-1 sm:col-start-2 lg:col-start-3 lg:row-start-1 lg:mt-0 lg:justify-end"
        >
          <div className="flex items-center gap-1.5">
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
              OpenRouter
              <ExternalLinkIcon data-icon="inline-end" />
            </Button>

            {model.hugging_face_id !== undefined && (
              <Button
                nativeButton={false}
                variant="outline"
                size="sm"
                render={
                  <a
                    href={`https://huggingface.co/${model.hugging_face_id}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open model on Hugging Face"
                  />
                }
              >
                Hugging Face
                <ExternalLinkIcon data-icon="inline-end" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              nativeButton={false}
              variant="ghost"
              size="sm"
              render={<Link href={`/?q=${encodeURIComponent(model.slug)}`} />}
            >
              <SearchIcon data-icon="inline-start" />
              Endpoints
            </Button>

            <Button
              nativeButton={false}
              variant="ghost"
              size="sm"
              render={<Link href={`/monitor?model=${encodeURIComponent(model.slug)}`} />}
            >
              <ActivityIcon data-icon="inline-start" />
              Monitor
            </Button>
          </div>
        </nav>

        <div className="col-span-2 mt-4 flex min-w-0 flex-col gap-4 sm:col-span-1 sm:col-start-2 lg:col-span-2 lg:row-start-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <CalendarIcon className="size-3" />
                {formatDate(model.or_added_at)}
              </span>

              {model.unavailable_at !== undefined && (
                <Badge variant="destructive" className="rounded-sm">
                  Unavailable
                </Badge>
              )}
            </div>

            <dl className="flex min-w-0 flex-wrap gap-x-4 gap-y-2">
              <div className="flex min-w-0 items-baseline gap-1.5">
                <dt className="text-muted-foreground">Input</dt>
                <dd className="min-w-0 font-mono break-words">
                  {model.input_modalities.join(', ')}
                </dd>
              </div>
              <div className="flex min-w-0 items-baseline gap-1.5">
                <dt className="text-muted-foreground">Output</dt>
                <dd className="min-w-0 font-mono break-words">
                  {model.output_modalities.join(', ')}
                </dd>
              </div>
              <div className="flex min-w-0 items-baseline gap-1.5">
                <dt className="text-muted-foreground">Reasoning</dt>
                <dd className="font-mono">{model.reasoning ? 'yes' : 'no'}</dd>
              </div>
            </dl>
          </div>

          {model.description !== undefined && model.description !== '' && (
            <p className="max-w-[75ch] text-sm leading-6 text-pretty text-muted-foreground">
              <InlineMarkdown text={model.description} />
            </p>
          )}
        </div>
      </div>
    </header>
  )
}
