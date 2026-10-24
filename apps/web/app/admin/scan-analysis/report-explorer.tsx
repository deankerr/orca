'use client'

import type { Population, ScanReport } from '@orca/backend/scans/analysis'
import { distinctValues, profileRows } from '@orca/json-profile'
import type { ProfileRow } from '@orca/json-profile'
import { useDeferredValue, useState } from 'react'

import { SearchInput } from '@/components/shared/search-input'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { FieldDetail, percentage } from './field-detail'
import { readablePath } from './field-path'

const POPULATIONS = ['endpoints', 'models', 'providers'] as const
type PopulationName = (typeof POPULATIONS)[number]

const SORTS = { distinct: 'Most distinct', missing: 'Most absent', path: 'Field path' } as const
type Sort = keyof typeof SORTS

const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_12rem_5rem_5rem_6rem] items-center gap-3 px-3'

function compare(sort: Sort) {
  return (left: ProfileRow, right: ProfileRow) => {
    if (sort === 'missing') {
      return (
        right.missing / (right.value.population || 1) - left.missing / (left.value.population || 1)
      )
    }

    if (sort === 'distinct') {
      return distinctValues(right.value) - distinctValues(left.value)
    }

    return left.value.path.localeCompare(right.value.path)
  }
}

function exportReport(report: ScanReport) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `scan-profile.${report.scan_at}.json`
  link.click()

  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}

/** Field explorer for one report; capture time and selection date every observation shown. */
export function ReportExplorer({ report }: { report: ScanReport }) {
  const [populationName, setPopulationName] = useState<PopulationName>('endpoints')
  const [sort, setSort] = useState<Sort>('path')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query).trim().toLowerCase()
  const population = report[populationName]
  const all = profileRows(population.profile)
  const rows = all
    .filter(({ value }) => {
      const { parent, leaf } = readablePath(value.path)
      return [value.path, parent + leaf].some((path) => path.toLowerCase().includes(deferredQuery))
    })
    .toSorted(compare(sort))
  const filters = [report.selection.model, report.selection.provider].filter(Boolean).join(' · ')

  return (
    <section className="flex flex-col gap-3" aria-label="Explore fields">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm">{report.scan_at}</span>
        <span className="text-xs text-muted-foreground">
          {report.selection.scope === 'orca' ? 'ORCA scope' : 'Collected data'}
          {filters === '' ? '' : ` · ${filters}`}
        </span>
        <Button
          className="ml-auto"
          size="sm"
          variant="outline"
          onClick={() => {
            exportReport(report)
          }}
        >
          Export JSON
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          multiple={false}
          value={[populationName]}
          onValueChange={(value: string[]) => {
            const next = POPULATIONS.find((name) => name === value[0])
            if (next !== undefined) {
              setPopulationName(next)
            }
          }}
          size="sm"
          variant="outline"
          aria-label="Population"
        >
          {POPULATIONS.map((name) => (
            <ToggleGroupItem key={name} value={name}>
              {name}
              <span className="font-mono text-muted-foreground tabular-nums">
                {report[name].profile.record_count.toLocaleString()}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Find a field, e.g. pricing, quantization"
          aria-label="Find a field"
          className="sm:max-w-80"
        />
        <ToggleGroup
          multiple={false}
          value={[sort]}
          onValueChange={(value: string[]) => {
            const next = Object.keys(SORTS).find((key): key is Sort => key === value[0])
            if (next !== undefined) {
              setSort(next)
            }
          }}
          size="sm"
          variant="outline"
          aria-label="Sort fields"
        >
          {Object.entries(SORTS).map(([key, label]) => (
            <ToggleGroupItem key={key} value={key}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="ml-auto font-mono text-[0.625rem] text-muted-foreground tabular-nums">
          {population.profile.record_count.toLocaleString()} entities · {rows.length} of{' '}
          {all.length} fields
        </span>
      </div>

      <div className="rounded-lg border">
        <div
          className={`${COLUMNS} sticky top-0 z-10 rounded-t-lg border-b bg-background py-1.5 text-[0.625rem] tracking-wide text-muted-foreground uppercase`}
          aria-hidden="true"
        >
          <span>Field path</span>
          <span>Types</span>
          <span className="text-right">Present</span>
          <span className="text-right">Null</span>
          <span className="text-right">Distinct*</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            No fields match. Clear the search or choose another population.
          </p>
        ) : (
          rows.map((row) => (
            <FieldRow
              key={`${populationName}:${row.value.path}`}
              row={row}
              population={population}
            />
          ))
        )}
      </div>

      <div className="flex flex-col gap-1 text-[0.625rem] text-muted-foreground">
        <p>
          Presence and null percentages use the containing object population. Array-item rows count
          occurrences, including repeated items. *Distinct counts include primitive values only.
        </p>
        <p>
          Numeric summaries describe observed field values, not combined request performance.
          Numeric strings retain their source representation. Examples show up to three distinct
          primitive values with their entity identities. This report describes one scan; capture
          time dates the observation.
        </p>
      </div>
    </section>
  )
}

function FieldRow({ row, population }: { row: ProfileRow; population: Population }) {
  const [open, setOpen] = useState(false)
  const { missing, value } = row
  const nulls = value.types.find((branch) => branch.type === 'null')?.count ?? 0
  const path = readablePath(value.path)

  return (
    <details
      className="border-b last:border-b-0"
      onToggle={(event) => {
        setOpen(event.currentTarget.open)
      }}
    >
      <summary className={`${COLUMNS} cursor-pointer py-1.5 text-xs hover:bg-muted/40`}>
        <code className="truncate font-mono" title={value.path}>
          <span className="text-muted-foreground">{path.parent}</span>
          {path.leaf}
        </code>
        <span className="truncate text-muted-foreground">
          {value.types.map((branch) => branch.type).join(' · ')}
        </span>
        <span
          className="text-right font-mono tabular-nums"
          title={`${value.population - missing} of ${value.population} locations`}
        >
          {percentage(value.population - missing, value.population)}
        </span>
        <span className="text-right font-mono tabular-nums">
          {percentage(nulls, value.population)}
        </span>
        <span className="text-right font-mono tabular-nums">
          {distinctValues(value).toLocaleString()}
        </span>
      </summary>
      {open && (
        <FieldDetail missing={missing} nulls={nulls} value={value} population={population} />
      )}
    </details>
  )
}
