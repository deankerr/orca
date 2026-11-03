import { createFileRoute } from '@tanstack/react-router'

import { EndpointPanel } from '#components/endpoint-panel'
import { FiltersPanel } from '#components/filters-panel'
import { ResultsPanel } from '#components/results-panel'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main className="flex h-svh gap-2 bg-background p-2">
      <FiltersPanel />
      <ResultsPanel />
      <EndpointPanel />
    </main>
  )
}
