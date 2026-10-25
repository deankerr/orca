'use client'

import { api } from '@orca/backend/api'
import { useMutation } from 'convex/react'
import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Target = { start_at: string; end_at: string } | null

/** Save target and Run sync stay separate: saving never starts work. */
export function TargetForm({ target }: { target: Target }) {
  const saveTarget = useMutation(api.ingestion.admin.saveTarget)
  const runSync = useMutation(api.ingestion.admin.runSync)
  const [start, setStart] = useState(target?.start_at ?? '')
  const [end, setEnd] = useState(target?.end_at ?? '')
  const [status, setStatus] = useState<string | null>(null)
  const startId = useId()
  const endId = useId()

  const attempt = async (label: string, run: () => Promise<unknown>) => {
    setStatus(`${label}…`)

    try {
      await run()
      setStatus(`${label}: done`)
    } catch (error) {
      setStatus(`${label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={startId} className="text-xs text-muted-foreground">
          Start
        </label>
        <Input
          id={startId}
          className="h-7 w-52 font-mono text-xs"
          value={start}
          onChange={(event) => {
            setStart(event.target.value)
          }}
        />
        <label htmlFor={endId} className="text-xs text-muted-foreground">
          End
        </label>
        <Input
          id={endId}
          className="h-7 w-52 font-mono text-xs"
          value={end}
          onChange={(event) => {
            setEnd(event.target.value)
          }}
        />
        <Button
          variant="outline"
          onClick={() => {
            void attempt(
              'Save target',
              async () => await saveTarget({ end_at: end.trim(), start_at: start.trim() }),
            )
          }}
        >
          Save target
        </Button>
        <Button
          onClick={() => {
            void attempt('Run sync', async () => await runSync({}))
          }}
        >
          Run sync
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Inclusive UTC bounds; ISO dates mean midnight. The range widens but never shrinks; moving
        the start back moves the baseline. Saving does not start work.
        {status !== null && <span className="ml-2 text-foreground">{status}</span>}
      </p>
    </div>
  )
}
