import { useEffect, useState } from 'react'

export type ThemeMode = 'dark' | 'light'

/**
 * Cobalt-aerospace light palette (A02 spec from light-theme-demo.html).
 *
 * These hex values mirror the `html[data-color-mode='light']` semantic CSS
 * variables in `src/styles/global.css`. Non-CSS renderers (Canvas 2D, WebGL,
 * Three.js, Phaser, SVG) pull their light colours from here so the palette has
 * a single source of truth. The dark branch is intentionally left out — dark
 * renderers keep their original in-feature palettes (frozen).
 */
export const LIGHT_TOKENS = {
  /** --bg page */
  bg: '#f4f5f8',
  /** --surface */
  surface: '#fdfdff',
  /** --section-bg */
  section: '#e8e9ec',
  /** --ink body text */
  ink: '#171a22',
  /** --accent / --cyan cobalt primary */
  accent: '#2453c7',
  /** --accent-strong */
  accentStrong: '#2146a3',
  /** --accent-soft */
  accentSoft: '#e3e9f8',
  /** --line */
  line: '#cdd1db',
  /** --muted secondary text */
  muted: '#606269',
  /** --on-accent */
  onAccent: '#fffefa',
  /** --blue secondary cobalt (field) */
  blue: '#3159b8',
  shadow: 'rgba(23, 26, 34, .12)',
  shadowSoft: 'rgba(23, 26, 34, .07)',
  /** Scientific semantic colours stay independent of the interface accent. */
  positive: '#c0473a',
  negative: '#4e43a0',
  success: '#287255',
  warning: '#986416',
  danger: '#b43c39',
  field: '#3159b8',
  code: '#181f2f',
  codeInk: '#f8f9fe',
} as const

export type LightTokenName = keyof typeof LIGHT_TOKENS

/** Whether the site is currently in light mode. Dark is the cold-load default. */
export function readThemeMode(): ThemeMode {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.dataset.colorMode === 'light' ? 'light' : 'dark'
}

/** Resolve a CSS custom property value off <html> (already calculated). */
export function readCssToken(name: string, fallback = ''): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/**
 * Track the site colour mode for code that cannot use CSS.
 *
 * `SiteHeader` writes `data-color-mode` (and `data-theme`) onto <html> in a
 * layout effect and emits no event, so a MutationObserver is the only channel
 * available. Components re-render on toggle and can repaint immediately without
 * a page reload.
 */
export function useThemeMode(): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>(readThemeMode)

  useEffect(() => {
    const sync = () => setMode(readThemeMode())
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

export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** Hex to 0..1 components, ready to drop into a vec3 uniform. */
export function hexToUnit(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  return [r / 255, g / 255, b / 255]
}

/** Hex plus alpha as an rgba() string. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Linear mix between two hex colours, amount 0..1. */
export function mix(from: string, to: string, amount: number): string {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  const values = a.map((value, index) => Math.round(value + (b[index] - value) * amount))
  return `#${values.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}
