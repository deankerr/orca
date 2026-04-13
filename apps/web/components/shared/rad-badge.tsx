import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'

import { cn } from '@/lib/utils'

type RadBadgeVariant = 'solid' | 'soft' | 'surface' | 'outline'
type RadBadgeColor =
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'emerald'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'fuchsia'
  | 'pink'
  | 'rose'
  | 'gray'
  | 'slate'
  | 'zinc'
  | 'neutral'
  | 'stone'

interface RadBadgeVariantProps {
  variant?: RadBadgeVariant
  color?: RadBadgeColor
}

const baseBadgeClass =
  'inline-flex items-center justify-center rounded-full aria-disabled:opacity-20 aria-disabled:saturate-20 shrink-0 [&>svg]:pointer-events-none overflow-hidden'

const variantBaseClass: Record<RadBadgeVariant, string> = {
  solid: '',
  soft: '',
  surface: 'border',
  outline: 'border',
}

const colorVariantClass: Record<RadBadgeColor, Record<RadBadgeVariant, string>> = {
  red: {
    solid: 'bg-red-600 text-white',
    soft: 'bg-red-950 text-red-400',
    surface: 'bg-red-950/30 text-red-400 border-red-400/30',
    outline: 'text-red-400 border-red-400',
  },
  orange: {
    solid: 'bg-orange-600 text-white',
    soft: 'bg-orange-950 text-orange-400',
    surface: 'bg-orange-950/30 text-orange-400 border-orange-400/30',
    outline: 'text-orange-400 border-orange-400',
  },
  amber: {
    solid: 'bg-amber-600 text-white',
    soft: 'bg-amber-950 text-amber-400',
    surface: 'bg-amber-950/30 text-amber-400 border-amber-400/30',
    outline: 'text-amber-400 border-amber-400',
  },
  yellow: {
    solid: 'bg-yellow-600 text-white',
    soft: 'bg-yellow-950 text-yellow-400',
    surface: 'bg-yellow-950/30 text-yellow-400 border-yellow-400/30',
    outline: 'text-yellow-400 border-yellow-400',
  },
  lime: {
    solid: 'bg-lime-600 text-white',
    soft: 'bg-lime-950 text-lime-400',
    surface: 'bg-lime-950/30 text-lime-400 border-lime-400/30',
    outline: 'text-lime-400 border-lime-400',
  },
  green: {
    solid: 'bg-green-600 text-white',
    soft: 'bg-green-950 text-green-400',
    surface: 'bg-green-950/30 text-green-400 border-green-400/30',
    outline: 'text-green-400 border-green-400',
  },
  emerald: {
    solid: 'bg-emerald-600 text-white',
    soft: 'bg-emerald-950 text-emerald-400',
    surface: 'bg-emerald-950/30 text-emerald-400 border-emerald-400/30',
    outline: 'text-emerald-400 border-emerald-400',
  },
  teal: {
    solid: 'bg-teal-600 text-white',
    soft: 'bg-teal-950 text-teal-400',
    surface: 'bg-teal-950/30 text-teal-400 border-teal-400/30',
    outline: 'text-teal-400 border-teal-400',
  },
  cyan: {
    solid: 'bg-cyan-600 text-white',
    soft: 'bg-cyan-950 text-cyan-400',
    surface: 'bg-cyan-950/30 text-cyan-400 border-cyan-400/30',
    outline: 'text-cyan-400 border-cyan-400',
  },
  sky: {
    solid: 'bg-sky-600 text-white',
    soft: 'bg-sky-950 text-sky-400',
    surface: 'bg-sky-950/30 text-sky-400 border-sky-400/30',
    outline: 'text-sky-400 border-sky-400',
  },
  blue: {
    solid: 'bg-blue-600 text-white',
    soft: 'bg-blue-950 text-blue-400',
    surface: 'bg-blue-950/30 text-blue-400 border-blue-400/30',
    outline: 'text-blue-400 border-blue-400',
  },
  indigo: {
    solid: 'bg-indigo-600 text-white',
    soft: 'bg-indigo-950 text-indigo-400',
    surface: 'bg-indigo-950/30 text-indigo-400 border-indigo-400/30',
    outline: 'text-indigo-400 border-indigo-400',
  },
  violet: {
    solid: 'bg-violet-600 text-white',
    soft: 'bg-violet-950 text-violet-400',
    surface: 'bg-violet-950/30 text-violet-400 border-violet-400/30',
    outline: 'text-violet-400 border-violet-400',
  },
  purple: {
    solid: 'bg-purple-600 text-white',
    soft: 'bg-purple-950 text-purple-400',
    surface: 'bg-purple-950/30 text-purple-400 border-purple-400/30',
    outline: 'text-purple-400 border-purple-400',
  },
  fuchsia: {
    solid: 'bg-fuchsia-600 text-white',
    soft: 'bg-fuchsia-950 text-fuchsia-400',
    surface: 'bg-fuchsia-950/30 text-fuchsia-400 border-fuchsia-400/30',
    outline: 'text-fuchsia-400 border-fuchsia-400',
  },
  pink: {
    solid: 'bg-pink-600 text-white',
    soft: 'bg-pink-950 text-pink-400',
    surface: 'bg-pink-950/30 text-pink-400 border-pink-400/30',
    outline: 'text-pink-400 border-pink-400',
  },
  rose: {
    solid: 'bg-rose-600 text-white',
    soft: 'bg-rose-950 text-rose-400',
    surface: 'bg-rose-950/30 text-rose-400 border-rose-400/30',
    outline: 'text-rose-400 border-rose-400',
  },
  gray: {
    solid: 'bg-gray-600 text-white',
    soft: 'bg-gray-800 text-gray-300',
    surface: 'bg-gray-900/50 text-gray-400 border-gray-700',
    outline: 'text-gray-400 border-gray-600',
  },
  slate: {
    solid: 'bg-slate-600 text-white',
    soft: 'bg-slate-800 text-slate-300',
    surface: 'bg-slate-900/50 text-slate-400 border-slate-700',
    outline: 'text-slate-400 border-slate-600',
  },
  zinc: {
    solid: 'bg-zinc-600 text-white',
    soft: 'bg-zinc-800 text-zinc-300',
    surface: 'bg-zinc-900/50 text-zinc-400 border-zinc-700',
    outline: 'text-zinc-400 border-zinc-600',
  },
  neutral: {
    solid: 'bg-neutral-600 text-white',
    soft: 'bg-neutral-800 text-neutral-300',
    surface: 'bg-neutral-900/50 text-neutral-400 border-neutral-700',
    outline: 'text-neutral-400 border-neutral-600',
  },
  stone: {
    solid: 'bg-stone-600 text-white',
    soft: 'bg-stone-800 text-stone-300',
    surface: 'bg-stone-900/50 text-stone-400 border-stone-700',
    outline: 'text-stone-400 border-stone-600',
  },
}

function radBadgeVariants({ variant = 'soft', color = 'neutral' }: RadBadgeVariantProps = {}) {
  return cn(baseBadgeClass, variantBaseClass[variant], colorVariantClass[color][variant])
}

function RadBadge({
  className,
  variant,
  color,
  asChild = false,
  ...props
}: Omit<React.ComponentProps<'span'>, 'color'> &
  RadBadgeVariantProps & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="rad-badge"
      className={cn(
        "gap-1 px-2 py-0.5 text-xs [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        radBadgeVariants({ variant, color }),
        className,
      )}
      {...props}
    />
  )
}

export { RadBadge, radBadgeVariants }
export type { RadBadgeColor, RadBadgeVariant, RadBadgeVariantProps }
