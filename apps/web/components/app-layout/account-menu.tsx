import { withAuth } from '@workos-inc/authkit-nextjs'
import { LogOutIcon, ShieldCheckIcon } from 'lucide-react'
import Link from 'next/link'

import { signOutAdmin } from '@/app/admin/actions'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export async function AccountMenu() {
  const { user } = await withAuth()

  if (user === null) {
    return null
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
  const initials =
    [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join('').toUpperCase() ||
    user.email.slice(0, 1).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-lg" className="rounded-full" />}
        aria-label={`Account menu for ${user.email}`}
      >
        <Avatar size="sm">
          <AvatarImage src={user.profilePictureUrl ?? undefined} alt="" />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {name && <div className="truncate font-medium text-foreground">{name}</div>}
            <div className="truncate">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/admin" />}>
            <ShieldCheckIcon />
            Admin
          </DropdownMenuItem>
          <form action={signOutAdmin}>
            <DropdownMenuItem
              nativeButton
              render={<button type="submit" aria-label="Sign out" />}
              className="w-full"
            >
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </form>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
