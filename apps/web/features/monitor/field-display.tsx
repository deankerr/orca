'use client'

import { splitPath } from '@orca/backend/convex/shared/formatters'
import { truncate } from '@orca/backend/convex/shared/utils'
import type { FieldChange } from '@orca/backend/convex/v4/eventRenderers/curate'

import { InlineMarkdown } from '@/components/shared/inline-markdown'
import { cn } from '@/lib/utils'

import { fieldLabel, formatChangeValue, formatChangeUnit, formatChangeDelta } from './field-format'

const TRUNCATE_LENGTH = 800
const LONG_STRING_LENGTH = 30

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
  field,
}: {
  fieldKey: string
  field: Extract<FieldChange, { type: 'field_updated' }>
}) {
  const isLong =
    !field.path.startsWith('pricing.') &&
    ((typeof field.before === 'string' && field.before.length > LONG_STRING_LENGTH) ||
      (typeof field.after === 'string' && field.after.length > LONG_STRING_LENGTH))

  if (isLong) {
    const before = truncate(formatChangeValue(field.before, field.path), TRUNCATE_LENGTH)
    const after = truncate(formatChangeValue(field.after, field.path), TRUNCATE_LENGTH)
    return (
      <div data-field={field.path}>
        <FieldLabel>{fieldKey}</FieldLabel>
        <div className="mt-0.5 space-y-0.5 border-l-2 border-border-solid pl-2 font-sans">
          <p className="whitespace-pre-line text-muted-foreground line-through">
            <InlineMarkdown text={before} />
          </p>
          <p className="whitespace-pre-line text-muted-foreground">
            <InlineMarkdown text={after} />
          </p>
        </div>
      </div>
    )
  }

  const before = formatChangeValue(field.before, field.path)
  const after = formatChangeValue(field.after, field.path)
  const delta = formatChangeDelta(field.before, field.after, field.path)
  const unit = formatChangeUnit(field.path, field.before, field.after)
  const hasUnit = unit !== ''

  return (
    <div className="flex flex-wrap items-center gap-x-1.5" data-field={field.path}>
      <FieldLabel>{fieldKey}</FieldLabel>
      <span className={cn(label, 'line-through')}>{before}</span>
      <span className={labelDimmer}>→</span>
      <span className="text-foreground">{after}</span>
      {hasUnit && <FieldUnit>{unit}</FieldUnit>}
      {delta && <DeltaBadge delta={delta} />}
    </div>
  )
}

function FieldPresenceItem({
  fieldKey,
  field,
}: {
  fieldKey: string
  field: Extract<FieldChange, { type: 'field_added' | 'field_removed' }>
}) {
  const removed = field.type === 'field_removed'
  const input = removed ? field.before : field.after
  const value = formatChangeValue(input, field.path)

  const isLong =
    !field.path.startsWith('pricing.') && typeof input === 'string' && input.length > 80

  const color = removed ? 'text-negative-soft-foreground' : 'text-positive-soft-foreground'
  const unit = formatChangeUnit(field.path, input)

  return (
    <div
      className={cn(!isLong && 'flex flex-wrap items-baseline gap-x-1.5')}
      data-field={field.path}
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
  fieldKey,
  field,
}: {
  fieldKey: string
  field: Extract<FieldChange, { type: 'set_updated' }>
}) {
  const { added, removed } = field

  if (added.length === 0 && removed.length === 0) {
    return null
  }

  return (
    <div data-field={field.path}>
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

function ChangeItem({ field }: { field: FieldChange }) {
  const key = fieldLabel(field.path)

  if (field.type === 'set_updated') {
    return <FieldSetUpdatedItem fieldKey={key} field={field} />
  }

  if (field.type === 'field_added' || field.type === 'field_removed') {
    return <FieldPresenceItem fieldKey={key} field={field} />
  }

  return <FieldUpdatedItem fieldKey={key} field={field} />
}

// -- Field change list

export function FieldChangeList({ fields }: { fields: FieldChange[] }) {
  if (fields.length === 0) {
    return null
  }

  const grouped = Map.groupBy(fields, (f) => splitPath(f.path).category)
  const topLevel = grouped.get(null) ?? []
  const categories = [...grouped.entries()].filter(([cat]) => cat !== null)

  return (
    <div className="flex flex-col gap-1.5 font-mono text-xs">
      {topLevel.length > 0 && (
        <FieldCategory>
          {topLevel.map((f) => (
            <ChangeItem key={f.path} field={f} />
          ))}
        </FieldCategory>
      )}

      {categories.map(([category, items]) => (
        <FieldCategory key={category} name={category}>
          {items.map((f) => (
            <ChangeItem key={f.path} field={f} />
          ))}
        </FieldCategory>
      ))}
    </div>
  )
}

// -- Delta badge

function DeltaBadge({ delta }: { delta: { percent: string; isUp: boolean; isGood: boolean } }) {
  const arrow = delta.isUp ? '\u25B2' : '\u25BC'
  const pct = delta.percent
  const color = delta.isGood ? 'text-positive-soft-foreground' : 'text-negative-soft-foreground'

  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs', color)}>
      <span className="translate-y-px text-[8px]">{arrow}</span>
      {pct}
    </span>
  )
}
