import { createIsomorphicFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { useSyncExternalStore } from 'react'

/*
 * Whether the user has collapsed the docked Filters panel: a preference, kept in a cookie so the
 * server renders the page's first frame with Filters where the user left them. The cookie is the
 * only copy; the page reads it on every render through `useSyncExternalStore` and never mirrors it.
 */

const COOKIE_NAME = 'orca-filters'

/** A year: the preference outlasts a session, and resets only when the user changes it. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * A cookie's value as the preference. Anything but `collapsed` is expanded: no cookie, a malformed
 * value, or one this version does not know. It never throws, because it runs while rendering.
 */
export function parseFiltersCollapsed(value: string | undefined): boolean {
  return value === 'collapsed'
}

/**
 * A cookie's raw value from a `document.cookie` string, or undefined when it is not set. It is not
 * percent-decoded: the preference's values are plain tokens, and decoding would throw on a malformed
 * one (`%`) from any script that sets the cookie.
 */
export function cookieValue(cookies: string, name: string): string | undefined {
  for (const pair of cookies.split(';')) {
    const [key, ...value] = pair.trim().split('=')

    if (key === name) {
      return value.join('=')
    }
  }

  return undefined
}

const readCookie = createIsomorphicFn()
  .server(() => getCookie(COOKIE_NAME))
  .client(() => cookieValue(document.cookie, COOKIE_NAME))

const readCollapsed = (): boolean => parseFiltersCollapsed(readCookie())

const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)

  return () => {
    listeners.delete(onChange)
  }
}

/** Whether the user has collapsed the docked Filters panel. The server reads the request's cookie. */
export function useFiltersCollapsed(): boolean {
  return useSyncExternalStore(subscribe, readCollapsed, readCollapsed)
}

/** Stores the preference and re-renders everything that reads it. */
export function setFiltersCollapsed(collapsed: boolean) {
  // oxlint-disable-next-line unicorn/no-document-cookie -- The server reads this cookie to render the first frame, and Safari lacks the Cookie Store API before 18.4.
  document.cookie = `${COOKIE_NAME}=${collapsed ? 'collapsed' : 'expanded'}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`

  for (const listener of listeners) {
    listener()
  }
}
