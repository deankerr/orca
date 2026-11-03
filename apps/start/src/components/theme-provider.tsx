import { ScriptOnce } from '@tanstack/react-router'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'system'

const storageKey = 'orca-theme'
const defaultTheme: Theme = 'dark'
const mediaQuery = '(prefers-color-scheme: dark)'

const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | undefined>(
  undefined,
)

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(storageKey)

    return isTheme(stored) ? stored : defaultTheme
  } catch {
    // Storage can be disabled; the default theme still works for this visit.
    return defaultTheme
  }
}

function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia(mediaQuery).matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('light', !dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

const themeScript = `(() => {
  let theme = ${JSON.stringify(defaultTheme)};
  try {
    const stored = localStorage.getItem(${JSON.stringify(storageKey)});
    if (stored === "light" || stored === "dark" || stored === "system") theme = stored;
  } catch {}
  const dark = theme === "dark" || (theme === "system" && matchMedia(${JSON.stringify(mediaQuery)}).matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
  root.style.colorScheme = dark ? "dark" : "light";
})();`

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>()

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Read browser storage after hydration to preserve the server snapshot.
    setTheme(readTheme())
  }, [])

  useEffect(() => {
    if (theme === undefined) {
      return undefined
    }

    applyTheme(theme)

    if (theme !== 'system') {
      return undefined
    }

    const media = matchMedia(mediaQuery)

    const onChange = () => {
      applyTheme('system')
    }

    media.addEventListener('change', onChange)

    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [theme])

  const selectTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      // Keep the selection usable for this visit when persistence is unavailable.
    }

    setTheme(next)
  }, [])

  const value = useMemo(
    () => ({ setTheme: selectTheme, theme: theme ?? defaultTheme }),
    [selectTheme, theme],
  )

  return (
    <ThemeContext value={value}>
      <ScriptOnce>{themeScript}</ScriptOnce>
      {children}
    </ThemeContext>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (context === undefined) {
    throw new Error('useTheme requires ThemeProvider')
  }

  return context
}
