import * as R from 'remeda'

import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/formatters'
import { cn } from '@/lib/utils'

import { RadBadge } from '../shared/rad-badge'

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
  // Handle array diffs
  if (Array.isArray(before) && Array.isArray(after) && path_level_1 !== 'variable_pricings') {
    return <ArrayDiff before={before} after={after} />
  }

  const showPercentage = R.isNumber(before) && R.isNumber(after) && before !== 0
  const percentageChange = showPercentage ? ((after - before) / before) * 100 : 0
  const isIncrease = showPercentage && after > before
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
  // pricing values may have been transformed to strings
  if (path_level_1 === 'pricing' && R.isString(value)) {
    return <NumericValue value={Number(value)} priceKey={path_level_2} />
  }

  if (R.isNumber(value)) {
    const priceKey = path_level_1 === 'pricing' ? path_level_2 : undefined
    return <NumericValue value={value} priceKey={priceKey} />
  }

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

function NumericValue({ value, priceKey }: { value: number; priceKey?: string }) {
  const formatted = priceKey
    ? formatPrice({
        priceKey,
        priceValue: value,
        unitSuffix: priceKey === 'discount',
      })
    : value.toLocaleString()
  return <BaseBadge title={String(value)}>{formatted}</BaseBadge>
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
  return <BaseBadge className="opacity-80">empty</BaseBadge>
}

function BooleanValue({ value }: { value: boolean }) {
  return <BaseBadge>{value ? 'true' : 'false'}</BaseBadge>
}

function NullValue() {
  return <BaseBadge>null</BaseBadge>
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
    <RadBadge variant="soft" color={isGood ? 'green' : 'red'} className="">
      {isIncrease ? '+ ' : '- '}
      {Math.abs(value).toFixed(1)}%
    </RadBadge>
  )
}

function ArrayDiff({
  before,
  after,
  showUnchanged,
}: {
  before: unknown[]
  after: unknown[]
  showUnchanged?: boolean
}) {
  const beforeSet = new Set(before.map(String))
  const afterSet = new Set(after.map(String))
  const allItems = Array.from(new Set([...before.map(String), ...after.map(String)])).sort()

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {allItems.map((item) => {
        const inBefore = beforeSet.has(item)
        const inAfter = afterSet.has(item)

        // Unchanged
        if (inBefore && inAfter) {
          if (showUnchanged) {
            return (
              <Badge
                key={item}
                variant="outline"
                className="rounded-md border-dotted text-sm text-foreground/80"
              >
                {item}
              </Badge>
            )
          } else return null
        }

        // Removed
        if (inBefore) {
          return (
            <Badge
              key={item}
              className="rounded-md border-dotted border-negative-surface-border bg-negative-surface text-sm text-negative-surface-foreground line-through"
            >
              {item}
            </Badge>
          )
        }

        // Added
        return (
          <Badge
            key={item}
            className="rounded-md border-dotted border-positive-surface-border bg-positive-surface text-sm text-positive-surface-foreground"
          >
            + {item}
          </Badge>
        )
      })}
    </span>
  )
}
