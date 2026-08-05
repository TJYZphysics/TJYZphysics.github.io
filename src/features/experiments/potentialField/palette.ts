/**
 * Colour ramps and scene palettes for the potential-surface lab.
 *
 * Deliberately free of any three.js import: the same stops feed the GPU lookup
 * texture and the HTML legend swatch, so the bar under the canvas is guaranteed
 * to describe the surface above it.
 *
 * Colours are authored and consumed in sRGB. The scene shaders write those
 * values straight to the framebuffer without a colour-space include, so what is
 * written here is exactly what lands on screen.
 */

import type { FieldMode } from './field'

export type ThemeMode = 'dark' | 'light'

export interface RampStop {
  /** Position along the ramp, 0 to 1. */
  at: number
  color: string
}

/**
 * Diverging ramps for the potential: cold valley, uncoloured neutral plane,
 * warm peak. The midpoint is a desaturated slate on purpose — undisturbed
 * regions should read as "no field here", not as part of the heat scale.
 */
const POTENTIAL_RAMP: Record<ThemeMode, readonly RampStop[]> = {
  dark: [
    { at: 0, color: '#0b2a93' },
    { at: 0.15, color: '#1a5ccb' },
    { at: 0.32, color: '#3ba6e8' },
    { at: 0.44, color: '#6d8fb0' },
    { at: 0.5, color: '#6f7a8e' },
    { at: 0.56, color: '#a8827a' },
    { at: 0.68, color: '#ee9448' },
    { at: 0.85, color: '#fd5c35' },
    { at: 1, color: '#d4180f' },
  ],
  light: [
    { at: 0, color: '#062b7f' },
    { at: 0.15, color: '#1257ab' },
    { at: 0.32, color: '#2b93bd' },
    { at: 0.44, color: '#97a9ba' },
    { at: 0.5, color: '#aab6c2' },
    { at: 0.56, color: '#cbab93' },
    { at: 0.68, color: '#dd8f33' },
    { at: 0.85, color: '#c94e22' },
    { at: 1, color: '#9c1108' },
  ],
}

/** Field magnitude is never negative, so this ramp is sequential rather than diverging. */
const MAGNITUDE_RAMP: Record<ThemeMode, readonly RampStop[]> = {
  dark: [
    { at: 0, color: '#0f1c38' },
    { at: 0.2, color: '#22539f' },
    { at: 0.42, color: '#2f9ecb' },
    { at: 0.62, color: '#efc258' },
    { at: 0.82, color: '#f76f36' },
    { at: 1, color: '#ffd9b8' },
  ],
  light: [
    { at: 0, color: '#dde5ec' },
    { at: 0.2, color: '#7aa9cd' },
    { at: 0.42, color: '#2a8cb2' },
    { at: 0.62, color: '#d79c2c' },
    { at: 0.82, color: '#c14f22' },
    { at: 1, color: '#75120a' },
  ],
}

export function rampFor(theme: ThemeMode, mode: FieldMode): readonly RampStop[] {
  return mode === 'potential' ? POTENTIAL_RAMP[theme] : MAGNITUDE_RAMP[theme]
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** Hex to 0..1 components, ready to drop into a `vec3` uniform. */
export function hexToUnit(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  return [r / 255, g / 255, b / 255]
}

/** Linear interpolation between the surrounding stops. */
export function sampleRamp(stops: readonly RampStop[], t: number): [number, number, number] {
  const position = Math.min(1, Math.max(0, t))
  if (position <= stops[0].at) return hexToRgb(stops[0].color)

  for (let index = 1; index < stops.length; index += 1) {
    const upper = stops[index]
    if (position > upper.at) continue
    const lower = stops[index - 1]
    const span = upper.at - lower.at
    const amount = span <= 0 ? 0 : (position - lower.at) / span
    const from = hexToRgb(lower.color)
    const to = hexToRgb(upper.color)
    return [
      Math.round(from[0] + (to[0] - from[0]) * amount),
      Math.round(from[1] + (to[1] - from[1]) * amount),
      Math.round(from[2] + (to[2] - from[2]) * amount),
    ]
  }

  return hexToRgb(stops[stops.length - 1].color)
}

/** RGBA bytes for a 1-D lookup texture indexed by the normalized field value. */
export function buildRampTextureData(stops: readonly RampStop[], size = 256) {
  const data = new Uint8Array(size * 4)
  for (let index = 0; index < size; index += 1) {
    const [r, g, b] = sampleRamp(stops, index / (size - 1))
    const offset = index * 4
    data[offset] = r
    data[offset + 1] = g
    data[offset + 2] = b
    data[offset + 3] = 255
  }
  return data
}

/** Legend swatch, built from the very same stops the shader samples. */
export function toCssGradient(stops: readonly RampStop[]) {
  const parts = stops.map(({ at, color }) => `${color} ${Math.round(at * 100)}%`)
  return `linear-gradient(90deg, ${parts.join(', ')})`
}

export interface ScenePalette {
  /** Grid lines drawn on the flat reference floor. */
  floorGrid: string
  floorGridStrong: string
  axisX: string
  axisY: string
  /** Grid lines drawn onto the deformed surface. */
  surfaceGrid: string
  surfaceGridStrong: string
  positive: string
  negative: string
  /**
   * Marker cores are deliberately pale in both themes. Charges always sit on an
   * extreme of the ramp — a saturated peak or a dark valley — so a light core
   * reads against every background a marker can land on, while the tinted glow
   * carries the sign.
   */
  positiveCore: string
  negativeCore: string
  stem: string
  ring: string
  ringSelected: string
  label: string
  /** Constant term in the surface shading; higher keeps light mode from going muddy. */
  ambient: number
  floorOpacity: number
  gridOpacity: number
  glowOpacity: number
  /** Additive glow reads as light on dark, but vanishes on a pale backdrop. */
  additiveGlow: boolean
}

export const SCENE_PALETTES: Record<ThemeMode, ScenePalette> = {
  dark: {
    floorGrid: '#6f92cf',
    floorGridStrong: '#9dc4f5',
    axisX: '#ff8a6b',
    axisY: '#7fe0ff',
    surfaceGrid: '#cdeaff',
    surfaceGridStrong: '#f2fcff',
    positive: '#ff6a4d',
    negative: '#4ea6ff',
    positiveCore: '#ffdccd',
    negativeCore: '#d5e9ff',
    stem: '#a9c6ef',
    ring: '#8fb4e0',
    ringSelected: '#ffffff',
    label: '#c6d8f2',
    ambient: 0.3,
    floorOpacity: 0.42,
    gridOpacity: 0.62,
    glowOpacity: 0.85,
    additiveGlow: true,
  },
  light: {
    floorGrid: '#3d6a90',
    floorGridStrong: '#1d4c6c',
    axisX: '#c0432a',
    axisY: '#0f6f88',
    surfaceGrid: '#123a4d',
    surfaceGridStrong: '#05202c',
    positive: '#cf3418',
    negative: '#1361c0',
    positiveCore: '#ffe2d4',
    negativeCore: '#dcecff',
    stem: '#3c5a70',
    ring: '#4a6c85',
    ringSelected: '#0d2b3a',
    label: '#254050',
    ambient: 0.54,
    floorOpacity: 0.34,
    gridOpacity: 0.5,
    glowOpacity: 0.42,
    additiveGlow: false,
  },
}
