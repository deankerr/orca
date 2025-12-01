import * as R from 'remeda'

import { formatPricing } from '@/convex/shared/pricing'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { RadBadge } from '../shared/rad-badge'

// * Parse numeric value from number or numeric string (for percentage calculations)
function parseNumeric(value: unknown): number | null {
  if (R.isNumber(value)) return value
  if (R.isString(value)) {
    const parsed = parseFloat(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function ChangeValuePair({
  before,
  after,
  path_level_1,
  path_level_2,
}: {
  before: unknown
  after: unknown
  path_level_1?: string
  path_level_2?: string
}) {
  // Handle array diffs (skip pricing.tiers - show as JSON)
  const isPricingTiers = path_level_1 === 'pricing' && path_level_2 === 'tiers'
  if (Array.isArray(before) && Array.isArray(after) && !isPricingTiers) {
    return <ArrayDiff before={before} after={after} />
  }

  // * percentage change for numeric values (handles both numbers and numeric strings)
  const beforeNum = parseNumeric(before)
  const afterNum = parseNumeric(after)
  const showPercentage = beforeNum !== null && afterNum !== null && beforeNum !== 0
  const percentageChange = showPercentage ? ((afterNum - beforeNum) / beforeNum) * 100 : 0
  const isIncrease = showPercentage && afterNum > beforeNum
  const isGood = path_level_1 === 'pricing' ? !isIncrease : isIncrease

  return (
    <>
      <span> from </span>
      <ChangeValue value={before} path_level_1={path_level_1} path_level_2={path_level_2} />
      <span> to </span>
      <ChangeValue value={after} path_level_1={path_level_1} path_level_2={path_level_2} />
      {showPercentage && (
        <>
          {' '}
          <PercentageBadge value={percentageChange} isIncrease={isIncrease} isGood={isGood} />
        </>
      )}
    </>
  )
}

function ChangeValue({
  value,
  path_level_1,
  path_level_2,
}: {
  value: unknown
  path_level_1?: string
  path_level_2?: string
}) {
  // * pricing values - format with formatPricing, display as string (no unit)
  if (path_level_1 === 'pricing' && path_level_2 && (R.isString(value) || R.isNumber(value))) {
    const formatted = formatPricing(path_level_2, value)
    if (formatted) return <StringValue value={formatted.value} />
  }

  if (R.isNumber(value)) return <NumericValue value={value} />
  if (R.isString(value)) return <StringValue value={value} />
  if (R.isBoolean(value)) return <BooleanValue value={value} />
  if (value === null) return <NullValue />
  if (value === undefined) return <UndefinedValue />

  return <JSONValue value={value} />
}

function BaseBadge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <Badge
      variant="outline"
      className={cn('rounded-sm border-dotted text-sm text-foreground/80', className)}
      {...props}
    />
  )
}

function NumericValue({ value }: { value: number }) {
  return <BaseBadge title={String(value)}>{value.toLocaleString()}</BaseBadge>
}

function StringValue({ value }: { value: string }) {
  if (value === '') return <EmptyValue />
  if (value.length >= 60) return <JSONValue value={value} />

  const hasUppercase = value.match(/[A-Z]/)
  const hasSpace = value.match(/\s/)
  const isSlug = !hasUppercase && !hasSpace

  return <BaseBadge className={isSlug ? 'font-mono' : undefined}>{value}</BaseBadge>
}

function EmptyValue() {
  return <BaseBadge className="text-foreground/50">empty</BaseBadge>
}

function BooleanValue({ value }: { value: boolean }) {
  return <BaseBadge>{value ? 'true' : 'false'}</BaseBadge>
}

function NullValue() {
  return <BaseBadge className="text-foreground/50">null</BaseBadge>
}

function UndefinedValue() {
  return <BaseBadge className="text-foreground/50">null {/* intentional */}</BaseBadge>
}

function JSONValue({ value }: { value: unknown }) {
  const stringified = JSON.stringify(value, null, 2)
  return <BaseBadge className="mt-1 py-2 text-xs whitespace-normal">{stringified}</BaseBadge>
}

function PercentageBadge({
  value,
  isIncrease,
  isGood,
}: {
  value: number
  isIncrease: boolean
  isGood: boolean
}) {
  return (
    <RadBadge variant="surface" color={isGood ? 'green' : 'red'}>
      {isIncrease ? '+' : '-'}
      {Math.abs(value).toFixed(1)}%
    </RadBadge>
  )
}

function ArrayDiff({ before, after }: { before: unknown[]; after: unknown[] }) {
  const beforeSet = new Set(before.map(String))
  const afterSet = new Set(after.map(String))
  const allItems = Array.from(new Set([...before.map(String), ...after.map(String)])).sort()

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {allItems.map((item) => {
        const inBefore = beforeSet.has(item)
        const inAfter = afterSet.has(item)

        if (inBefore && inAfter) return null

        if (inBefore) {
          return (
            <RadBadge key={item} variant="surface" color="red" className="line-through">
              {item}
            </RadBadge>
          )
        }

        return (
          <RadBadge key={item} variant="surface" color="green">
            + {item}
          </RadBadge>
        )
      })}
    </span>
  )
}
