import { useEffect, useState } from 'react'

export type OpticalColorMode = 'dark' | 'light'

export function readOpticalColorMode(): OpticalColorMode {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.dataset.colorMode === 'light' ? 'light' : 'dark'
}

export function useOpticalColorMode(): OpticalColorMode {
  const [colorMode, setColorMode] = useState<OpticalColorMode>(readOpticalColorMode)

  useEffect(() => {
    const syncColorMode = () => setColorMode(readOpticalColorMode())
    syncColorMode()

    if (typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(syncColorMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-color-mode', 'data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  return colorMode
}
