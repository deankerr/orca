// PROTOTYPE, throwaway (issue #260).
import { cn } from 'cn'
import { useEffect } from 'react'

import { useProto, useSetProto, VARIANT_KEYS, VARIANTS } from './proto'
import type { Variant } from './proto'

/** What the `alerts` flag shows or hides in each variant, so the bar names the state it flips. */
const SURFACE: Record<Variant, string> = {
  A: 'Alerts mode',
  B: 'Alerts tab',
  C: 'Alerts band',
  D: 'Changed only',
}

function step(current: Variant, by: number): Variant {
  const index = VARIANT_KEYS.indexOf(current)

  return VARIANT_KEYS[(index + by + VARIANT_KEYS.length) % VARIANT_KEYS.length] ?? current
}

/** The floating bar that flips between variants; not part of any design being judged. */
export function PrototypeSwitcher() {
  const { alerts, follow, variant } = useProto()
  const setProto = useSetProto()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { target } = event

      if (
        !(target instanceof HTMLElement) ||
        target.closest('input, textarea, [contenteditable], [role="tab"], [role="slider"]') !==
          null ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return
      }

      if (event.key === 'ArrowLeft') {
        setProto({ variant: step(variant, -1) })
      } else if (event.key === 'ArrowRight') {
        setProto({ variant: step(variant, 1) })
      }
    }

    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
    }
  })

  if (!import.meta.env.DEV) {
    return null
  }

  const flag = (on: boolean, text: string, onClick: () => void) => (
    <button
      aria-pressed={on}
      className={cn(
        'h-6 rounded-full px-2 whitespace-nowrap',
        on ? 'bg-yellow-300 text-black' : 'text-yellow-100/70 ring-1 ring-yellow-100/40',
      )}
      onClick={onClick}
      type="button"
    >
      {text}
    </button>
  )

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-10 z-[1000] flex justify-center px-2">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl bg-black px-2 py-1.5 font-mono text-[11px] text-yellow-300 shadow-xl ring-2 ring-yellow-300">
        <span className="flex items-center gap-1">
          <button
            aria-label="Previous variant"
            className="size-6 rounded-full hover:bg-yellow-300/20"
            onClick={() => {
              setProto({ variant: step(variant, -1) })
            }}
            type="button"
          >
            ←
          </button>
          <span className="whitespace-nowrap">
            {variant} ({VARIANTS[variant]})
          </span>
          <button
            aria-label="Next variant"
            className="size-6 rounded-full hover:bg-yellow-300/20"
            onClick={() => {
              setProto({ variant: step(variant, 1) })
            }}
            type="button"
          >
            →
          </button>
        </span>
        <span className="flex items-center gap-1">
          {flag(alerts, SURFACE[variant], () => {
            setProto({ alerts: !alerts })
          })}
          {flag(follow, 'Follow filters', () => {
            setProto({ follow: !follow })
          })}
        </span>
      </div>
    </div>
  )
}
