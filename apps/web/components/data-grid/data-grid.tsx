'use client'

import type { RowData, Table } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { createContext, useContext } from 'react'

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    headerClassName?: string
    cellClassName?: string
  }
}

export interface DataGridContextProps<TData extends object> {
  props: DataGridProviderProps<TData>
  table: Table<TData>
  recordCount: number
  isLoading: boolean
}

export interface DataGridProps<TData extends object> {
  table: Table<TData>
  recordCount: number
  children?: ReactNode
  onRowClick?: (row: TData) => void
  isLoading?: boolean
  emptyMessage?: ReactNode | string
  tableLayout?: {
    cellBorder?: boolean
    rowBorder?: boolean
    headerBorder?: boolean
    headerSticky?: boolean
    width?: 'auto' | 'fixed'
    columnsResizable?: boolean
    columnsPinnable?: boolean
    rowHeight?: number
    overscan?: number
  }
  rowDataAttributes?: (row: TData) => Record<string, string | undefined>
  tableClassNames?: {
    base?: string
    header?: string
    headerRow?: string
    headerCell?: string
    headerSticky?: string
    body?: string
    bodyRow?: string
    bodyCell?: string
    edgeCell?: string
  }
}

type DataGridProviderProps<TData extends object> = Omit<DataGridProps<TData>, 'table'>

// oxlint-disable-next-line typescript/no-explicit-any required for generic params
const DataGridContext = createContext<DataGridContextProps<any> | undefined>(undefined)

function useDataGrid() {
  const context = useContext(DataGridContext)
  if (!context) {
    throw new Error('useDataGrid must be used within a DataGridProvider')
  }
  return context
}

function DataGridProvider<TData extends object>({
  children,
  table,
  ...props
}: DataGridProps<TData>) {
  'use no memo'
  const contextValue = {
    props,
    table,
    recordCount: props.recordCount,
    isLoading: props.isLoading ?? false,
  }

  return <DataGridContext.Provider value={contextValue}>{children}</DataGridContext.Provider>
}

function DataGrid<TData extends object>({ children, table, ...props }: DataGridProps<TData>) {
  'use no memo'
  const defaultProps: Partial<DataGridProviderProps<TData>> = {
    tableLayout: {
      cellBorder: false,
      rowBorder: true,
      headerSticky: false,
      headerBorder: true,
      width: 'fixed',
      columnsResizable: false,
      columnsPinnable: false,
      rowHeight: 58.5,
      overscan: 5,
    },
    tableClassNames: {
      base: '',
      header: '',
      headerRow: '',
      headerCell: 'px-4',
      headerSticky: 'sticky top-0 z-10 bg-background',
      body: '',
      bodyRow: '',
      bodyCell: 'px-4 py-3',
      edgeCell: '',
    },
  }

  const mergedProps: DataGridProviderProps<TData> = {
    ...defaultProps,
    ...props,
    tableLayout: {
      ...defaultProps.tableLayout,
      ...props.tableLayout,
    },
    tableClassNames: {
      ...defaultProps.tableClassNames,
      ...props.tableClassNames,
    },
  }

  return (
    <DataGridProvider {...mergedProps} table={table}>
      {children}
    </DataGridProvider>
  )
}

export { DataGrid, useDataGrid }
