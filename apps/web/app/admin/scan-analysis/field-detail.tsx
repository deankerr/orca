import type { Population } from '@orca/backend/scans/analysis'
import { numericSummary } from '@orca/json-profile'
import type { ValueProfile } from '@orca/json-profile'

const FREQUENCY_LIMIT = 50

export function percentage(count: number, total: number): string {
  return total === 0 ? '—' : `${((100 * count) / total).toFixed(1)}%`
}

/** Ranked values with counts; key sets wrap so every property in a combination stays visible. */
function Frequencies({
  entries,
  total,
  keySets = false,
}: {
  entries: { count: number; label: string }[]
  total: number
  keySets?: boolean
}) {
  const noun = keySets ? 'combinations' : 'values'

  const shown = entries
    .toSorted((left, right) => right.count - left.count)
    .slice(0, FREQUENCY_LIMIT)

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[0.625rem] text-muted-foreground">
        {entries.length > FREQUENCY_LIMIT
          ? `Showing the ${FREQUENCY_LIMIT} most frequent of ${entries.length} ${noun}. Export JSON for all of them.`
          : `${entries.length} distinct ${noun}.`}
      </p>
      <div className="grid max-h-72 max-w-3xl grid-cols-[minmax(0,1fr)_auto_8rem] items-center gap-x-3 gap-y-0.5 overflow-y-auto pr-2">
        {shown.map(({ count, label }, index) => (
          // Values are already distinct within one branch; the rank keeps keys stable and short.
          <div key={index} className="contents">
            <code
              className={keySets ? 'py-0.5 font-mono text-xs' : 'truncate font-mono text-xs'}
              title={label}
            >
              {label}
            </code>
            <span className="text-right font-mono text-xs tabular-nums">
              {count.toLocaleString()}{' '}
              <span className="text-muted-foreground">{percentage(count, total)}</span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span
                className="block h-full bg-primary"
                style={{ width: `${total === 0 ? 0 : (100 * count) / total}%` }}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Branch({ branch }: { branch: ValueProfile['types'][number] }) {
  const heading = (
    <h3 className="text-xs font-medium">
      {branch.type}{' '}
      <span className="font-normal text-muted-foreground">
        {branch.count.toLocaleString()} occurrences
      </span>
    </h3>
  )

  if ('values' in branch) {
    return (
      <div className="flex flex-col gap-1">
        {heading}
        <Frequencies
          entries={branch.values.map(({ count, value }) => ({
            count,
            label: JSON.stringify(value),
          }))}
          total={branch.count}
        />
      </div>
    )
  }

  if (branch.type === 'array') {
    return (
      <div className="flex flex-col gap-1">
        {heading}
        <p className="text-[0.625rem] text-muted-foreground">
          Array length distribution. Item values appear in the [*] field.
        </p>
        <Frequencies
          entries={branch.lengths.map(({ count, length }) => ({ count, label: String(length) }))}
          total={branch.count}
        />
      </div>
    )
  }

  if (branch.type === 'object') {
    return (
      <div className="flex flex-col gap-1">
        {heading}
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Explore {branch.key_sets.length} property combinations
          </summary>
          <Frequencies
            entries={branch.key_sets.map(({ count, keys }) => ({ count, label: keys.join(', ') }))}
            total={branch.count}
            keySets
          />
        </details>
      </div>
    )
  }

  return heading
}

export function FieldDetail({
  missing,
  nulls,
  value,
  population,
}: {
  missing: number
  nulls: number
  value: ValueProfile
  population: Population
}) {
  const summary = numericSummary(value)
  const examples = population.examples[value.path] ?? []

  return (
    <div className="flex flex-col gap-3 border-t bg-muted/20 py-3 pr-3 pl-7.5">
      <p className="text-[0.625rem] text-muted-foreground">
        {missing.toLocaleString()} absent · {nulls.toLocaleString()} null ·{' '}
        {value.population.toLocaleString()} possible locations
      </p>
      {summary !== null && (
        <div className="grid w-fit grid-cols-4 gap-6">
          {(
            [
              ['Minimum', summary.min],
              ['Median', summary.median],
              ['95th percentile', summary.p95],
              ['Maximum', summary.max],
            ] as const
          ).map(([label, number]) => (
            <div key={label} className="flex flex-col">
              <span className="text-[0.625rem] text-muted-foreground">{label}</span>
              <span className="font-mono text-sm tabular-nums">{number.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
      {value.types.map((branch) => (
        <Branch key={branch.type} branch={branch} />
      ))}
      {examples.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-medium">Entity examples</h3>
          {examples.map(({ id, value: example }) => (
            <div key={id} className="grid grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-3">
              <code className="truncate font-mono text-xs text-muted-foreground" title={id}>
                {id}
              </code>
              <code className="truncate font-mono text-xs" title={JSON.stringify(example)}>
                {JSON.stringify(example)}
              </code>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
