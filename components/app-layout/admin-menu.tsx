import Link from 'next/link'

import { FeatureFlag } from '../dev-utils/feature-flag'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const adminLinks = [
  { href: '/dev/archives', label: 'Archives' },
  { href: '/dev/resources', label: 'Resources' },
  { href: '/dev/components', label: 'Components' },
]

export function AdminMenu() {
  return (
    <FeatureFlag flag="dev">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="border-dashed font-mono">
            A
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {adminLinks.map((link) => (
            <DropdownMenuItem key={link.href} asChild>
              <Link href={link.href}>{link.label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </FeatureFlag>
  )
}
