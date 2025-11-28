import { useRouter } from 'next/navigation'

import { useEntitySheet } from './entity-sheet'

export function useFindAllEndpoints() {
  const router = useRouter()
  const { close } = useEntitySheet()

  return (query: string) => {
    router.push(`/?q=${query}`)
    close()
  }
}
