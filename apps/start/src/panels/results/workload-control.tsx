import { matchingPreset, workloadPresets } from '@orca/pricing'
import { Button } from '@orca/ui/components/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@orca/ui/components/input-group'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@orca/ui/components/popover'
import { ToggleGroup, ToggleGroupItem } from '@orca/ui/components/toggle-group'
import { CircleDollarSign } from 'lucide-react'
import { useId, useState } from 'react'
import type { ComponentProps } from 'react'

import { useScopeActions, useWorkload } from '#endpoints/hooks'

import {
  hitPercent,
  parseHitPercent,
  parseRatio,
  workloadButtonName,
  workloadNumbers,
} from './workload'

/** The fields' text, a size up on a touch screen so iOS does not zoom when one takes focus. */
const FIELD_TEXT_CLASS =
  'text-[13px] leading-4 md:text-[13px] pointer-coarse:text-base md:pointer-coarse:text-base'

interface WorkloadFieldProps {
  /** The text after the input, inside the field. */
  addon: string
  help: string
  inputMode: ComponentProps<'input'>['inputMode']
  label: string
  maxLength?: number
  /** Commits a value `parse` accepted. */
  onCommit: (value: number) => void
  /** The value a typed text means, or null when it means none. */
  parse: (text: string) => number | null
  /** The committed value: shown whenever nothing is being typed, and typing it again commits nothing. */
  value: number
}

/**
 * A number field of the workload. It keeps what is typed as a draft, so a half-typed or empty value
 * neither snaps back under the cursor nor reaches the URL. Each typed value that parses is committed
 * as it is typed; leaving the field drops the draft, which restores the last committed value.
 */
function WorkloadField({
  addon,
  help,
  inputMode,
  label,
  maxLength,
  onCommit,
  parse,
  value,
}: WorkloadFieldProps) {
  const id = useId()
  const helpId = `${id}-help`
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" htmlFor={id}>
        {label}
      </label>
      <InputGroup className="pointer-coarse:h-9">
        <InputGroupInput
          aria-describedby={helpId}
          aria-invalid={draft !== null && parse(draft) === null ? true : undefined}
          autoComplete="off"
          className={FIELD_TEXT_CLASS}
          enterKeyHint="done"
          id={id}
          inputMode={inputMode}
          maxLength={maxLength}
          onBlur={() => {
            setDraft(null)
          }}
          onChange={(event) => {
            const text = event.target.value
            const parsed = parse(text)

            setDraft(text)

            if (parsed !== null && parsed !== value) {
              onCommit(parsed)
            }
          }}
          spellCheck={false}
          type="text"
          value={draft ?? String(value)}
        />
        <InputGroupAddon align="inline-end">{addon}</InputGroupAddon>
      </InputGroup>
      <p className="text-[11px] leading-snug text-muted-foreground" id={helpId}>
        {help}
      </p>
    </div>
  )
}

/** The workload's presets and numbers, which apply as they change. */
function WorkloadForm() {
  const workload = useWorkload()
  const { setWorkload } = useScopeActions()
  const preset = matchingPreset(workload)
  // Choosing a preset replaces both numbers, so the fields start again from them, dropping any draft.
  const [presetChoices, setPresetChoices] = useState(0)

  return (
    <>
      <ToggleGroup
        aria-label="Workload preset"
        className="w-full"
        onValueChange={(next) => {
          const chosen = workloadPresets.find((candidate) => candidate.id === next[0])

          // Pressing the active preset again would turn it off; the numbers still stand.
          if (chosen !== undefined) {
            setWorkload(chosen.workload)
            setPresetChoices((count) => count + 1)
          }
        }}
        spacing={0}
        value={preset === undefined ? [] : [preset.id]}
        variant="outline"
      >
        {workloadPresets.map((candidate) => (
          <ToggleGroupItem
            className="flex-1 pointer-coarse:h-9"
            key={candidate.id}
            value={candidate.id}
          >
            {candidate.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <WorkloadField
        addon=": 1"
        key={`ratio-${presetChoices}`}
        help="Input tokens per output token."
        inputMode="decimal"
        label="Input : output"
        onCommit={(ratio) => {
          setWorkload({ ratio })
        }}
        parse={parseRatio}
        value={workload.ratio}
      />
      <WorkloadField
        addon="%"
        key={`hit-${presetChoices}`}
        help="Share of input read from cache; 0 turns caching off."
        inputMode="numeric"
        label="Cache hit rate"
        maxLength={3}
        onCommit={(percent) => {
          setWorkload({ hitRate: percent / 100 })
        }}
        parse={parseHitPercent}
        value={hitPercent(workload)}
      />
    </>
  )
}

/**
 * The workload control, in the scope bar. It shows the workload's ratio and hit rate, never a preset's
 * name, and opens a popover to change it. The workload governs the Table's Cost column and the plot,
 * so it lives in the bar they share. The label truncates in a narrow bar; the button's name does not.
 */
export function WorkloadControl() {
  const workload = useWorkload()

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={workloadButtonName(workload)}
            className="max-w-36 min-w-0 pointer-coarse:h-8"
            variant="outline"
          />
        }
      >
        <CircleDollarSign aria-hidden="true" data-icon="inline-start" />
        <span className="truncate">{workloadNumbers(workload)}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-3">
        <PopoverHeader>
          <PopoverTitle>Workload</PopoverTitle>
          <PopoverDescription>Sets the Cost column and the plot.</PopoverDescription>
        </PopoverHeader>
        <WorkloadForm />
      </PopoverContent>
    </Popover>
  )
}
