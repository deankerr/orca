import { Button } from '@orca/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@orca/ui/components/dropdown-menu'

import { useTheme } from './theme-provider'

export function ModeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>Theme</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => {
              setTheme('light')
            }}
          >
            Light
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setTheme('dark')
            }}
          >
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setTheme('system')
            }}
          >
            System
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
