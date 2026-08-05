import { useEffect, useState } from 'react'
import type { ThemeMode } from './palette'

/**
 * Tracks the site colour mode for code that cannot use CSS — here, the WebGL
 * scene, which has to pick its palette in JavaScript.
 *
 * `SiteHeader` writes `data-color-mode` (and `data-theme`) onto <html> in a
 * layout effect and emits no event, so a MutationObserver is the only channel
 * available. The dark fallback matches the site's own default for a cold load
 * where the attribute has not been committed yet.
 */
function readColorMode(): ThemeMode {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.dataset.colorMode === 'light' ? 'light' : 'dark'
}

export function useColorMode(): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>(readColorMode)

  useEffect(() => {
    const sync = () => setMode(readColorMode())
    sync()

    if (typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-color-mode', 'data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  return mode
}
