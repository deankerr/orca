import { Tooltip, TooltipContent, TooltipTrigger } from '@orca/ui/components/tooltip'
import { cn } from 'cn'
import { ExternalLinkIcon } from 'lucide-react'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'

import { FOCUS_RING } from '#components/facet'

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

/** A description as plain text, for assistive technology: backticks only mark code visually. */
const plainText = (text: string) => text.replaceAll('`', '')

function Value({ row }: { row: FactRow }) {
  // A rate never breaks across lines; a line too short for it moves it under its label instead.
  const className = cn(
    'text-right font-mono text-xs/[18px]',
    row.rate === true ? 'ml-auto shrink-0 whitespace-nowrap' : 'min-w-0 wrap-anywhere',
  )

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

/**
 * One label and value. A row with a description shows it in a tooltip on hover or keyboard focus,
 * because short labels mislead.
 *
 * The row is the tab stop, with the description attached as its accessible description, so a screen
 * reader reads it with the row whether or not the tooltip is open. That costs a tab stop for each
 * described row, as the Filters panel's property rows do; Esc leaves them all at once by closing
 * the panel. A single stop with arrow keys between rows would need ↑ and ↓, which step the Table.
 */
export function FactLine({ row }: { row: FactRow }) {
  const descriptionId = useId()

  const lineClass = cn(
    'flex items-baseline justify-between gap-x-4',
    row.rate === true && 'flex-wrap',
  )

  const content = (
    <>
      <span
        className={cn(
          'min-w-0 text-[13px]/[18px]',
          row.emphasis === true ? 'text-foreground' : 'text-muted-foreground',
          row.indent === true && 'pl-3',
        )}
      >
        {row.label}
      </span>
      <Value row={row} />
    </>
  )

  if (row.description === undefined) {
    return <div className={lineClass}>{content}</div>
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              aria-describedby={descriptionId}
              className={cn(lineClass, 'rounded-sm', FOCUS_RING)}
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The row is the keyboard target for its description tooltip, which a screen reader reads through aria-describedby.
              tabIndex={0}
            >
              {content}
            </div>
          }
        />
        <TooltipContent align="end" side="left">
          <span>
            <Description text={row.description} />
          </span>
        </TooltipContent>
      </Tooltip>
      <span hidden id={descriptionId}>
        {plainText(row.description)}
      </span>
    </>
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
