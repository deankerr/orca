'use client'

import { useQuery } from '@tanstack/react-query'

import { JsonApiCodeBlock } from './json-api-code-block'

export function ApiPreview({ url }: { url: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: [url],
    queryFn: async ({ queryKey }) => {
      const response = await fetch(queryKey[0])
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      const slicedData = { ...data, models: data.models.slice(0, 20) }
      return JSON.stringify(slicedData, null, 2)
    },
  })

  return <JsonApiCodeBlock code={data || ''} isLoading={isLoading} error={error} />
}
