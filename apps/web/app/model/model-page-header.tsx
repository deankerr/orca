'use client'

import { ActivityIcon, CalendarIcon, ExternalLinkIcon, SearchIcon } from 'lucide-react'
import Link from 'next/link'

import { CopyableEntitySlug } from '@/components/shared/copyable-entity-slug'
import { EntityAvatar } from '@/components/shared/entity-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { Model } from './types'
import { formatDate } from './utils'

export function ModelHeader({ model }: { model: Model }) {
  return (
    <header>
      <div className="mx-auto w-full max-w-6xl px-3 pt-4 pb-3">
        {/* Identity row. The nav sits beside the title on wide screens and
            wraps onto its own full-width row below lg. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          <EntityAvatar slug={model.slug} className="size-11 rounded-md" />

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
              {model.name}
            </h1>
            <CopyableEntitySlug slug={model.slug} className="text-sm break-all" />
          </div>

          <nav
            aria-label="Model links"
            className="flex flex-wrap items-center gap-1.5 max-lg:w-full"
          >
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
          </nav>
        </div>

        {/* Everything below the identity row shares the container's left edge
            at every width - no breakpoint-dependent indentation. */}
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs">
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
              <dd className="min-w-0 font-mono break-words">{model.input_modalities.join(', ')}</dd>
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
      </div>
    </header>
  )
}
