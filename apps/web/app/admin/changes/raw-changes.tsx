'use client'

import { api } from '@orca/backend/convex/_generated/api'
import type { InspectionResult } from '@orca/backend/convex/scan/inspection'
import { QueryClient, useQuery } from '@tanstack/react-query'
import { useAction, usePaginatedQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs'
import type { inferParserType } from 'nuqs'
import { useEffect, useState } from 'react'

import { PageContainer, PageHeader, PageTitle } from '@/components/app-layout/pages'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

import { JsonOutput } from './json-output'

const collections = ['all', 'models', 'providers', 'endpoints'] as const

const parsers = {
  from: parseAsString,
  to: parseAsString,
  collection: parseAsStringLiteral(collections).withDefault('all'),
  id: parseAsString,
}
type Selection = inferParserType<typeof parsers>
type Ingestion = FunctionReturnType<typeof api.scan.inspection.ingestions>['page'][number]

export function RawChanges() {
  const [selection, setSelection] = useQueryStates(parsers, { history: 'push', shallow: true })

  const { results, status, loadMore } = usePaginatedQuery(
    api.scan.inspection.ingestions,
    {},
    { initialNumItems: 25 },
  )

  const compare = useAction(api.scan.inspection.compare)
  // Keep large, on-demand documents out of the app's persisted query cache.
  // oxlint-disable-next-line react/hook-use-state -- This page owns one immutable query client.
  const [queryClient] = useState(() => new QueryClient())
  const latest = results.find((row) => row.available.from && row.available.to)
  const latestFrom = latest === undefined ? null : (latest.fromArtifactId ?? 'initial')
  const latestTo = latest?.toArtifactId ?? null

  useEffect(() => {
    if (selection.from === null && selection.to === null && latestTo !== null) {
      void setSelection({ from: latestFrom, to: latestTo }, { history: 'replace' })
    }
  }, [selection.from, selection.to, latestFrom, latestTo, setSelection])

  const owner =
    selection.id !== null && selection.collection !== 'all'
      ? { collection: selection.collection, id: selection.id }
      : undefined

  const valid =
    selection.from !== null &&
    selection.from !== '' &&
    selection.to !== null &&
    selection.to !== '' &&
    (selection.id === null || selection.collection !== 'all')

  const args = {
    fromArtifactId: selection.from === 'initial' ? null : selection.from,
    toArtifactId: selection.to ?? '',
    owner,
  }

  const comparison = useQuery(
    {
      queryKey: ['raw-comparison', args],
      queryFn: async (): Promise<InspectionResult> =>
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The action serializes this shared result type to preserve JSON key order.
        JSON.parse(await compare(args)) as InspectionResult,
      enabled: valid,
      staleTime: Infinity,
      retry: false,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    queryClient,
  )

  const selectedIndex = results.findIndex(
    (row) =>
      (row.fromArtifactId ?? 'initial') === selection.from && row.toArtifactId === selection.to,
  )

  const older = selectedIndex === -1 ? undefined : results[selectedIndex + 1]
  const newer = selectedIndex < 1 ? undefined : results[selectedIndex - 1]
  function select(row: Ingestion) {
    void setSelection({ from: row.fromArtifactId ?? 'initial', to: row.toArtifactId })
  }
  const { data } = comparison

  const visible =
    data === undefined
      ? undefined
      : {
          ...data,
          document: {
            ...data.document,
            changes:
              selection.collection === 'all'
                ? data.document.changes
                : data.document.changes.filter((group) => group.key === selection.collection),
          },
        }

  return (
    <PageContainer className="gap-4">
      {/* Page heading and comparison context */}
      <PageHeader>
        <PageTitle>Raw changes</PageTitle>
        <p className="text-xs text-muted-foreground">
          On-demand comparisons of projected scan artifacts. Times are UTC.
        </p>
      </PageHeader>
      {/* Artifact selection and comparison scope */}
      <SelectionForm
        key={JSON.stringify(selection)}
        selection={selection}
        onSubmit={(value) => {
          void setSelection(value)
        }}
      />
      <div className="grid min-h-0 flex-none grid-rows-[auto_minmax(20rem,1fr)] gap-4 sm:px-4 md:flex-1 md:grid-cols-[14rem_minmax(0,1fr)] md:grid-rows-1">
        {/* Ingestion history: navigation and paginated scan list */}
        <aside className="flex min-h-0 flex-col gap-2" aria-label="Recent ingestions">
          <h2 className="text-sm font-medium">Recent ingestions</h2>
          <nav className="flex gap-2" aria-label="Ingestion navigation">
            <IngestionButton row={older} onSelect={select}>
              Older
            </IngestionButton>
            <IngestionButton row={newer} onSelect={select}>
              Newer
            </IngestionButton>
            <IngestionButton row={latest} onSelect={select}>
              Latest
            </IngestionButton>
          </nav>
          <ScrollArea className="h-40 md:h-0 md:flex-1">
            <div className="flex flex-col gap-0.5">
              {status === 'LoadingFirstPage' ? <Skeleton className="h-24" /> : null}
              {results.map((row, index) => (
                <Button
                  key={row.id}
                  variant={index === selectedIndex ? 'secondary' : 'ghost'}
                  className="h-auto justify-start py-2"
                  onClick={() => {
                    select(row)
                  }}
                  aria-current={index === selectedIndex ? 'true' : undefined}
                >
                  <span className="flex flex-col items-start gap-1">
                    <span className="font-mono text-xs">
                      {row.scanAt.replace('T', ' ').replace(/\.\d+Z$/, '')}
                    </span>
                    {!row.available.from || !row.available.to ? (
                      <span className="text-xs text-muted-foreground">Artifact unavailable</span>
                    ) : null}
                  </span>
                </Button>
              ))}
              {status === 'CanLoadMore' || status === 'LoadingMore' ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={status === 'LoadingMore'}
                  onClick={() => {
                    loadMore(25)
                  }}
                >
                  Load older
                </Button>
              ) : null}
              {status === 'Exhausted' && results.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No ingestion records. Enter artifact names to compare them directly.
                </p>
              ) : null}
            </div>
          </ScrollArea>
        </aside>
        {/* Selected comparison: artifact pair, request state, and output */}
        <section
          className="flex min-h-0 min-w-0 flex-col gap-3"
          aria-label="Selected comparison"
          aria-busy={comparison.isFetching}
        >
          {/* Active artifact pair and refresh action */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            {selection.from !== null && selection.to !== null ? (
              <div className="min-w-0 font-mono text-xs break-all text-muted-foreground">
                <p>From: {selection.from}</p>
                <p>To: {selection.to}</p>
              </div>
            ) : null}
            {valid ? (
              <Button
                variant="outline"
                size="sm"
                disabled={comparison.isFetching}
                onClick={() => {
                  void comparison.refetch()
                }}
              >
                Refresh comparison
              </Button>
            ) : null}
          </div>
          {/* Empty, loading, and error states */}
          {valid ? null : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Select a comparison</EmptyTitle>
                <EmptyDescription>
                  Choose an ingestion or enter both artifact names. Choose a collection when
                  specifying an owner ID.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {valid && comparison.isPending ? (
            <output className="text-sm text-muted-foreground">Comparing artifacts…</output>
          ) : null}
          {comparison.error === null ? null : (
            <Alert variant="destructive">
              <AlertTitle>Comparison failed</AlertTitle>
              <AlertDescription>{comparison.error.message}</AlertDescription>
            </Alert>
          )}
          {/* Comparison document and export actions */}
          {valid && visible !== undefined ? (
            <JsonOutput key={JSON.stringify(selection)} value={visible} />
          ) : null}
        </section>
      </div>
    </PageContainer>
  )
}

function SelectionForm({
  selection,
  onSubmit,
}: {
  selection: Selection
  onSubmit: (selection: Selection) => void
}) {
  const [collection, setCollection] = useState(selection.collection)
  return (
    <form
      className="flex shrink-0 flex-col gap-3 sm:px-4"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)

        onSubmit({
          from: formText(form, 'fromArtifactId'),
          to: formText(form, 'toArtifactId'),
          collection,
          id: collection === 'all' ? null : formText(form, 'owner') || null,
        })
      }}
    >
      {/* Artifact range: baseline and target */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="scan-from">From artifact</Label>
          <Input
            id="scan-from"
            name="fromArtifactId"
            defaultValue={selection.from ?? ''}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            placeholder="initial or scan.…jsonl"
            required
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="scan-to">To artifact</Label>
          <Input
            id="scan-to"
            name="toArtifactId"
            defaultValue={selection.to ?? ''}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            placeholder="scan.…jsonl"
            required
          />
        </div>
      </div>
      {/* Collection and optional owner filter, applied together on submit */}
      <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-end gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="scan-collection">Collection</Label>
          <Select
            value={collection}
            onValueChange={(value) => {
              if (value !== null) {
                setCollection(value)
              }
            }}
          >
            <SelectTrigger id="scan-collection" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {collections.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="scan-owner">Owner ID</Label>
          <Input
            id="scan-owner"
            name="owner"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            defaultValue={selection.id ?? ''}
            placeholder="All owners"
            disabled={collection === 'all'}
          />
        </div>
        <Button type="submit" className="col-span-2 sm:col-span-1">
          Compare
        </Button>
      </div>
    </form>
  )
}

function formText(form: FormData, name: string) {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function IngestionButton({
  row,
  onSelect,
  children,
}: {
  row: Ingestion | undefined
  onSelect: (row: Ingestion) => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="flex-1"
      disabled={row === undefined}
      onClick={() => {
        if (row !== undefined) {
          onSelect(row)
        }
      }}
    >
      {children}
    </Button>
  )
}
