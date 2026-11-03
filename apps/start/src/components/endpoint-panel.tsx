import { Tabs, TabsContent, TabsList, TabsTrigger } from '@orca/ui/components/tabs'
import type { ReactNode } from 'react'

const tabs = ['Endpoint', 'Model', 'Provider', 'History']
const placeholderTabs = tabs.filter((tab) => tab !== 'Endpoint')

function Section({ children, note, title }: { children: ReactNode; note?: string; title: string }) {
  return (
    <section className="flex flex-col gap-[3px] border-b border-border px-4 py-2.5">
      <div className="flex h-[18px] shrink-0 justify-between font-mono text-[10px] leading-3.5 text-muted-foreground">
        <h2 className="font-normal tracking-[0.08em] uppercase">{title}</h2>
        {note === undefined ? null : <span>{note}</span>}
      </div>
      {children}
    </section>
  )
}

function FactRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between text-[13px]/[18px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="h-2 w-10 rounded-sm bg-muted" />
    </div>
  )
}

export function EndpointPanel() {
  return (
    <aside
      aria-label="Endpoint"
      className="flex w-85 shrink-0 flex-col overflow-clip rounded-xl border border-border bg-popover"
    >
      <Tabs className="min-h-0 grow gap-0" defaultValue="Endpoint">
        <header className="flex shrink-0 flex-col gap-2.5 border-b border-border px-4 pt-3">
          <div className="flex justify-between font-mono text-[10px] leading-3.5 text-muted-foreground">
            <span className="tracking-[0.08em]">ENDPOINT 11 OF 103</span>
            <span>↑↓ move · esc close</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="size-8 shrink-0 rounded-md bg-muted" />
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1.5">
                <span className="text-base/5 font-semibold tracking-[-0.01em]">Google Vertex</span>
                <span className="font-mono text-[11px] leading-[18px] text-muted-foreground">
                  global
                </span>
              </div>
              <span className="text-xs/4 text-muted-foreground">Claude Haiku 5.5</span>
            </div>
          </div>
          <TabsList className="h-auto gap-4 p-0" variant="line">
            {tabs.map((tab) => (
              <TabsTrigger
                className="h-auto flex-none rounded-none px-0 pt-0 pb-2 text-[13px] leading-4 after:bottom-0"
                key={tab}
                value={tab}
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </header>
        <TabsContent className="min-h-0 flex-none grow basis-0 overflow-y-auto" value="Endpoint">
          <Section note="$/M tokens" title="Pricing">
            {['Input', 'Output', 'Cache read', 'Cache write'].map((label) => (
              <FactRow key={label} label={label} />
            ))}
          </Section>
          <Section note="p50 · 30 min" title="Speed">
            {['Tokens/sec', 'Latency'].map((label) => (
              <FactRow key={label} label={label} />
            ))}
          </Section>
          <Section title="Data policy">
            {['ZDR', 'Prompt retention', 'User ID'].map((label) => (
              <FactRow key={label} label={label} />
            ))}
          </Section>
        </TabsContent>
        {placeholderTabs.map((tab) => (
          <TabsContent
            className="min-h-0 flex-none grow basis-0 overflow-y-auto"
            key={tab}
            value={tab}
          >
            <Section title={tab}>
              <FactRow label="Placeholder" />
            </Section>
          </TabsContent>
        ))}
      </Tabs>
    </aside>
  )
}
