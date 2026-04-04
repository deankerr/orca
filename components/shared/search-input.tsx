import { useRef, type ComponentProps } from 'react'

import { CircleXIcon, SearchIcon } from 'lucide-react'

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'

type SearchInputProps = Omit<ComponentProps<'input'>, 'onChange' | 'type' | 'value'> & {
  value?: string
  onValueChange?: (value: string) => void
}

export function SearchInput({
  'aria-label': ariaLabel = 'Search',
  value = '',
  onValueChange,
  className,
  placeholder = 'Search...',
  ...props
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClearInput = () => {
    onValueChange?.('')
    inputRef.current?.focus()
  }

  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        {...props}
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label="Clear search" size="icon-xs" onClick={handleClearInput}>
            <CircleXIcon />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}
