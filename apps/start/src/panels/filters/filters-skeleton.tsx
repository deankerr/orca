import { InputGroup, InputGroupAddon, InputGroupInput } from '@orca/ui/components/input-group'
import { Skeleton } from '@orca/ui/components/skeleton'
import { cn } from 'cn'
import { Search } from 'lucide-react'

import { Facet } from './facet'
import { FiltersFrame } from './filters-panel'
import { BOUND_ROWS } from './range-facets'

/** Widths in rotation, so the placeholder names read as a list and not a column of equal bars. */
const NAME_WIDTHS = ['w-28', 'w-36', 'w-24', 'w-32', 'w-20', 'w-40', 'w-28', 'w-24'] as const

/** Rows the real list shows before it scrolls, which a loaded catalogue always fills. */
const LIST_ROWS = 8

/** Rows in each placeholder property group. */
const PROPERTY_GROUPS = [4, 5, 3] as const

/** A row of a facet: a box, optionally a logo, a name, and a count, as in `ListFacet` and `PropertyFacets`. */
function RowSkeleton({ logo, index }: { logo: boolean; index: number }) {
  return (
    <div className="flex h-6 items-center gap-2 pointer-coarse:h-9">
      <Skeleton className="size-3.5 shrink-0 rounded-[4px]" />
      {logo ? <Skeleton className="size-4 shrink-0 rounded-[3px]" /> : null}
      <Skeleton className={cn('h-3 rounded-sm', NAME_WIDTHS[index % NAME_WIDTHS.length])} />
      <Skeleton className="ml-auto h-3 w-5 shrink-0 rounded-sm" />
    </div>
  )
}

/** Model or Provider: the heading, the filter field, and a full list of rows. */
function ListFacetSkeleton({ filter, title }: { filter: string; title: string }) {
  return (
    <Facet meta={<Skeleton className="h-2.5 w-16 rounded-sm" />} title={title}>
      <InputGroup className="mb-1 h-6 pointer-coarse:h-9">
        <InputGroupAddon className="py-0">
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={filter}
          className="text-[13px] leading-4 md:text-[13px] pointer-coarse:text-base md:pointer-coarse:text-base"
          disabled
          placeholder={filter}
        />
      </InputGroup>
      {/* The real list pads its right edge for a scrollbar, which a full catalogue's list always has. */}
      <div className="max-h-48 overflow-hidden pr-2.5">
        {Array.from({ length: LIST_ROWS }, (_, index) => (
          <RowSkeleton index={index} key={index} logo />
        ))}
      </div>
    </Facet>
  )
}

/** One bound: its label, a value, and the strip under them, which is the histogram or the release windows. */
function BoundSkeleton({ label, strip }: { label: string; strip: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-5 items-center justify-between text-[13px] leading-4">
        <span>{label}</span>
        <Skeleton className="h-3 w-8 rounded-sm" />
      </div>
      <Skeleton className={strip} />
    </div>
  )
}

function RangeFacetsSkeleton() {
  return (
    <Facet title="Price and speed">
      <div className="flex flex-col gap-3.5 pt-1 pb-1">
        {BOUND_ROWS.map(({ facet, label }) => (
          <BoundSkeleton key={facet} label={label} strip="h-7 rounded-sm" />
        ))}
        <BoundSkeleton label="Released" strip="h-6.5 rounded-md" />
      </div>
    </Facet>
  )
}

/** A property group's facet. Its title is data, so it is a placeholder too. */
function PropertyGroupSkeleton({ rows }: { rows: number }) {
  return (
    <Facet
      // Decorative: a heading with nothing in it would be announced to no purpose.
      aria-hidden="true"
      heading={
        <div className="flex h-5 items-center gap-1">
          <Skeleton className="size-3 rounded-sm" />
          <Skeleton className="h-2.5 w-24 rounded-sm" />
        </div>
      }
      title=""
    >
      {Array.from({ length: rows }, (_, index) => (
        <RowSkeleton index={index + 2} key={index} logo={false} />
      ))}
    </Facet>
  )
}

/**
 * The Filters panel as the route's pending state shows it: the real frame and header, the facets' fixed
 * titles and filter field, and placeholders for everything that comes from the catalogue.
 */
export function FiltersSkeleton() {
  return (
    <FiltersFrame>
      <ListFacetSkeleton filter="Filter models" title="Model" />
      <ListFacetSkeleton filter="Filter providers" title="Provider" />
      <RangeFacetsSkeleton />
      {PROPERTY_GROUPS.map((rows, index) => (
        <PropertyGroupSkeleton key={index} rows={rows} />
      ))}
    </FiltersFrame>
  )
}
