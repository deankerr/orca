import type { PropertyId, Group } from '@orca/properties'
import { Checkbox } from '@orca/ui/components/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@orca/ui/components/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@orca/ui/components/tooltip'
import { cn } from 'cn'
import { Check, ChevronRight, Minus } from 'lucide-react'
import { Fragment, useId, useState } from 'react'

import { FACET_COUNT_CLASS, FACET_HEADING_CLASS, FOCUS_RING, Facet } from '#components/facet'
import type { PropertyFacet, PropertyFacetGroup } from '#features/endpoints/facets'
import {
  useCatalog,
  useEndpointSearch,
  useEndpointSearchActions,
  useFacetCounts,
  usePropertyFacetGroups,
} from '#features/endpoints/hooks'
import { propertyState, setPropertyState } from '#features/endpoints/search'
import type { PropertyState } from '#features/endpoints/search'
import { activeInGroup, isGroupOpen } from '#features/filters/groups'
import { nextPropertyState, PROPERTY_STATE_WORDS } from '#features/filters/tri-state'

/** Hover text marks code in backticks. */
function Description({ text }: { text: string }) {
  return text.split('`').map((part, index) =>
    index % 2 === 1 ? (
      <code className="font-mono text-[11px]" key={index}>
        {part}
      </code>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  )
}

/** The box at the left of a property row: empty, checked while required, a minus while excluded. */
function StateBox({ state }: { state: PropertyState }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border',
        state === 'off' && 'border-input',
        state === 'with' && 'border-primary bg-primary text-primary-foreground',
        state === 'without' && 'border-foreground text-foreground',
      )}
    >
      {state === 'with' && <Check className="size-3" strokeWidth={3} />}
      {state === 'without' && <Minus className="size-3" strokeWidth={3} />}
    </span>
  )
}

/**
 * A three-state property row: off, then required (`with`), then excluded (`without`), then off.
 *
 * It is one button whose accessible name carries the state, such as "ZDR, required". `aria-checked`
 * would be wrong: a checkbox's `mixed` means partly checked, not excluded, and a pressed toggle has
 * only two states. A radio group of three would take three tab stops per row, across about 70 rows.
 * A button keeps one stop and one action; changing its name announces the new state.
 */
function PropertyRow({
  count,
  facet: { definition, id },
  state,
  toggle,
}: {
  count: number
  facet: PropertyFacet
  state: PropertyState
  toggle: (id: PropertyId, state: PropertyState) => void
}) {
  const excluded = state === 'without'
  const countText = excluded ? 'excluded' : String(count)

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={`${definition.name}, ${PROPERTY_STATE_WORDS[state]}${excluded ? '' : `, ${count} endpoints`}`}
            className={cn(
              'flex h-6 w-full items-center gap-2 rounded-sm text-left text-[13px] leading-4',
              count === 0 && state === 'off' && 'opacity-50',
              FOCUS_RING,
            )}
            onClick={() => {
              toggle(id, nextPropertyState(state))
            }}
            type="button"
          />
        }
      >
        <StateBox state={state} />
        <span
          className={cn('min-w-0 grow truncate', excluded && 'text-muted-foreground line-through')}
        >
          {definition.name}
        </span>
        <span className={FACET_COUNT_CLASS}>{countText}</span>
      </TooltipTrigger>
      <TooltipContent align="start" side="right">
        <span className="block">
          <Description text={definition.description} />
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

/** A group of property facets, collapsed unless it is a default group or holds an active filter. */
function PropertyGroup({
  group,
  onToggle,
  open,
}: {
  group: PropertyFacetGroup
  onToggle: () => void
  open: boolean
}) {
  const counts = useFacetCounts().properties
  const filters = useEndpointSearch()
  const { update } = useEndpointSearchActions()
  const active = activeInGroup(group, filters)
  const headingId = useId()

  const toggle = (id: PropertyId, state: PropertyState) => {
    update((current) => setPropertyState(current, id, state))
  }

  return (
    // The Collapsible is the source of truth's mirror: `open` comes from `isGroupOpen`, so a group with
    // an active filter cannot be closed, and its trigger stays focusable.
    <Collapsible
      className="contents"
      onOpenChange={() => {
        if (active === 0) {
          onToggle()
        }
      }}
      open={open}
    >
      <Facet
        className={open ? undefined : 'pb-1'}
        heading={
          <h2 className={FACET_HEADING_CLASS} id={headingId}>
            <CollapsibleTrigger
              // A group with an active filter stays open, so its toggle does nothing.
              aria-disabled={active > 0}
              className={cn(
                'flex h-5 w-full items-center gap-1 rounded-sm text-left font-normal tracking-[0.08em] uppercase',
                FOCUS_RING,
              )}
            >
              <ChevronRight
                aria-hidden="true"
                className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')}
              />
              <span className="grow">{group.label}</span>
              <span aria-hidden={active === 0} className="tracking-normal normal-case tabular-nums">
                {active > 0 ? `${active} active` : group.facets.length}
              </span>
            </CollapsibleTrigger>
          </h2>
        }
        headingId={headingId}
        title={group.label}
      >
        <CollapsibleContent className="h-(--collapsible-panel-height) transition-[height] duration-150 ease-out data-ending-style:h-0 data-ending-style:overflow-hidden data-starting-style:h-0 data-starting-style:overflow-hidden motion-reduce:transition-none">
          {group.facets.map((facet) => (
            <PropertyRow
              count={counts.get(facet.id)?.with ?? 0}
              facet={facet}
              key={facet.id}
              state={propertyState(filters, facet.id)}
              toggle={toggle}
            />
          ))}
        </CollapsibleContent>
      </Facet>
    </Collapsible>
  )
}

/** Property facets by group, then the Status facet's unlisted toggle. */
export function PropertyFacets() {
  const groups = usePropertyFacetGroups()
  const filters = useEndpointSearch()
  const [toggled, setToggled] = useState<ReadonlyMap<Group, boolean>>(new Map())

  return (
    <TooltipProvider delay={250}>
      {groups.map((group) => {
        const open = isGroupOpen(group, filters, toggled)

        return (
          <PropertyGroup
            group={group}
            key={group.group}
            onToggle={() => {
              setToggled(new Map(toggled).set(group.group, !open))
            }}
            open={open}
          />
        )
      })}
      <StatusFacet />
    </TooltipProvider>
  )
}

const UNLISTED_NOTE = 'Also show endpoints OpenRouter no longer lists.'

/** Unlisted endpoints stay out of scope unless shown. */
function StatusFacet() {
  const { rows } = useCatalog()
  const { unlisted } = useEndpointSearch()
  const { update } = useEndpointSearchActions()
  const noteId = useId()
  const unlistedCount = rows.filter((row) => row.unlisted).length

  return (
    <Facet className="border-b-0" title="Listing">
      <Tooltip>
        <TooltipTrigger
          render={
            // oxlint-disable-next-line jsx-a11y/label-has-associated-control -- The label's text and checkbox are the trigger's children, which the rule cannot see.
            <label className="flex h-6 cursor-pointer items-center gap-2 text-[13px] leading-4" />
          }
        >
          <Checkbox
            aria-describedby={noteId}
            checked={unlisted}
            className="size-3.5 after:hidden"
            onCheckedChange={(checked) => {
              update(() => ({ unlisted: checked }))
            }}
          />
          <span className="grow">Show unlisted</span>
          <span className={FACET_COUNT_CLASS}>{unlistedCount}</span>
        </TooltipTrigger>
        <TooltipContent align="start" side="right">
          {UNLISTED_NOTE}
        </TooltipContent>
      </Tooltip>
      <span hidden id={noteId}>
        {UNLISTED_NOTE}
      </span>
    </Facet>
  )
}
