import type { Column } from '@tanstack/react-table'
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react'
import type { HTMLAttributes } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DataGridColumnHeaderProps<TData, TValue> extends HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title?: string
  subtitle?: string
}

function SortIcon({ direction }: { direction: false | 'asc' | 'desc' }) {
  const Icon = direction === 'asc' ? ChevronUp : direction === 'desc' ? ChevronDown : ChevronsUpDown

  return <Icon data-icon="inline-end" className="-mr-1 size-3" />
}

function DataGridColumnHeader<TData, TValue>({
  column,
  title = '',
  subtitle = '',
  className,
}: DataGridColumnHeaderProps<TData, TValue>) {
  'use no memo'
  const sortDirection = column.getIsSorted()

  const content = (
    <div className="leading-tight">
      <div>{title}</div>
      {subtitle && <div className="text-muted-foreground">{subtitle}</div>}
    </div>
  )

  if (column.getCanSort()) {
    return (
      <Button
        variant="ghost"
        className={cn('h-full w-full rounded-none', className)}
        onClick={column.getToggleSortingHandler()}
      >
        {content}

        <SortIcon direction={sortDirection} />
      </Button>
    )
  }

  return content
}

export { DataGridColumnHeader, type DataGridColumnHeaderProps }
