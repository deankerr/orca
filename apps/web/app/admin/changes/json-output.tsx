'use client'

import type { InspectionResult } from '@orca/backend/convex/scan/inspection'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

export function JsonOutput({ value }: { value: Pick<InspectionResult, 'document' | 'owner'> }) {
  const text = JSON.stringify(value, null, 2)
  const [copyStatus, setCopyStatus] = useState('')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('Copied')
    } catch {
      setCopyStatus('Copy failed. Use Download JSON instead.')
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'scan-comparison.json'
    link.click()

    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 0)
  }

  return (
    <>
      {/* Export actions and copy feedback */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void copy()
          }}
        >
          Copy JSON
        </Button>
        <Button variant="outline" size="sm" onClick={download}>
          Download JSON
        </Button>
        <output className="text-xs text-muted-foreground">{copyStatus}</output>
        {value.document.changes.length === 0 ? (
          <span className="text-xs text-muted-foreground">No changes in this selection.</span>
        ) : null}
      </div>
      {/* Scrollable comparison document */}
      <ScrollArea className="min-h-64 min-w-0 flex-1 overflow-hidden rounded-md border bg-muted/20">
        <pre
          aria-label="Comparison JSON"
          className="w-max min-w-full p-3 font-mono text-xs leading-relaxed"
        >
          {text}
        </pre>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </>
  )
}
