'use client'

import { CheckIcon, SparklesIcon, XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

import type { FilterMode } from './use-endpoint-filters'

function FilterMenu({ ...props }: React.ComponentProps<typeof Popover>) {
  return <Popover {...props} />
}

function FilterMenuTrigger({
  icon: Icon,
  label,
  activeCount,
}: {
  icon: React.ComponentType<React.ComponentProps<'svg'>>
  label: string
  activeCount: number
}) {
  return (
    <PopoverTrigger
      render={
        <Button variant="outline">
          <Icon data-icon="inline-start" />
          {label}
          {activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}
        </Button>
      }
    />
  )
}

function FilterMenuContent({
  className,
  align = 'start',
  ...props
}: React.ComponentProps<typeof PopoverContent>) {
  return (
    <PopoverContent
      className={cn('gap-0 overflow-hidden border p-0 ring-0', className)}
      align={align}
      {...props}
    />
  )
}

function FilterMenuBody({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('max-h-[min(72vh,34rem)] overflow-y-auto', className)} {...props}>
      <div className={cn('flex flex-col gap-3 p-3')}>{children}</div>
    </div>
  )
}

function FilterMenuHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<React.ComponentProps<'svg'>>
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="border-b px-3 py-3">
      <div className="flex items-start gap-2">
        <Icon className="size-8 shrink-0 rounded-md border p-1.75 shadow-sm" />

        <div className="flex min-w-0 flex-1 flex-col">
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{description}</PopoverDescription>
        </div>

        <div className="shrink-0">{action}</div>
      </div>
    </div>
  )
}

function FilterMenuSection({
  title,
  description,
  className,
  children,
  ...props
}: {
  title: string
  description?: string
} & React.ComponentProps<'section'>) {
  const hasDescription = description !== undefined && description !== ''

  return (
    <section
      className={cn('flex flex-col gap-2 rounded-lg border p-2 shadow', className)}
      {...props}
    >
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 px-0.5 text-xs font-medium">
          <SparklesIcon className="size-3" />
          {title}
        </div>

        {hasDescription && (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function FilterMenuClearAction({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" size="xs" className={cn('w-14', className)} {...props}>
      <XIcon data-icon="inline-start" />
      {children}
    </Button>
  )
}

function FilterMenuToggleItem({
  icon: Icon,
  label,
  mode,
  onChange,
}: {
  icon: React.ComponentType<React.ComponentProps<'svg'>>
  label: string
  mode: FilterMode
  onChange: (mode: FilterMode) => void
}) {
  const selectedModes = mode === 'any' ? [] : [mode]

  const handleValueChange = (value: string[]) => {
    const [nextMode] = value
    onChange(nextMode === 'include' || nextMode === 'exclude' ? nextMode : 'any')
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-1.5 py-1.5 shadow transition-colors',
      )}
    >
      <Icon aria-hidden className="size-6 shrink-0 rounded-sm border p-1.25 shadow-sm" />
      <span className="flex-1 truncate text-xs">{label}</span>

      <ToggleGroup
        multiple={false}
        value={selectedModes}
        onValueChange={handleValueChange}
        size="sm"
        className="shrink-0 shadow-sm"
        aria-label={`${label} filter mode`}
        variant="outline"
      >
        <ToggleGroupItem value="include" aria-label={`Require ${label}`} title={`Require ${label}`}>
          <CheckIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value="exclude" aria-label={`Exclude ${label}`} title={`Exclude ${label}`}>
          <XIcon />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}

export {
  FilterMenu,
  FilterMenuBody,
  FilterMenuClearAction,
  FilterMenuContent,
  FilterMenuHeader,
  FilterMenuSection,
  FilterMenuToggleItem,
  FilterMenuTrigger,
}
