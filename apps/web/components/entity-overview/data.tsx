'use client'

import { AlertTriangleIcon, ArrowUpRightIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'

import { InlineMarkdown } from '@/components/shared/inline-markdown'
import { cn } from '@/lib/utils'

const textLinkClass =
  'group inline-flex items-center gap-0.5 rounded-sm text-muted-foreground underline decoration-border decoration-dashed underline-offset-4 transition-[color,scale,text-decoration-color] outline-none hover:text-foreground hover:decoration-foreground/50 focus-visible:ring-2 focus-visible:ring-ring/30'

export function DataValue({
  label,
  value,
}: {
  label: string
  value: string | boolean | string[] | null
}) {
  if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return null
  }

  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-mono break-words">
        {typeof value === 'boolean'
          ? value
            ? 'Yes'
            : 'No'
          : Array.isArray(value)
            ? value.join(', ')
            : value}
      </dd>
    </div>
  )
}

export function DataDate({ label, value }: { label: string; value: string | null }) {
  const date = value === null ? null : new Date(value)

  return (
    <DataValue
      label={label}
      value={
        date === null || Number.isNaN(date.getTime())
          ? null
          : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      }
    />
  )
}

export function DataDescription({ value }: { value: string | null }) {
  const textRef = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const el = textRef.current

    if (el === null) {
      return undefined
    }

    const measure = () => {
      if (!expanded) {
        setOverflows(el.scrollHeight > el.clientHeight + 1)
      }
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [value, expanded])

  if (value === null || value === '') {
    return null
  }

  return (
    <div>
      <p
        ref={textRef}
        className={cn('whitespace-pre-wrap text-muted-foreground', !expanded && 'line-clamp-3')}
      >
        <InlineMarkdown text={value} />
      </p>
      {overflows && (
        <button
          type="button"
          className={cn(textLinkClass, 'mt-1')}
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((open) => !open)
          }}
        >
          {expanded ? 'Show Less' : 'Show More'}
        </button>
      )}
    </div>
  )
}

export function DataLink({
  label,
  href,
  warnWhenMissing = false,
}: {
  label: string
  href: string | null
  warnWhenMissing?: boolean
}) {
  if (href === null) {
    return warnWhenMissing ? (
      <div className="flex min-h-8 items-center justify-between gap-3">
        <span>{label}</span>
        <span className="flex items-center gap-1 text-amber-500">
          <AlertTriangleIcon className="size-3" />
          Not Provided
        </span>
      </div>
    ) : null
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(textLinkClass, 'flex min-h-8 w-fit')}
    >
      {label}
      <ArrowUpRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
    </a>
  )
}
