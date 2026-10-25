'use client'

import { api } from '@orca/backend/api'
import type { ScanReport } from '@orca/backend/scans/analysis'
import { useAction } from 'convex/react'
import { ConvexError } from 'convex/values'
import { useId, useRef, useState } from 'react'

import { PageContainer, PageHeader, PageTitle } from '@/components/app-layout/pages'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { ReportExplorer } from './report-explorer'

type Scope = ScanReport['selection']['scope']

function failure(error: unknown): string {
  if (error instanceof ConvexError) {
    return typeof error.data === 'string' ? error.data : JSON.stringify(error.data)
  }

  return error instanceof Error ? error.message : String(error)
}

export default function ScanAnalysisPage() {
  const analyze = useAction(api.scan_analysis.index.report)
  const [scanAt, setScanAt] = useState('')
  const [scope, setScope] = useState<Scope>('orca')
  const [report, setReport] = useState<ScanReport | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  // Only the newest request may replace the report; earlier selections finish silently.
  const request = useRef(0)
  const scanAtId = useId()

  const run = async () => {
    request.current += 1
    const { current } = request
    setRunning(true)
    setStatus(null)

    try {
      const payload = await analyze({
        scanAt: scanAt.trim() === '' ? undefined : scanAt.trim(),
        scope,
      })

      if (current === request.current) {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: The action serializes its typed ScanReport as JSON because JSONPath keys cannot cross Convex transport.
        setReport(JSON.parse(payload) as ScanReport)
        setStatus(null)
        setRunning(false)
      }
    } catch (error) {
      if (current === request.current) {
        setStatus(failure(error))
        setRunning(false)
      }
    }
  }

  return (
    <PageContainer className="gap-4">
      <PageHeader>
        <PageTitle>Scan analysis</PageTitle>
        <p className="text-xs text-muted-foreground">
          Profile the fields of one stored scan. Analysis reads stored artifacts and persists
          nothing.
        </p>
      </PageHeader>

      <div className="flex flex-col gap-4 sm:px-4">
        <form
          className="flex flex-col gap-2 rounded-lg border p-3"
          onSubmit={(event) => {
            event.preventDefault()
            void run()
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              multiple={false}
              value={[scope]}
              onValueChange={(value: string[]) => {
                const [next] = value

                if (next === 'orca' || next === 'collected') {
                  setScope(next)
                }
              }}
              size="sm"
              variant="outline"
              aria-label="Scope"
            >
              <ToggleGroupItem value="orca">ORCA scope</ToggleGroupItem>
              <ToggleGroupItem value="collected">Collected data</ToggleGroupItem>
            </ToggleGroup>
            <label htmlFor={scanAtId} className="text-xs text-muted-foreground">
              Scan
            </label>
            <Input
              id={scanAtId}
              className="h-6 w-56 font-mono text-xs"
              placeholder="latest"
              value={scanAt}
              onChange={(event) => {
                setScanAt(event.target.value)
              }}
            />
            <Button type="submit" size="sm" disabled={running}>
              {running ? 'Analyzing…' : 'Analyze'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {scope === 'orca'
              ? 'ORCA scope applies the current text-model selection and entity assembly rules.'
              : 'Collected data includes all collected models and retained endpoint fields, including malformed provider information. Providers count once per identity, using the last collected body.'}
            {status !== null && <span className="ml-2 text-foreground">{status}</span>}
          </p>
        </form>

        {report === null ? (
          <p className="text-xs text-muted-foreground">
            {running ? 'Loading and profiling the scan…' : 'Choose a scope and scan, then analyze.'}
          </p>
        ) : (
          <ReportExplorer report={report} />
        )}
      </div>
    </PageContainer>
  )
}
