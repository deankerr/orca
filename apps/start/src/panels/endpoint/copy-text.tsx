import { Tooltip, TooltipContent, TooltipTrigger } from '@orca/ui/components/tooltip'
import { cn } from 'cn'
import { CheckIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/** How long the "Copied" feedback stays before the control returns to its resting state. */
const FEEDBACK_MS = 1500

type Outcome = 'copied' | 'failed' | null

/**
 * A model, provider, or endpoint ID that copies itself to the clipboard when pressed. The control
 * is named by `label` (`Copy model ID`), its tooltip and a check icon confirm the copy, and a
 * polite live region says so to a screen reader. Clipboard access can be refused (an insecure
 * context, a denied permission), and the tooltip then says so instead.
 */
export function CopyText({
  children,
  className,
  label,
  text,
}: {
  /** The displayed text. It leads the accessible name, so voice control can target it by what it reads. */
  children: string
  className?: string
  /** The action, as `Copy model ID`: it reads in the tooltip until the copy and follows the text in the accessible name. */
  label: string
  /** What goes on the clipboard, which can be more than the displayed `children`. */
  text: string
}) {
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [],
  )

  const copy = async () => {
    let next: Outcome = 'copied'

    try {
      await navigator.clipboard.writeText(text)
    } catch {
      next = 'failed'
    }

    setOutcome(next)
    setOpen(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setOutcome(null)
    }, FEEDBACK_MS)
  }

  const message = { copied: 'Copied', failed: 'Could not copy' }

  return (
    <>
      <Tooltip onOpenChange={setOpen} open={open}>
        <TooltipTrigger
          render={
            <button
              aria-label={`${children}, ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
              className={cn(
                'group/copy relative inline-flex max-w-full items-center rounded-sm text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
                className,
              )}
              onClick={() => {
                void copy()
              }}
              type="button"
            />
          }
        >
          <span className="min-w-0 wrap-anywhere decoration-border-solid decoration-dotted underline-offset-2 group-hover/copy:underline">
            {children}
          </span>
          {/* Out of flow, so the resting text lines up with its neighbours; the check sits past its end. */}
          {outcome === 'copied' ? (
            <CheckIcon
              aria-hidden
              className="absolute top-1/2 left-full ml-1 size-3 -translate-y-1/2 text-positive-soft-foreground"
            />
          ) : null}
        </TooltipTrigger>
        <TooltipContent align="end">{outcome === null ? label : message[outcome]}</TooltipContent>
      </Tooltip>
      <output className="sr-only">{outcome === null ? '' : message[outcome]}</output>
    </>
  )
}
