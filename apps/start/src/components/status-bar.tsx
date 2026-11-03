export function StatusBar() {
  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border px-5 font-mono text-[11px] leading-4 text-muted-foreground">
      <span>Prices $/M tokens · tok/s and latency p50 over 30 min</span>
      <span>scan 2026-10-27 23:40 UTC</span>
    </footer>
  )
}
