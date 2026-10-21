'use client'

import { api } from '@orca/backend/api'
import { useAction, useQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'

import { PageContainer, PageHeader, PageLoading, PageTitle } from '@/components/app-layout/pages'
import { Button } from '@/components/ui/button'

import { count, scanTime, STATE_COLORS, STATES } from './format'
import { Histogram } from './histogram'
import { RecordsTable } from './records-table'
import { TargetForm } from './target-form'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm">{value}</span>
      {note !== undefined && <span className="text-[0.625rem] text-muted-foreground">{note}</span>}
    </div>
  )
}

type SourceRange = { earliest: string | null; latest: string | null }

/** The object store's capture range, fetched on demand because queries cannot list it. */
function useSourceScans() {
  const fetchRange = useAction(api.ingestion.admin.sourceScans)
  const [range, setRange] = useState<SourceRange | undefined>(undefined)
  const refresh = () => {
    setRange(undefined)
    void fetchRange({}).then(setRange)
  }

  useEffect(() => {
    void fetchRange({}).then(setRange)
  }, [fetchRange])
  return { range, refresh }
}

/** Completions per minute over the last few minutes this page has observed. */
const RATE_WINDOW_MS = 5 * 60 * 1000
const SAMPLE_INTERVAL_MS = 10_000

function useCompletionRate(complete: number | undefined) {
  const [samples, setSamples] = useState<{ at: number; complete: number }[]>([])
  const latest = useRef(complete)

  useEffect(() => {
    latest.current = complete
  }, [complete])

  // Sample on a clock rather than per update, so quiet periods still lower the rate.
  useEffect(() => {
    const sample = () => {
      const value = latest.current
      if (value === undefined) {
        return
      }
      const at = Date.now()
      setSamples((previous) => [
        ...previous.filter((item) => item.at >= at - RATE_WINDOW_MS),
        { at, complete: value },
      ])
    }
    const timer = setInterval(sample, SAMPLE_INTERVAL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [])

  const first = samples.at(0)
  const last = samples.at(-1)

  if (first === undefined || last === undefined || last.at - first.at < 30_000) {
    return null
  }
  return ((last.complete - first.complete) * 60_000) / (last.at - first.at)
}

/** Registration lag is only meaningful up to the target end; later scans are out of range. */
function registryNote(
  latest: string | null | undefined,
  registered: string | null,
  end: string | null,
): string | null {
  if (latest === undefined || latest === null || registered === null) {
    return null
  }

  if (end !== null && latest > end) {
    return `Target ends ${scanTime(end)}; later scans are out of range`
  }

  const hours = (Date.parse(latest) - Date.parse(registered)) / 3_600_000
  return hours <= 0 ? 'Registry caught up' : `Registry ${hours.toFixed(1)} h behind`
}

type Range = { start_at: string; end_at: string }

/** An open-ended target (e.g. 2099) ends the view at the latest registered pair instead. */
function histogramRange(
  target: Range | null,
  pairs: { earliest: string | null; latest: string | null },
): Range | null {
  const start_at = target?.start_at ?? pairs.earliest
  if (start_at === null) {
    return null
  }

  const latest = pairs.latest !== null && pairs.latest > start_at ? pairs.latest : start_at
  return { start_at, end_at: target !== null && target.end_at < latest ? target.end_at : latest }
}

export default function IngestionPage() {
  const overview = useQuery(api.ingestion.admin.overview)
  const source = useSourceScans()
  const rate = useCompletionRate(overview?.counts['pair/complete'])

  if (overview === undefined) {
    return <PageLoading />
  }

  const { counts, pairs, target } = overview
  const pairCount = (state: string) => counts[`pair/${state}`] ?? 0
  const registered = STATES.reduce((sum, state) => sum + pairCount(state), 0)
  const unfinished = registered - pairCount('complete')
  const range = histogramRange(target, pairs)
  const sourceNote = registryNote(source.range?.latest, pairs.latest, target?.end_at ?? null)
  const eta = rate === null || rate <= 0 || unfinished === 0 ? null : unfinished / rate

  return (
    <PageContainer className="gap-4">
      <PageHeader>
        <PageTitle>Ingestion</PageTitle>
        <p className="text-xs text-muted-foreground">
          Clock {scanTime(overview.clock)} · cron {overview.automation.cron ? 'on' : 'off'} ·
          Discord auto-send {overview.automation.discord ? 'on' : 'off'} · parallelism{' '}
          {overview.execution.parallelism}, capacity {overview.execution.capacity}
        </p>
      </PageHeader>

      <Section title="Target">
        <TargetForm key={`${target?.start_at}:${target?.end_at}`} target={target} />
      </Section>

      <Section title="Progress">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {STATES.map((state) => (
            <div key={state} className="flex flex-col">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="size-2 rounded-xs" style={{ background: STATE_COLORS[state] }} />
                {state}
              </span>
              <span className="font-mono text-lg">{count.format(pairCount(state))}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact
            label="History coverage"
            value={
              registered === 0 ? '—' : `${((pairCount('complete') / registered) * 100).toFixed(1)}%`
            }
            note={`${count.format(unfinished)} of ${count.format(registered)} pairs unfinished`}
          />
          <Fact
            label="Completion rate"
            value={rate === null ? 'measuring…' : `${rate.toFixed(0)} pairs/min`}
            note={
              eta === null
                ? 'Observed by this page over the last 5 minutes'
                : `≈ ${eta < 90 ? `${eta.toFixed(0)} min` : `${(eta / 60).toFixed(1)} h`} for ${count.format(unfinished)} unfinished`
            }
          />
          <Fact
            label="Registered pairs"
            value={`${scanTime(pairs.earliest)} → ${scanTime(pairs.latest)}`}
          />
          <Fact
            label="Queue frontier"
            value={scanTime(overview.frontier)}
            note="Newest pending pair; the queue works newest first"
          />
          <Fact
            label="Current view"
            value={scanTime(overview.latestCompleteFull)}
            note="Latest complete full pair"
          />
          <Fact
            label="Baseline"
            value={
              overview.baselines.length === 0
                ? '—'
                : overview.baselines
                    .map(({ scan_at, state }) => `${scanTime(scan_at)} ${state}`)
                    .join(', ')
            }
            note="Installed once no pair is pending or queued"
          />
          <div className="flex flex-col">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              Source scans
              <Button size="xs" variant="ghost" onClick={source.refresh}>
                Refresh
              </Button>
            </span>
            <span className="font-mono text-sm">
              {source.range === undefined
                ? '…'
                : `${scanTime(source.range.earliest)} → ${scanTime(source.range.latest)}`}
            </span>
            {sourceNote !== null && (
              <span className="text-[0.625rem] text-muted-foreground">{sourceNote}</span>
            )}
          </div>
        </div>
        {range !== null && <Histogram range={range} />}
      </Section>

      <Section title="Records">
        <RecordsTable failed={pairCount('failed') + (counts['baseline/failed'] ?? 0)} />
      </Section>
    </PageContainer>
  )
}
