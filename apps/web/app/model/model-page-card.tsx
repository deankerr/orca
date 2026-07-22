import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

/** Loading shell matching the model page's headerless card style, so the card
    doesn't visually pop when the real content swaps in. */
export function ModelPageCardLoading({ label }: { label: string }) {
  return (
    <Card aria-busy="true" className="bg-card/50">
      <output className="flex min-h-72 items-center justify-center text-muted-foreground">
        <Spinner />
        <span className="sr-only">{label}</span>
      </output>
    </Card>
  )
}
