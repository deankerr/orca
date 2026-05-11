import type { Column } from '@tanstack/react-table'
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useDataGrid } from './data-grid'

interface DataGridColumnHeaderProps<TData, TValue> extends HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title?: string
  subtitle?: string
  icon?: ReactNode
}

function getSortIcon(sortDirection: false | 'asc' | 'desc') {
  if (sortDirection === 'desc') {
    return <ChevronDown className="-mr-2 size-[0.7rem]!" />
  }

  if (sortDirection === 'asc') {
    return <ChevronUp className="-mr-2 size-[0.7rem]!" />
  }

  return <ChevronsUpDown className="-mr-2 size-[0.7rem]!" />
}

function DataGridColumnHeader<TData, TValue>({
  column,
  title = '',
  subtitle = '',
  icon,
  className,
}: DataGridColumnHeaderProps<TData, TValue>) {
  'use no memo'
  const { isLoading, recordCount } = useDataGrid()
  const sortDirection = column.getIsSorted()

  const headerLabel = () => (
    <div
      className={cn(
        'inline-flex h-full grow items-center justify-center gap-1.5 font-normal text-accent-foreground [&_svg]:size-3.5 [&_svg]:opacity-60',
        className,
      )}
      data-slot="data-grid-header-label"
    >
      {icon}
      {title}
    </div>
  )

  const headerButton = () => (
    <Button
      variant="ghost"
      className={cn(
        'justify-center px-2 py-0.5 text-xs font-normal text-secondary-foreground hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground',
        className,
      )}
      disabled={isLoading || recordCount === 0}
      onClick={column.getToggleSortingHandler()}
      data-slot="data-grid-header-button"
    >
      {icon}
      <div>
        <div>{title}</div>
        {subtitle && <div className="text-muted-foreground">{subtitle}</div>}
      </div>

      {column.getCanSort() && getSortIcon(sortDirection)}
    </Button>
  )

  if (column.getCanSort()) {
    return headerButton()
  }

  return headerLabel()
}

export { DataGridColumnHeader, type DataGridColumnHeaderProps }
