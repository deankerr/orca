'use client'

import { useQuery } from '@tanstack/react-query'

import { ApiCodeViewer } from './api-code-viewer'

const API_PATH = '/api/preview/v2/models'

async function fetchApiData() {
  const response = await fetch(API_PATH)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  const data = await response.json()
  const slicedData = { ...data, models: data.models.slice(0, 20) }
  return JSON.stringify(slicedData, null, 2)
}

export function ApiResponseViewer() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['api', 'preview', 'v2', 'models'],
    queryFn: fetchApiData,
  })

  return <ApiCodeViewer code={data || ''} isLoading={isLoading} error={error} />
}
