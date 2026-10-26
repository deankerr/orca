'use client'

import type { AlertChange, AlertFact } from '@orca/backend/alerts/curate'
import type { Movement } from '@orca/backend/alerts/present'

import { InlineMarkdown } from '@/components/shared/inline-markdown'
import { isBlockText, presentChange } from '@/lib/backend'
import { cn } from '@/lib/utils'

import { fieldLabel, formatChangeValue, formatChangeUnit } from './field-format'

const TRUNCATE_LENGTH = 800

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, maxLength - 3)}...`
}

// -- Label colors

const label = 'text-muted-foreground'
const labelDimmer = 'text-muted-foreground/60'

// -- Primitives

function FieldLabel({ className, children, ...props }: React.ComponentProps<'span'>) {
  return (
    <span className={cn('mr-2 min-w-[11ch]', label, className)} {...props}>
      {children}
    </span>
  )
}

export function FieldUnit({ children }: { children: React.ReactNode }) {
  return <span className={labelDimmer}>/{children}</span>
}

// -- FieldCategory — container for a group of field change items

function FieldCategory({ name, children }: { name?: string | null; children: React.ReactNode }) {
  const hasName = name !== null && name !== undefined && name !== ''

  return (
    <div className="space-y-0.5">
      {hasName && <div className="text-muted-foreground/80">{name}</div>}
      <div className={cn('space-y-0.5', hasName && 'pl-3')}>{children}</div>
    </div>
  )
}

// -- FieldItemSet — horizontal layout for static field items

export function FieldItemSet({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-xs">{children}</div>
}

// -- FieldItem — static label/value pair (for new entity metadata)

export function FieldItem({
  label: labelText,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <FieldLabel className="mr-0">{labelText}</FieldLabel>
      <div>{children}</div>
    </div>
  )
}

// -- Diff symbol

function DiffSymbol({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('-ml-3.5 w-2 text-center', className)}>{children}</span>
}

// -- Field change items

function FieldUpdatedItem({
  fieldKey,
  before,
  after,
  movement,
}: {
  fieldKey: string
  before: AlertFact
  after: AlertFact
  movement: Movement | null
}) {
  if (isBlockText(before, 'pair') || isBlockText(after, 'pair')) {
    return (
      <div data-field={after.field}>
        <FieldLabel>{fieldKey}</FieldLabel>
        <div className="mt-0.5 space-y-0.5 border-l-2 border-border-solid pl-2 font-sans">
          <p className="whitespace-pre-line text-muted-foreground line-through">
            <InlineMarkdown text={truncate(formatChangeValue(before), TRUNCATE_LENGTH)} />
          </p>
          <p className="whitespace-pre-line text-muted-foreground">
            <InlineMarkdown text={truncate(formatChangeValue(after), TRUNCATE_LENGTH)} />
          </p>
        </div>
      </div>
    )
  }

  const unit = formatChangeUnit(before, after)

  return (
    <div className="flex flex-wrap items-center gap-x-1.5" data-field={after.field}>
      <FieldLabel>{fieldKey}</FieldLabel>
      <span className={cn(label, 'line-through')}>{formatChangeValue(before)}</span>
      <span className={labelDimmer}>→</span>
      <span className="text-foreground">{formatChangeValue(after)}</span>
      {unit !== '' && <FieldUnit>{unit}</FieldUnit>}
      {movement && <DeltaBadge movement={movement} />}
    </div>
  )
}

function FieldPresenceItem({
  fieldKey,
  item,
  removed,
}: {
  fieldKey: string
  item: AlertFact
  removed: boolean
}) {
  const value = formatChangeValue(item)
  const isLong = isBlockText(item, 'single')
  const color = removed ? 'text-negative-soft-foreground' : 'text-positive-soft-foreground'
  const unit = formatChangeUnit(item)

  return (
    <div
      className={cn(!isLong && 'flex flex-wrap items-baseline gap-x-1.5')}
      data-field={item.field}
    >
      <DiffSymbol className={color}>{removed ? '-' : '+'}</DiffSymbol>
      <FieldLabel>{fieldKey}</FieldLabel>
      {isLong ? (
        <p
          className={cn(
            'mt-0.5 border-l-2 border-border-solid pl-2 font-sans whitespace-pre-line text-muted-foreground',
            removed && 'line-through',
          )}
        >
          <InlineMarkdown text={truncate(value, TRUNCATE_LENGTH)} />
        </p>
      ) : (
        <>
          <span
            className={cn(
              removed ? 'text-negative-soft-foreground line-through' : 'text-foreground',
            )}
          >
            {value}
          </span>
          {unit && <FieldUnit>{unit}</FieldUnit>}
        </>
      )}
    </div>
  )
}

function FieldSetUpdatedItem({
  field,
  fieldKey,
  added,
  removed,
}: {
  field: string
  fieldKey: string
  added: string[]
  removed: string[]
}) {
  if (added.length === 0 && removed.length === 0) {
    return null
  }

  return (
    <div data-field={field}>
      <FieldLabel>{fieldKey}</FieldLabel>
      <div className="mt-0.5 space-y-px pl-2">
        {removed.map((item) => (
          <div key={item} className="text-negative-soft-foreground">
            - {item}
          </div>
        ))}
        {added.map((item) => (
          <div key={item} className="text-positive-soft-foreground">
            + {item}
          </div>
        ))}
      </div>
    </div>
  )
}

// -- Change item router

function ChangeItem({ change }: { change: AlertChange }) {
  const key = fieldLabel(change.field)
  const presented = presentChange(change)

  if (presented.transition === 'opaque') {
    return <div data-field={change.field}>{key} changed.</div>
  }

  if (presented.transition === 'members') {
    return (
      <FieldSetUpdatedItem
        field={change.field}
        fieldKey={key}
        added={presented.added}
        removed={presented.removed}
      />
    )
  }

  if (presented.transition === 'added' || presented.transition === 'removed') {
    return (
      <FieldPresenceItem
        fieldKey={key}
        item={presented.fact}
        removed={presented.transition === 'removed'}
      />
    )
  }

  return (
    <FieldUpdatedItem
      fieldKey={key}
      before={presented.before}
      after={presented.after}
      movement={presented.movement}
    />
  )
}

// -- Field change list

export function FieldChangeList({ fields }: { fields: AlertChange[] }) {
  if (fields.length === 0) {
    return null
  }

  const grouped = Map.groupBy(fields, ({ field }) => {
    const dotIndex = field.indexOf('.')

    return dotIndex === -1 ? null : field.slice(0, dotIndex)
  })

  const topLevel = grouped.get(null) ?? []
  const categories = [...grouped.entries()].filter(([cat]) => cat !== null)

  return (
    <div className="flex flex-col gap-1.5 font-mono text-xs">
      {topLevel.length > 0 && (
        <FieldCategory>
          {topLevel.map((f) => (
            <ChangeItem key={f.field} change={f} />
          ))}
        </FieldCategory>
      )}

      {categories.map(([category, items]) => (
        <FieldCategory key={category} name={category}>
          {items.map((f) => (
            <ChangeItem key={f.field} change={f} />
          ))}
        </FieldCategory>
      ))}
    </div>
  )
}

// -- Delta badge

function DeltaBadge({ movement }: { movement: Movement }) {
  const arrow = movement.isUp ? '\u25B2' : '\u25BC'

  const color = movement.isFavorable
    ? 'text-positive-soft-foreground'
    : 'text-negative-soft-foreground'

  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs', color)}>
      <span className="translate-y-px text-[8px]">{arrow}</span>
      {movement.percent}
    </span>
  )
}
