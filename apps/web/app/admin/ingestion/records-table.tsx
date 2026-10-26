'use client'

import { api } from '@orca/backend/api'
import { useMutation, usePaginatedQuery } from 'convex/react'
import { useState } from 'react'
import * as R from 'remeda'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { count, scanTime, STATE_COLORS, STATES } from './format'
import type { State } from './format'

const PAGE = 50

/** Records newest first; jump to a time instead of scrolling through history. */
export function RecordsTable({ failed }: { failed: number }) {
  const [state, setState] = useState<State | undefined>(undefined)
  const [jump, setJump] = useState('')
  const [before, setBefore] = useState<string | undefined>(undefined)
  const [retrying, setRetrying] = useState<string | null>(null)
  const retry = useMutation(api.ingestion.admin.retry)

  const { results, status, loadMore } = usePaginatedQuery(
    api.ingestion.admin.records,
    R.pickBy({ before, state }, R.isDefined),
    { initialNumItems: PAGE },
  )

  /** Retry-all reopens one bounded batch per call; repeat until nothing is left. */
  const retryAll = async () => {
    let reopened = 0

    for (;;) {
      setRetrying(`Reopened ${count.format(reopened)}…`)
      const batch = await retry({})

      if (batch === 0) {
        break
      }

      reopened += batch
    }

    setRetrying(`Reopened ${count.format(reopened)}`)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          multiple={false}
          value={[state ?? 'all']}
          onValueChange={(value: string[]) => {
            const [next] = value
            setState(STATES.find((item) => item === next))
          }}
          size="sm"
          variant="outline"
          aria-label="Record state"
        >
          <ToggleGroupItem value="all">all</ToggleGroupItem>
          {STATES.map((item) => (
            <ToggleGroupItem key={item} value={item}>
              {item}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            const parsed = Date.parse(jump.trim())
            setBefore(Number.isNaN(parsed) ? undefined : new Date(parsed + 1).toISOString())
          }}
        >
          <Input
            className="h-6 w-44 font-mono text-xs"
            placeholder="At or before…"
            value={jump}
            onChange={(event) => {
              setJump(event.target.value)
            }}
          />
          <Button size="sm" variant="outline" type="submit">
            Jump
          </Button>
          {before !== undefined && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setJump('')
                setBefore(undefined)
              }}
            >
              Newest
            </Button>
          )}
        </form>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {retrying}
          <Button
            size="sm"
            variant="destructive"
            disabled={failed === 0}
            onClick={() => {
              void retryAll()
            }}
          >
            Retry all failed ({count.format(failed)})
          </Button>
        </span>
      </div>
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>Scan</TableHead>
            <TableHead>From</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Alerts</TableHead>
            <TableHead>Error</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((record) => (
            <TableRow key={record._id}>
              <TableCell className="font-mono">{scanTime(record.scan_at)}</TableCell>
              <TableCell className="font-mono text-muted-foreground">
                {scanTime(record.from_scan_at)}
              </TableCell>
              <TableCell>{record.kind}</TableCell>
              <TableCell>
                <span className="font-mono" style={{ color: STATE_COLORS[record.state] }}>
                  {record.state}
                </span>
              </TableCell>
              <TableCell className="font-mono text-muted-foreground">
                {record.current_scope ?? '—'}
                {record.current_stats === true && ' + stats'}
              </TableCell>
              <TableCell>{record.alerts ? '✓' : ''}</TableCell>
              <TableCell
                className="max-w-96 truncate font-mono text-muted-foreground"
                title={record.error ?? undefined}
              >
                {record.error}
              </TableCell>
              <TableCell className="text-right">
                {record.state === 'failed' && (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      void retry({ record_id: record._id })
                    }}
                  >
                    Retry
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex justify-center">
        {status === 'CanLoadMore' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              loadMore(PAGE)
            }}
          >
            Older
          </Button>
        )}
        {status === 'Exhausted' && results.length === 0 && (
          <span className="text-xs text-muted-foreground">No records</span>
        )}
      </div>
    </div>
  )
}
