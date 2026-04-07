import { useRouter } from 'next/navigation'

import { buildEndpointGridHref } from '@/components/endpoints-data-grid/use-endpoint-query-state'

import { useEntitySheet } from './entity-sheet-context'

export function useFindAllEndpoints() {
  const router = useRouter()
  const { close } = useEntitySheet()

  return (query: string) => {
    router.push(buildEndpointGridHref({ query }))
    close()
  }
}
