import { get } from './queries'
import { changesTable } from './table'
export type {
  ArrayDiffItem,
  EndpointChange,
  EndpointRef,
  EntityChange,
  EntityEvent,
  FieldChange,
  ModelChange,
  ModelRef,
  ProviderChange,
  ProviderRef,
} from './projection'

export const changes = {
  get,
} as const

export const changesSchema = {
  table: changesTable,
} as const
