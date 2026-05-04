import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

const colorIconBadgeColorClasses = {
  red: 'bg-red-950/50 text-red-400 border-red-400/10',
  orange: 'bg-orange-950/50 text-orange-400 border-orange-400/10',
  amber: 'bg-amber-950/50 text-amber-400 border-amber-400/10',
  yellow: 'bg-yellow-950/50 text-yellow-400 border-yellow-400/10',
  lime: 'bg-lime-950/50 text-lime-400 border-lime-400/10',
  green: 'bg-green-950/50 text-green-400 border-green-400/10',
  emerald: 'bg-emerald-950/50 text-emerald-400 border-emerald-400/10',
  teal: 'bg-teal-950/50 text-teal-400 border-teal-400/10',
  cyan: 'bg-cyan-950/50 text-cyan-400 border-cyan-400/10',
  sky: 'bg-sky-950/50 text-sky-400 border-sky-400/10',
  blue: 'bg-blue-950/50 text-blue-400 border-blue-400/10',
  indigo: 'bg-indigo-950/50 text-indigo-400 border-indigo-400/10',
  violet: 'bg-violet-950/50 text-violet-400 border-violet-400/10',
  purple: 'bg-purple-950/50 text-purple-400 border-purple-400/10',
  fuchsia: 'bg-fuchsia-950/50 text-fuchsia-400 border-fuchsia-400/10',
  pink: 'bg-pink-950/40 text-pink-400 border-pink-400/10',
  rose: 'bg-rose-950/40 text-rose-400 border-rose-400/10',
  gray: 'bg-gray-900/40 text-gray-400 border-gray-400/10',

  slate: 'bg-slate-900/50 text-slate-400 border-slate-400/10',
  zinc: 'bg-zinc-900/50 text-zinc-400 border-zinc-400/10',
  neutral: 'bg-neutral-900/50 text-neutral-400 border-neutral-400/10',
  stone: 'bg-stone-900/50 text-stone-400 border-stone-400/10',
} as const

export type ColorIconBadgeColor = keyof typeof colorIconBadgeColorClasses

interface ColorIconBadgeProps extends Omit<React.ComponentProps<'div'>, 'color'> {
  icon: LucideIcon
  color: ColorIconBadgeColor
}

export function ColorIconBadge({ icon: Icon, color, className, ...props }: ColorIconBadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-sm border p-0.5 [&>svg]:pointer-events-none',
        colorIconBadgeColorClasses[color],
        className,
      )}
      {...props}
    >
      <Icon aria-hidden className="size-full" strokeWidth={2} />
    </div>
  )
}
