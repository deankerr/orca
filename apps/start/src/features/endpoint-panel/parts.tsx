import { Tooltip, TooltipContent, TooltipTrigger } from '@orca/ui/components/tooltip'
import { cn } from 'cn'
import { ExternalLinkIcon } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import type { FactRow, Section } from './rows'

/** A description with its backtick-marked code set in mono. */
function Description({ text }: { text: string }) {
  return text.split('`').map((part, index) =>
    index % 2 === 1 ? (
      <code className="font-mono text-[11px]" key={index}>
        {part}
      </code>
    ) : (
      part
    ),
  )
}

function Value({ row }: { row: FactRow }) {
  const className = 'min-w-0 text-right font-mono text-xs/[18px] wrap-anywhere'

  return row.href === undefined ? (
    <span className={className}>{row.value}</span>
  ) : (
    <a
      className={cn(
        className,
        'underline decoration-border-solid underline-offset-2 hover:decoration-foreground',
      )}
      href={row.href}
      rel="noreferrer"
      target="_blank"
    >
      {row.value}
    </a>
  )
}

/** One label and value. A row with a description shows it on hover, because short labels mislead. */
export function FactLine({ row }: { row: FactRow }) {
  const line = (
    <div className="flex items-baseline justify-between gap-4">
      <span
        className={cn(
          'text-[13px]/[18px]',
          row.emphasis === true ? 'text-foreground' : 'text-muted-foreground',
          row.indent === true && 'pl-3',
        )}
      >
        {row.label}
      </span>
      <Value row={row} />
    </div>
  )

  if (row.description === undefined) {
    return line
  }

  return (
    <Tooltip>
      <TooltipTrigger render={line} />
      <TooltipContent align="end" side="left">
        <span>
          <Description text={row.description} />
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

export function SectionBlock({
  children,
  note,
  title,
}: {
  children: ReactNode
  note?: string | undefined
  title: string
}) {
  return (
    <section className="flex flex-col gap-[3px] border-b border-border px-4 py-2.5 last:border-b-0">
      <div className="flex h-[18px] shrink-0 justify-between font-mono text-[10px] leading-3.5 text-muted-foreground">
        <h2 className="font-normal tracking-[0.08em] uppercase">{title}</h2>
        {note === undefined ? null : <span>{note}</span>}
      </div>
      {children}
    </section>
  )
}

export function RowsSection({ section }: { section: Section }) {
  return (
    <SectionBlock note={section.note} title={section.title}>
      {section.rows.map((row) => (
        <FactLine key={row.id} row={row} />
      ))}
    </SectionBlock>
  )
}

/** A link out to OpenRouter, in a new tab. */
export function PageLink({ href, children }: { children: ReactNode; href: string }) {
  return (
    <a
      className="flex items-center gap-1.5 text-[13px]/[18px] text-muted-foreground hover:text-foreground"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
      <ExternalLinkIcon aria-hidden className="size-3" />
    </a>
  )
}

/** Characters past which a description is likely to need more than its clamped lines. */
const CLAMP_THRESHOLD = 240

/** Text clamped to a few lines, with a control to read the rest. */
export function ClampedText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const long = text.length > CLAMP_THRESHOLD

  return (
    <div className="flex flex-col items-start gap-1">
      <p
        className={cn(
          'text-[13px]/[18px] whitespace-pre-line text-muted-foreground',
          long && !expanded && 'line-clamp-4',
        )}
      >
        {text}
      </p>
      {long ? (
        <button
          aria-expanded={expanded}
          className="text-xs text-foreground underline decoration-border-solid underline-offset-2 hover:decoration-foreground"
          onClick={() => {
            setExpanded(!expanded)
          }}
          type="button"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  )
}
