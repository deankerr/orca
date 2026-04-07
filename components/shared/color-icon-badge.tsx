import { cn } from '@/lib/utils'

const colorIconBadgeColorClasses = {
  red: 'bg-red-950/30 text-red-400 border-red-400/30',
  orange: 'bg-orange-950/30 text-orange-400 border-orange-400/30',
  amber: 'bg-amber-950/30 text-amber-400 border-amber-400/30',
  yellow: 'bg-yellow-950/30 text-yellow-400 border-yellow-400/30',
  lime: 'bg-lime-950/30 text-lime-400 border-lime-400/30',
  green: 'bg-green-950/30 text-green-400 border-green-400/30',
  emerald: 'bg-emerald-950/30 text-emerald-400 border-emerald-400/30',
  teal: 'bg-teal-950/30 text-teal-400 border-teal-400/30',
  cyan: 'bg-cyan-950/30 text-cyan-400 border-cyan-400/30',
  sky: 'bg-sky-950/30 text-sky-400 border-sky-400/30',
  blue: 'bg-blue-950/30 text-blue-400 border-blue-400/30',
  indigo: 'bg-indigo-950/30 text-indigo-400 border-indigo-400/30',
  violet: 'bg-violet-950/30 text-violet-400 border-violet-400/30',
  purple: 'bg-purple-950/30 text-purple-400 border-purple-400/30',
  fuchsia: 'bg-fuchsia-950/30 text-fuchsia-400 border-fuchsia-400/30',
  pink: 'bg-pink-950/30 text-pink-400 border-pink-400/30',
  rose: 'bg-rose-950/30 text-rose-400 border-rose-400/30',
  gray: 'bg-gray-900/50 text-gray-400 border-gray-700',
  slate: 'bg-slate-900/50 text-slate-400 border-slate-700',
  zinc: 'bg-zinc-900/50 text-zinc-400 border-zinc-700',
  neutral: 'bg-neutral-900/50 text-neutral-400 border-neutral-700',
  stone: 'bg-stone-900/50 text-stone-400 border-stone-700',
} as const

export type ColorIconBadgeColor = keyof typeof colorIconBadgeColorClasses

interface ColorIconBadgeProps extends Omit<React.ComponentProps<'div'>, 'color'> {
  icon: React.ComponentType<React.ComponentProps<'svg'>>
  color: ColorIconBadgeColor
}

export function ColorIconBadge({ icon: Icon, color, className, ...props }: ColorIconBadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border px-1 py-1 [&>svg]:pointer-events-none',
        colorIconBadgeColorClasses[color],
        className,
      )}
      {...props}
    >
      <Icon aria-hidden className="size-full" />
    </div>
  )
}
