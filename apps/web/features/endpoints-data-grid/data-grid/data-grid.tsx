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

interface DataGridContextProps<TData extends object> {
  props: DataGridProviderProps<TData>
  table: Table<TData>
  isLoading: boolean
}

interface DataGridProps<TData extends object> {
  table: Table<TData>
  children?: ReactNode
  onRowClick?: (row: TData) => void
  isLoading?: boolean
  emptyMessage?: ReactNode
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

// oxlint-disable-next-line typescript/no-explicit-any -- Required for generic parameters.
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
  const contextValue = {
    isLoading: props.isLoading ?? false,
    props,
    table,
  }

  // oxlint-disable-next-line react/jsx-no-constructed-context-values -- rest props intentionally define context identity
  return <DataGridContext.Provider value={contextValue}>{children}</DataGridContext.Provider>
}

function DataGrid<TData extends object>({ children, table, ...props }: DataGridProps<TData>) {
  'use no memo'
  const defaultProps: Partial<DataGridProviderProps<TData>> = {
    tableClassNames: {
      base: '',
      body: '',
      bodyCell: 'px-4 py-3',
      bodyRow: '',
      edgeCell: '',
      header: '',
      headerCell: 'px-4',
      headerRow: '',
      headerSticky: 'sticky top-0 z-10 bg-background',
    },
    tableLayout: {
      cellBorder: false,
      columnsPinnable: false,
      columnsResizable: false,
      headerBorder: true,
      headerSticky: false,
      overscan: 5,
      rowBorder: true,
      rowHeight: 58.5,
      width: 'fixed',
    },
  }

  const mergedProps: DataGridProviderProps<TData> = {
    ...defaultProps,
    ...props,
    tableClassNames: {
      ...defaultProps.tableClassNames,
      ...props.tableClassNames,
    },
    tableLayout: {
      ...defaultProps.tableLayout,
      ...props.tableLayout,
    },
  }

  return (
    <DataGridProvider {...mergedProps} table={table}>
      {children}
    </DataGridProvider>
  )
}

export { DataGrid, useDataGrid }
