import { Tooltip, TooltipContent, TooltipTrigger } from '@orca/ui/components/tooltip'
import { cn } from 'cn'
import { ExternalLinkIcon } from 'lucide-react'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'

import { CopyText } from './copy-text'
import { linkText } from './facts'
import type { FactRow, Section } from './facts'

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

/** A list's items as small chips, wrapping under their label. */
function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1 pt-0.5 pb-0.5">
      {items.map((item) => (
        <li
          className="rounded-[3px] border border-border-solid px-1 font-mono text-[10px] leading-4 text-muted-foreground"
          key={item}
        >
          {item}
        </li>
      ))}
    </ul>
  )
}

function Value({ row }: { row: FactRow }) {
  // A rate never breaks across lines; a line too short for it moves it under its label instead.
  const className = cn(
    'text-right font-mono text-xs/[18px]',
    row.rate === true ? 'ml-auto shrink-0 whitespace-nowrap' : 'min-w-0 wrap-anywhere',
  )

  if (row.href !== undefined) {
    return (
      <ExternalLink className={className} href={row.href}>
        {row.value}
      </ExternalLink>
    )
  }

  if (row.copyLabel !== undefined) {
    return (
      <CopyText className={className} label={row.copyLabel} text={row.value}>
        {row.value}
      </CopyText>
    )
  }

  return <span className={className}>{row.value}</span>
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
function FactLine({ row }: { row: FactRow }) {
  const descriptionId = useId()

  const stacked = row.items !== undefined

  const lineClass = cn(
    'flex items-baseline justify-between gap-x-4',
    row.rate === true && 'flex-wrap',
    stacked && 'flex-col items-stretch gap-y-0.5',
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
      {row.items === undefined ? <Value row={row} /> : <Chips items={row.items} />}
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
              className={cn(
                lineClass,
                'rounded-sm',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              )}
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The row is the keyboard target for its description tooltip, which a screen reader reads through aria-describedby.
              tabIndex={0}
            >
              {content}
            </div>
          }
        />
        <TooltipContent side="left">
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
      {section.links?.map((href) => (
        <PageLink href={href} key={href} />
      ))}
      {section.text === undefined ? null : <ClampedText text={section.text} />}
      {section.rows.map((row) => (
        <FactLine key={row.id} row={row} />
      ))}
    </SectionBlock>
  )
}

/**
 * A link out, in a new tab, labelled with its hostname and an external-link icon. The full address
 * is the tooltip (the native `title`), which also says where the link goes before it is followed.
 */
function ExternalLink({
  children,
  className,
  href,
}: {
  children: ReactNode
  className?: string
  href: string
}) {
  return (
    <a
      className={cn(
        'inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
        className,
      )}
      href={href}
      rel="noreferrer"
      target="_blank"
      title={href}
    >
      <span className="min-w-0 wrap-anywhere underline decoration-border-solid underline-offset-2 hover:decoration-foreground">
        {children}
      </span>
      <ExternalLinkIcon aria-hidden className="size-3 shrink-0" />
    </a>
  )
}

/** A link of its own, named by its hostname: `openrouter.ai`. */
function PageLink({ href }: { href: string }) {
  return (
    <ExternalLink className="self-start font-mono text-xs/[18px] text-muted-foreground" href={href}>
      {linkText(href)}
    </ExternalLink>
  )
}

/** Characters past which a description is likely to need more than its clamped lines. */
const CLAMP_THRESHOLD = 240

/** Text clamped to a few lines, with a control to read the rest. */
function ClampedText({ text }: { text: string }) {
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
