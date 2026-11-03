import { useSelector } from '@tanstack/react-store'
import { createAtom } from '@tanstack/store'

/** The endpoint under the pointer in the table or plot; transient, so it stays out of the URL. */
const hoveredEndpoint = createAtom<string | null>(null)

export function setHoveredEndpoint(id: string | null) {
  hoveredEndpoint.set(id)
}

export function useHoveredEndpointId(): string | null {
  return useSelector(hoveredEndpoint)
}
