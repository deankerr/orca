import { cn } from 'cn'

import { ScopeBar } from '#components/scope-bar'
import { StatusBar } from '#components/status-bar'

const columns = [
  { className: 'w-[186px]', label: 'Model' },
  { className: 'grow basis-0', label: 'Provider' },
  { className: 'w-[58px] text-right', label: 'Input ↑' },
  { className: 'w-[58px] text-right', label: 'Output' },
  { className: 'w-16 text-right', label: 'Cache R' },
  { className: 'w-14 text-right', label: 'Tok/s' },
  { className: 'w-[66px] text-right', label: 'Latency' },
  { className: 'w-[66px] text-right', label: 'Context' },
]

const rows = Array.from({ length: 24 }, (_, index) => index + 1)
const selectedRow = 11

function PlotPlaceholder() {
  return (
    <div className="flex shrink-0 flex-col gap-1 px-5 pb-2.5">
      <div className="flex justify-between font-mono text-[10px] leading-3.5 text-muted-foreground">
        <span className="tracking-[0.04em] uppercase">Blend 3:1 $/M × tok/s p50 · log scales</span>
        <span>↖ cheaper and faster</span>
      </div>
      <div className="grid h-28 grid-cols-4 grid-rows-2 border border-border-solid">
        {Array.from({ length: 8 }, (_, cell) => (
          <div className="border-r border-b border-border-solid last:border-r-0" key={cell} />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[10px] leading-3.5 text-muted-foreground">
        {['$0.01', '$0.10', '$1', '$10', '$100'].map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  )
}

function TableHeaderRow() {
  return (
    <div className="sticky top-0 z-10 flex h-[30px] shrink-0 items-center border-b border-border bg-background px-5 font-mono text-[10px] leading-3.5 tracking-[0.06em] text-muted-foreground uppercase">
      {columns.map(({ className, label }) => (
        <span className={cn('shrink-0', className)} key={label}>
          {label}
        </span>
      ))}
    </div>
  )
}

function TableRowPlaceholder({ selected }: { selected: boolean }) {
  return (
    <div
      data-selected={selected || undefined}
      className={cn(
        'flex h-8 shrink-0 items-center border-b border-border px-5',
        selected && 'bg-selection-surface shadow-[inset_2px_0_0_var(--selection)]',
      )}
    >
      {columns.map(({ className, label }) => (
        <span
          className={cn(
            'flex shrink-0',
            className,
            label !== 'Model' && label !== 'Provider' && 'justify-end',
          )}
          key={label}
        >
          <span
            className={cn(
              'h-2 rounded-sm bg-muted',
              label === 'Model' || label === 'Provider' ? 'w-24' : 'w-8',
            )}
          />
        </span>
      ))}
    </div>
  )
}

export function ResultsPanel() {
  return (
    <section
      aria-label="Results"
      className="flex min-w-0 grow basis-0 flex-col overflow-clip rounded-xl border border-border bg-background"
    >
      <ScopeBar />
      <PlotPlaceholder />
      <section
        aria-label="Results table"
        className="min-h-0 grow overflow-auto"
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Scrollable region must be keyboard focusable.
        tabIndex={0}
      >
        <div className="flex min-w-180 flex-col">
          <TableHeaderRow />
          {rows.map((row) => (
            <TableRowPlaceholder key={row} selected={row === selectedRow} />
          ))}
        </div>
      </section>
      <StatusBar />
    </section>
  )
}
