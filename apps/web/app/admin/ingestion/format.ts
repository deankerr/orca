/** Compact UTC scan time: `2026-10-21 15:40`. */
export function scanTime(value: string | null): string {
  return value === null ? '—' : `${value.slice(0, 10)} ${value.slice(11, 16)}`
}

export const STATES = ['complete', 'queued', 'pending', 'failed', 'withdrawing'] as const

export type State = (typeof STATES)[number]

/** One colour per record state, shared by totals, histogram and table. */
export const STATE_COLORS: Record<State, string> = {
  complete: 'var(--color-emerald-500)',
  failed: 'var(--color-red-500)',
  pending: 'var(--color-zinc-400)',
  queued: 'var(--color-sky-500)',
  withdrawing: 'var(--color-amber-500)',
}

export const count = new Intl.NumberFormat('en-US')
