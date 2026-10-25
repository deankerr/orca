import { describe, expect, it } from 'vitest'

import { addLogLine, emptyReport, totals } from './contention'

const completion = (fields: Record<string, unknown>) =>
  JSON.stringify({
    error: null,
    identifier: 'ingestion/queue:step',
    kind: 'Completion',
    occInfo: null,
    ...fields,
  })

describe('addLogLine', () => {
  it('ignores banners and counts clean executions', () => {
    const report = emptyReport()
    addLogLine(report, 'Watching logs for dev deployment x...')
    addLogLine(report, completion({}))
    expect(report.events).toBe(1)
    expect(totals(report)).toEqual({
      executions: 1,
      occExhausted: 0,
      occRetries: 0,
      otherErrors: 0,
    })
  })

  it('separates retried OCC from exhausted OCC and other errors', () => {
    const report = emptyReport()
    addLogLine(report, completion({ occInfo: { table: 't' }, willRetry: true }))
    addLogLine(
      report,
      completion({
        error: 'Documents read changed while this mutation was being run',
        willRetry: false,
      }),
    )
    addLogLine(report, completion({ error: 'Boom' }))
    expect(totals(report)).toEqual({
      executions: 3,
      occExhausted: 1,
      occRetries: 1,
      otherErrors: 1,
    })
    expect(report.sampleErrors).toHaveLength(2)
  })

  it('counts ingestion log markers', () => {
    const report = emptyReport()
    addLogLine(report, JSON.stringify({ kind: 'Log', message: '[ingestion] request failed' }))
    addLogLine(report, JSON.stringify({ kind: 'Log', message: 'completion lost for record' }))
    expect([report.requestFailed, report.completionLost]).toEqual([1, 1])
  })
})
