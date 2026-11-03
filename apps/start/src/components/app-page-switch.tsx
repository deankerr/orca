import { Tooltip, TooltipContent, TooltipTrigger } from '@orca/ui/components/tooltip'
import { cn } from 'cn'
import { Activity, Code, Layers } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const pages: { active: boolean; icon: LucideIcon; label: string }[] = [
  { active: true, icon: Layers, label: 'Endpoints' },
  { active: false, icon: Activity, label: 'Monitor' },
  { active: false, icon: Code, label: 'API' },
]

/** Segmented control that switches between the app's pages. Only Endpoints exists so far. */
export function AppPageSwitch() {
  return (
    <nav
      aria-label="App pages"
      className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5"
    >
      {pages.map(({ active, icon: Icon, label }) => (
        <Tooltip key={label}>
          <TooltipTrigger
            render={
              <button
                aria-current={active ? 'page' : undefined}
                aria-disabled={active ? undefined : true}
                aria-label={label}
                className={cn(
                  'flex h-6 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  active
                    ? 'bg-muted text-foreground'
                    : 'hover:bg-muted-hover hover:text-foreground',
                )}
                type="button"
              />
            }
          >
            <Icon aria-hidden="true" className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </nav>
  )
}
