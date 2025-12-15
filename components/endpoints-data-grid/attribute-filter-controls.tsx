import { CheckIcon, FilterIcon, LayoutGridIcon, XIcon } from 'lucide-react'

import { AttributeName, attributes } from '@/lib/attributes'
import { SpriteIconName } from '@/lib/sprite-icons'
import { cn } from '@/lib/utils'

import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Separator } from '../ui/separator'
import { SpriteIcon } from '../ui/sprite-icon'
import { useEndpointFilters, type FilterMode } from './use-endpoint-filters'

export function ModalityFilterControls() {
  const { modalityFilters, setModalityFilter, clearModalityFilters, activeModalityCount } =
    useEndpointFilters()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <LayoutGridIcon />
          Modalities
          {activeModalityCount > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {activeModalityCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[min(100vw-2rem,410px)]" align="start">
        <div className="space-y-4">
          <FilterSection title="Input">
            <div className="grid grid-cols-2 gap-2">
              <FilterToggle
                icon={attributes.image_input.icon}
                label="Image"
                mode={modalityFilters.image_input}
                onChange={(mode) => setModalityFilter('image_input', mode)}
                allowExclude={true}
              />
              <FilterToggle
                icon={attributes.file_input.icon}
                label="File"
                mode={modalityFilters.file_input}
                onChange={(mode) => setModalityFilter('file_input', mode)}
                allowExclude={true}
              />
              <FilterToggle
                icon={attributes.audio_input.icon}
                label="Audio"
                mode={modalityFilters.audio_input}
                onChange={(mode) => setModalityFilter('audio_input', mode)}
                allowExclude={true}
              />
              <FilterToggle
                icon={attributes.video_input.icon}
                label="Video"
                mode={modalityFilters.video_input}
                onChange={(mode) => setModalityFilter('video_input', mode)}
                allowExclude={true}
              />
            </div>
          </FilterSection>

          <FilterSection title="Output">
            <div className="grid grid-cols-2 gap-2">
              <FilterToggle
                icon={attributes.image_output.icon}
                label="Image"
                mode={modalityFilters.image_output}
                onChange={(mode) => setModalityFilter('image_output', mode)}
                allowExclude={true}
              />
              <FilterToggle
                icon={attributes.embeddings_output.icon}
                label="Embeddings"
                mode={modalityFilters.embeddings_output}
                onChange={(mode) => setModalityFilter('embeddings_output', mode)}
                allowExclude={true}
              />
            </div>
          </FilterSection>

          {activeModalityCount > 0 && (
            <>
              <Separator />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={clearModalityFilters}>
                  Clear
                </Button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function AttributeFilterControls() {
  const { attributeFilters, setAttributeFilter, clearAttributeFilters, activeAttributeCount } =
    useEndpointFilters()

  // Helper to render an attribute filter toggle
  const renderAttributeToggle = (name: AttributeName) => (
    <FilterToggle
      icon={attributes[name].icon}
      label={attributes[name].label}
      mode={attributeFilters[name] ?? 'any'}
      onChange={(mode) => setAttributeFilter(name, mode)}
    />
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <FilterIcon />
          Attributes
          {activeAttributeCount > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {activeAttributeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[min(100vw-2rem,520px)]" align="start">
        <div className="space-y-4">
          {/* Features */}
          <FilterSection title="Features">
            <div className="grid grid-cols-1 gap-x-2 gap-y-1.5 sm:grid-cols-2">
              {renderAttributeToggle('reasoning')}
              {renderAttributeToggle('tools')}
              {renderAttributeToggle('response_format')}
              {renderAttributeToggle('structured_outputs')}
              {renderAttributeToggle('caching')}
              {renderAttributeToggle('native_web_search')}
              {renderAttributeToggle('moderated')}
              {renderAttributeToggle('free')}
              {renderAttributeToggle('completions')}
              {renderAttributeToggle('chat_completions')}
            </div>
          </FilterSection>

          <Separator />

          {/* Status */}
          <FilterSection title="Status">
            <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {renderAttributeToggle('gone')}
              {renderAttributeToggle('disabled')}
              {renderAttributeToggle('deranked')}
            </div>
          </FilterSection>

          <Separator />

          {/* Data Policy */}
          <FilterSection title="Data Policy">
            <div className="grid grid-cols-1 gap-x-2 gap-y-1.5 sm:grid-cols-2">
              {renderAttributeToggle('training')}
              {renderAttributeToggle('data_publishing')}
              {renderAttributeToggle('user_id')}
              {renderAttributeToggle('data_retention')}
            </div>
          </FilterSection>

          {activeAttributeCount > 0 && (
            <>
              <Separator />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={clearAttributeFilters}>
                  Clear
                </Button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase">{title}</div>
      {children}
    </div>
  )
}

function FilterToggle({
  icon,
  label,
  mode,
  onChange,
  allowExclude = true,
}: {
  icon: SpriteIconName
  label: string
  mode: FilterMode
  onChange: (mode: FilterMode) => void
  allowExclude?: boolean
}) {
  const toggleInclude = () => {
    onChange(mode === 'include' ? 'any' : 'include')
  }

  const toggleExclude = () => {
    onChange(mode === 'exclude' ? 'any' : 'exclude')
  }

  const toggleLabel = () => {
    if (allowExclude) {
      // Cycle: any -> include -> exclude -> any
      if (mode === 'any') {
        onChange('include')
      } else if (mode === 'include') {
        onChange('exclude')
      } else {
        onChange('any')
      }
    } else {
      // Toggle: any <-> include
      onChange(mode === 'include' ? 'any' : 'include')
    }
  }

  const getAriaLabel = () => {
    const state = mode === 'include' ? 'included' : mode === 'exclude' ? 'excluded' : 'not filtered'
    return `${label}, ${state}. Click to toggle filter`
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-sm px-1 py-1 text-sm text-foreground transition-colors hover:bg-muted">
      <button
        type="button"
        onClick={toggleLabel}
        className="flex flex-1 items-center gap-2 rounded-sm px-1 py-0.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={getAriaLabel()}
      >
        <SpriteIcon name={icon} className="size-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </button>

      <div className="flex items-center gap-1" role="group" aria-label={`${label} filter controls`}>
        <button
          type="button"
          onClick={toggleInclude}
          className={cn(
            'flex size-6 items-center justify-center rounded-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            mode === 'include'
              ? 'bg-green-500/20 text-green-600 hover:bg-green-500/30 dark:text-green-400'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
          aria-label={`Include ${label}`}
          aria-pressed={mode === 'include'}
        >
          <CheckIcon className="size-3.5" aria-hidden="true" />
        </button>

        {allowExclude && (
          <button
            type="button"
            onClick={toggleExclude}
            className={cn(
              'flex size-6 items-center justify-center rounded-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              mode === 'exclude'
                ? 'bg-red-500/20 text-red-600 hover:bg-red-500/30 dark:text-red-400'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            aria-label={`Exclude ${label}`}
            aria-pressed={mode === 'exclude'}
          >
            <XIcon className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
