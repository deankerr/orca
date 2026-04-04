'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/components/ui/navigation-menu'

const navigationLinks = [
  { href: '/', label: 'Endpoints' },
  { href: '/monitor', label: 'Monitor' },
  { href: '/api', label: 'API' },
]

export function AppHeader() {
  const pathname = usePathname()
  return (
    <header className="border-b px-4 md:px-6">
      <div className="flex h-12 items-center justify-between gap-4">
        {/* Left side */}
        <div className="flex items-center gap-6">
          <Link href="/" className="font-mono font-medium text-primary hover:text-primary/90">
            ORCA
          </Link>

          <NavigationMenu>
            <NavigationMenuList className="gap-2">
              {navigationLinks.map((link, index) => {
                const isActive = pathname === link.href
                return (
                  <NavigationMenuItem key={index}>
                    <NavigationMenuLink
                      active={isActive}
                      render={<Link href={link.href} />}
                      className="font-medium"
                    >
                      {link.label}
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                )
              })}
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </div>
    </header>
  )
}
