import { Button } from '@orca/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@orca/ui/components/dropdown-menu'

import { KEYS_RESERVED_ATTRIBUTE } from '../features/table/key-scope'
import { useTheme } from './theme-provider'

const themes = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
] as const

/** Picks the colour theme. Sized for the status bar: it opens upward and labels itself with the current theme. */
export function ThemeMenu() {
  const { setTheme, theme } = useTheme()
  const current = themes.find((option) => option.value === theme)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Theme: ${current?.label}`}
            className="-mr-1.5 h-5 px-1.5 font-mono text-[11px] text-muted-foreground"
            size="xs"
            variant="ghost"
            // The status bar is inside the Results panel, where ↑ and ↓ move the Table's selection; the trigger opens the menu with them.
            {...{ [KEYS_RESERVED_ATTRIBUTE]: '' }}
          />
        }
      >
        {current?.label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            const next = themes.find((option) => option.value === value)

            if (next !== undefined) {
              setTheme(next.value)
            }
          }}
        >
          {themes.map((option) => (
            <DropdownMenuRadioItem closeOnClick key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
