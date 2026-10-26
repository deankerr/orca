import { useQueryClient } from '@tanstack/react-query'
import { useLayoutEffect, useRef } from 'react'

import { captureTiming } from './capture'
import type { ReadinessMeasurement } from './measurement'
import { queryName, queryProperties, readinessQueryTimings, resultProperties } from './query-timing'

export function useQueryResult(measurement: ReadinessMeasurement, success: boolean) {
  const client = useQueryClient()
  const reported = useRef(false)
  useLayoutEffect(() => {
    if (!success || reported.current) {
      return
    }

    const query = client.getQueryCache().find({ exact: true, queryKey: measurement.queryKey })
    const result = measurement.initial ?? (query && readinessQueryTimings.get(query.queryHash))

    if (!query || !result) {
      return
    }

    reported.current = true
    readinessQueryTimings.markObserved(query.queryHash)

    if (!result.fetchStarted) {
      captureTiming('query completed', {
        ...queryProperties(measurement.queryKey, result),
        ...resultProperties(query.state.data),
        consumer_active: true,
      })
    }

    captureTiming('query consumed', {
      query_name: queryName(measurement.queryKey),
      query_run_id: result.id,
      surface: measurement.surface,
      view_load_id: measurement.id,
      view_started_at_ms: measurement.started.at,
    })
  }, [client, measurement, success])
}
