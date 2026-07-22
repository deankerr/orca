'use client'

import {
  ActivityIcon,
  CalendarIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  SearchIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useId, useLayoutEffect, useRef, useState } from 'react'

import { CopyableEntitySlug } from '@/components/shared/copyable-entity-slug'
import { EntityAvatar } from '@/components/shared/entity-avatar'
import { InlineMarkdown } from '@/components/shared/inline-markdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { Model } from './types'
import { formatDate } from './utils'

// Two full 24px lines plus a glimpse of the third. The glimpse is
// faded out by the mask below, hinting that "Show more" has text to reveal.
const FULL_LINES_HEIGHT_PX = 48
const COLLAPSED_DESCRIPTION_HEIGHT_PX = FULL_LINES_HEIGHT_PX + 16

export function ModelHeader({ model }: { model: Model }) {
  return (
    <header>
      <div className="mx-auto w-full max-w-6xl px-3 pt-5 pb-4">
        {/* Identity row. The nav sits beside the title on wide screens and
            wraps onto its own full-width row below lg. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          <EntityAvatar slug={model.slug} className="size-12 rounded-md" />

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
              {model.name}
            </h1>
            <CopyableEntitySlug slug={model.slug} className="mt-0.5 text-sm break-all" />
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
        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs">
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

        {model.description !== undefined && model.description !== '' && (
          <ModelDescription key={model.slug} description={model.description} />
        )}
      </div>
    </header>
  )
}

function ModelDescription({ description }: { description: string }) {
  const contentId = useId()
  const paragraphRef = useRef<HTMLParagraphElement>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [naturalHeight, setNaturalHeight] = useState(COLLAPSED_DESCRIPTION_HEIGHT_PX)
  const isOverflowing = naturalHeight > COLLAPSED_DESCRIPTION_HEIGHT_PX + 1

  useLayoutEffect(() => {
    const paragraph = paragraphRef.current
    if (paragraph === null) {
      return undefined
    }

    const measure = () => {
      setNaturalHeight(paragraph.scrollHeight)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(paragraph)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <div className="mt-4 w-full max-w-[75ch]">
      {/* max-height (not height) lets short descriptions keep their natural
          size while both animation endpoints stay explicit pixel values. */}
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-out motion-reduce:transition-none"
        id={contentId}
        style={{
          maxHeight: isExpanded ? naturalHeight : COLLAPSED_DESCRIPTION_HEIGHT_PX,
          maskImage:
            !isExpanded && isOverflowing
              ? `linear-gradient(to bottom, black ${FULL_LINES_HEIGHT_PX}px, transparent)`
              : undefined,
        }}
      >
        <p ref={paragraphRef} className="text-sm leading-6 text-pretty text-muted-foreground">
          <InlineMarkdown text={description} />
        </p>
      </div>

      {/* The row is always reserved so the button appearing after measurement
          never shifts the tabs below the header. */}
      <div className="mt-1 flex h-7 items-center">
        {isOverflowing ? (
          <Button
            aria-controls={contentId}
            aria-expanded={isExpanded}
            className="relative -ml-2 after:absolute after:inset-x-0 after:-top-1 after:-bottom-3 active:scale-[0.96]"
            onClick={() => {
              setIsExpanded((current) => !current)
            }}
            size="default"
            variant="ghost"
          >
            {isExpanded ? 'Show less' : 'Show more'}
            <ChevronDownIcon
              data-icon="inline-end"
              className="transition-transform duration-200 group-aria-expanded/button:rotate-180 motion-reduce:transition-none"
            />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
