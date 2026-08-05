import { describe, expect, it } from 'vitest'

import {
  SCENE_PALETTES,
  buildRampTextureData,
  hexToRgb,
  hexToUnit,
  rampFor,
  sampleRamp,
  toCssGradient,
} from './palette'

describe('colour ramps', () => {
  it('reproduces the authored endpoints exactly', () => {
    for (const theme of ['dark', 'light'] as const) {
      for (const mode of ['potential', 'magnitude'] as const) {
        const stops = rampFor(theme, mode)
        expect(sampleRamp(stops, 0)).toEqual(hexToRgb(stops[0].color))
        expect(sampleRamp(stops, 1)).toEqual(hexToRgb(stops[stops.length - 1].color))
      }
    }
  })

  it('clamps values outside the domain instead of extrapolating', () => {
    const stops = rampFor('dark', 'potential')
    expect(sampleRamp(stops, -4)).toEqual(sampleRamp(stops, 0))
    expect(sampleRamp(stops, 4)).toEqual(sampleRamp(stops, 1))
  })

  it('interpolates between neighbouring stops', () => {
    const stops = [
      { at: 0, color: '#000000' },
      { at: 1, color: '#ffffff' },
    ]
    expect(sampleRamp(stops, 0.5)).toEqual([128, 128, 128])
  })

  it('runs cold to warm across the diverging potential ramp', () => {
    for (const theme of ['dark', 'light'] as const) {
      const stops = rampFor(theme, 'potential')
      const [coldR, , coldB] = sampleRamp(stops, 0)
      const [warmR, , warmB] = sampleRamp(stops, 1)
      expect(coldB).toBeGreaterThan(coldR)
      expect(warmR).toBeGreaterThan(warmB)
    }
  })

  it('keeps the two ramps and the two themes distinct', () => {
    expect(rampFor('dark', 'potential')).not.toBe(rampFor('dark', 'magnitude'))
    expect(rampFor('dark', 'potential')).not.toBe(rampFor('light', 'potential'))
  })
})

describe('lookup texture', () => {
  it('produces opaque RGBA bytes of the requested length', () => {
    const data = buildRampTextureData(rampFor('dark', 'potential'), 64)
    expect(data).toBeInstanceOf(Uint8Array)
    expect(data).toHaveLength(64 * 4)
    for (let index = 3; index < data.length; index += 4) expect(data[index]).toBe(255)
  })

  it('starts and ends on the ramp endpoints', () => {
    const stops = rampFor('light', 'magnitude')
    const data = buildRampTextureData(stops, 32)
    expect([data[0], data[1], data[2]]).toEqual(hexToRgb(stops[0].color))
    expect([data[124], data[125], data[126]]).toEqual(hexToRgb(stops[stops.length - 1].color))
  })
})

describe('colour helpers', () => {
  it('parses hex into bytes and unit components', () => {
    expect(hexToRgb('#3ba6e8')).toEqual([59, 166, 232])
    const [r, g, b] = hexToUnit('#ffffff')
    expect(r).toBe(1)
    expect(g).toBe(1)
    expect(b).toBe(1)
  })

  it('builds a CSS gradient carrying every stop', () => {
    const stops = rampFor('dark', 'potential')
    const gradient = toCssGradient(stops)
    expect(gradient.startsWith('linear-gradient(90deg,')).toBe(true)
    for (const stop of stops) expect(gradient).toContain(stop.color)
  })
})

describe('scene palettes', () => {
  it('defines both themes with legal opacity values', () => {
    for (const theme of ['dark', 'light'] as const) {
      const palette = SCENE_PALETTES[theme]
      for (const key of ['ambient', 'floorOpacity', 'gridOpacity', 'glowOpacity'] as const) {
        expect(palette[key]).toBeGreaterThanOrEqual(0)
        expect(palette[key]).toBeLessThanOrEqual(1)
      }
      for (const key of [
        'positive',
        'negative',
        'positiveCore',
        'negativeCore',
        'surfaceGrid',
        'floorGrid',
        'axisX',
        'axisY',
      ] as const) {
        expect(palette[key]).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('drops additive glow in light mode, where it would be invisible', () => {
    expect(SCENE_PALETTES.dark.additiveGlow).toBe(true)
    expect(SCENE_PALETTES.light.additiveGlow).toBe(false)
    expect(SCENE_PALETTES.light.ambient).toBeGreaterThan(SCENE_PALETTES.dark.ambient)
  })
})
