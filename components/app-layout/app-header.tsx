'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/components/ui/navigation-menu'

import { AdminMenu } from './admin-menu'

const navigationLinks = [
  { href: '/', label: 'Endpoints' },
  { href: '/monitor', label: 'Monitor' },
]

export function AppHeader() {
  const pathname = usePathname()
  return (
    <header className="border-b px-4 md:px-6">
      <div className="flex h-16 items-center justify-between gap-4">
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
                      asChild
                      active={isActive}
                      className="py-1.5 font-medium text-muted-foreground hover:text-primary"
                    >
                      <Link href={link.href}>{link.label}</Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                )
              })}
            </NavigationMenuList>
          </NavigationMenu>
        </div>
        {/* Right side */}
        <div className="flex items-center gap-2">
          <AdminMenu />
        </div>
      </div>
    </header>
  )
}
