'use client'

import type { FieldChange } from '@orca/backend/convex/changes'
import { computeDelta, fmtUnit, fmtValue, splitPath } from '@orca/backend/shared/formatters'
import { truncate } from '@orca/backend/shared/utils'

import { cn } from '@/lib/utils'

import { InlineMarkdown } from './inline-markdown'

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

export function FieldCategory({
  name,
  children,
}: {
  name?: string | null
  children: React.ReactNode
}) {
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
  field: Extract<FieldChange, { kind: 'field_updated' }>
}) {
  const isLong =
    (typeof field.before === 'string' && field.before.length > LONG_STRING_LENGTH) ||
    (typeof field.after === 'string' && field.after.length > LONG_STRING_LENGTH)

  if (isLong) {
    const before = truncate(String(field.before), TRUNCATE_LENGTH)
    const after = truncate(String(field.after), TRUNCATE_LENGTH)
    return (
      <div data-change-id={field.change_id}>
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

  const before = fmtValue(field.before, field.path)
  const after = fmtValue(field.after, field.path)
  const delta = computeDelta(field.before, field.after, field.path)
  const unit = fmtUnit(field.path)
  const hasUnit = unit !== null && unit !== ''

  return (
    <div className="flex flex-wrap items-center gap-x-1.5" data-change-id={field.change_id}>
      <FieldLabel>{fieldKey}</FieldLabel>
      <span className={cn(label, 'line-through')}>{before}</span>
      <span className={labelDimmer}>-&gt;</span>
      <span className="text-foreground">{after}</span>
      {hasUnit && <FieldUnit>{unit}</FieldUnit>}
      {delta && <DeltaBadge delta={delta} />}
    </div>
  )
}

function FieldAddedItem({
  fieldKey,
  field,
}: {
  fieldKey: string
  field: Extract<FieldChange, { kind: 'field_added' }>
}) {
  const isLong = typeof field.value === 'string' && field.value.length > 80

  if (isLong) {
    return (
      <div data-change-id={field.change_id}>
        <DiffSymbol className="text-positive-soft-foreground">+ </DiffSymbol>
        <FieldLabel>{fieldKey}</FieldLabel>
        <p className="mt-0.5 border-l-2 border-border-solid pl-2 font-sans whitespace-pre-line text-muted-foreground">
          <InlineMarkdown text={truncate(String(field.value), TRUNCATE_LENGTH)} />
        </p>
      </div>
    )
  }

  const value = fmtValue(field.value, field.path)
  const unit = fmtUnit(field.path)
  const hasUnit = unit !== null && unit !== ''

  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5" data-change-id={field.change_id}>
      <DiffSymbol className="text-positive-soft-foreground">+</DiffSymbol>
      <FieldLabel>{fieldKey}</FieldLabel>
      <span className="text-foreground">{value}</span>
      {hasUnit && <FieldUnit>{unit}</FieldUnit>}
    </div>
  )
}

function FieldRemovedItem({
  fieldKey,
  field,
}: {
  fieldKey: string
  field: Extract<FieldChange, { kind: 'field_removed' }>
}) {
  const isLong = typeof field.value === 'string' && field.value.length > 80

  if (isLong) {
    return (
      <div data-change-id={field.change_id}>
        <DiffSymbol className="text-negative-soft-foreground">- </DiffSymbol>
        <FieldLabel>{fieldKey}</FieldLabel>
        <p className="mt-0.5 border-l-2 border-border-solid pl-2 font-sans whitespace-pre-line text-muted-foreground line-through">
          <InlineMarkdown text={truncate(String(field.value), TRUNCATE_LENGTH)} />
        </p>
      </div>
    )
  }

  const value = fmtValue(field.value, field.path)
  const unit = fmtUnit(field.path)
  const hasUnit = unit !== null && unit !== ''

  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5" data-change-id={field.change_id}>
      <DiffSymbol className="text-negative-soft-foreground">-</DiffSymbol>
      <FieldLabel>{fieldKey}</FieldLabel>
      <span className="text-negative-soft-foreground line-through">{value}</span>
      {hasUnit && <FieldUnit>{unit}</FieldUnit>}
    </div>
  )
}

function FieldSetUpdatedItem({
  fieldKey,
  field,
}: {
  fieldKey: string
  field: Extract<FieldChange, { kind: 'set_updated' }>
}) {
  const added = field.items.filter((i) => i.status === 'added')
  const removed = field.items.filter((i) => i.status === 'removed')
  if (added.length === 0 && removed.length === 0) {
    return null
  }

  return (
    <div data-change-id={field.change_id}>
      <FieldLabel>{fieldKey}</FieldLabel>
      <div className="mt-0.5 space-y-px pl-2">
        {removed.map((item) => (
          <div key={item.value} className="text-negative-soft-foreground">
            - {item.value}
          </div>
        ))}
        {added.map((item) => (
          <div key={item.value} className="text-positive-soft-foreground">
            + {item.value}
          </div>
        ))}
      </div>
    </div>
  )
}

// -- Change item router

function ChangeItem({ field }: { field: FieldChange }) {
  const { key: rawKey } = splitPath(field.path)
  const key = rawKey.startsWith('text_cache_') ? rawKey.slice(5) : rawKey

  if (field.kind === 'set_updated') {
    return <FieldSetUpdatedItem fieldKey={key} field={field} />
  }
  if (field.kind === 'field_added') {
    return <FieldAddedItem fieldKey={key} field={field} />
  }
  if (field.kind === 'field_removed') {
    return <FieldRemovedItem fieldKey={key} field={field} />
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
            <ChangeItem key={f.change_id} field={f} />
          ))}
        </FieldCategory>
      )}

      {categories.map(([category, items]) => (
        <FieldCategory key={category} name={category}>
          {items.map((f) => (
            <ChangeItem key={f.change_id} field={f} />
          ))}
        </FieldCategory>
      ))}
    </div>
  )
}

// -- Delta badge

function DeltaBadge({ delta }: { delta: { pct: number; isUp: boolean; isGood: boolean } }) {
  const arrow = delta.isUp ? '\u25B2' : '\u25BC'
  const pct = `${Math.abs(delta.pct).toFixed(1)}%`
  const color = delta.isGood ? 'text-positive-soft-foreground' : 'text-negative-soft-foreground'

  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs', color)}>
      <span className="translate-y-px text-[8px]">{arrow}</span>
      {pct}
    </span>
  )
}
