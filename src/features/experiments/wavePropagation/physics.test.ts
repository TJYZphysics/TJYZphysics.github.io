import { describe, expect, it } from 'vitest'
import {
  createWaveField,
  doubleSlitRelativeIntensity,
  sampleReceiverProfile,
  singleSlitRelativeIntensity,
  waveSpeed,
} from './physics'

function farRowMagnitudeAtX(field: ReturnType<typeof createWaveField>, worldX: number) {
  const column = Math.round(((worldX + field.width / 2) / field.width) * (field.columns - 1))
  const boundedColumn = Math.min(field.columns - 1, Math.max(0, column))
  return field.magnitude[(field.rows - 1) * field.columns + boundedColumn]
}

describe('wave propagation physics', () => {
  it('keeps c = fλ', () => {
    expect(waveSpeed(1.5, 2.4)).toBeCloseTo(3.6, 12)
  })

  it('places the first single-slit minimum at a sin θ = λ', () => {
    const angle = Math.asin(1 / 4)
    expect(singleSlitRelativeIntensity(angle, 4, 1)).toBeLessThan(1e-12)
  })

  it('reproduces the missing order for a=2 m, d=4 m, λ=1 m', () => {
    const angle = Math.asin(0.5)
    expect(doubleSlitRelativeIntensity(angle, 2, 4, 1)).toBeLessThan(1e-12)
  })

  it('keeps a symmetric double-source field symmetric about the center line', () => {
    const field = createWaveField({
      mode: 'double-source',
      amplitude: 0.2,
      wavelength: 2,
      pointSpacing: 4,
      slitWidth: 2,
      slitSpacing: 4,
      sourceDistance: 5,
      columns: 31,
      rows: 20,
    })
    for (let row = 0; row < field.rows; row += 1) {
      for (let column = 0; column < Math.floor(field.columns / 2); column += 1) {
        const left = row * field.columns + column
        const right = row * field.columns + (field.columns - 1 - column)
        expect(field.real[left]).toBeCloseTo(field.real[right], 5)
        expect(field.imaginary[left]).toBeCloseTo(field.imaginary[right], 5)
      }
    }
  })

  it('preserves physical amplitude changes under a fixed display reference', () => {
    const base = {
      mode: 'double-source' as const,
      wavelength: 2,
      pointSpacing: 4,
      slitWidth: 2,
      slitSpacing: 4,
      sourceDistance: 5,
      columns: 24,
      rows: 24,
    }
    const low = createWaveField({ ...base, amplitude: 0.1 })
    const high = createWaveField({ ...base, amplitude: 0.5 })
    expect(high.maxMagnitude / low.maxMagnitude).toBeCloseTo(5, 5)
    expect(high.unitAmplitudeMagnitude).toBeCloseTo(low.unitAmplitudeMagnitude, 5)
  })

  it('uses the displayed source distance without silently clamping it to λ', () => {
    const base = {
      mode: 'single-slit' as const,
      amplitude: 0.2,
      wavelength: 4.5,
      pointSpacing: 4,
      slitWidth: 2,
      slitSpacing: 4,
      columns: 25,
      rows: 25,
    }
    const near = createWaveField({ ...base, sourceDistance: 2 })
    const far = createWaveField({ ...base, sourceDistance: 4.5 })
    const difference = near.real.reduce((sum, value, index) => sum + Math.abs(value - far.real[index]), 0)
    expect(difference).toBeGreaterThan(0.01)
  })

  it('produces a symmetric single-slit field with a stronger far-axis center than its edge', () => {
    const field = createWaveField({
      mode: 'single-slit',
      amplitude: 0.2,
      wavelength: 2,
      pointSpacing: 4,
      slitWidth: 4,
      slitSpacing: 6,
      sourceDistance: 8,
      columns: 61,
      rows: 52,
    })
    const row = field.rows - 1
    const center = row * field.columns + Math.floor(field.columns / 2)
    const edge = row * field.columns
    expect(field.magnitude[center]).toBeGreaterThan(field.magnitude[edge])
    for (let column = 0; column < Math.floor(field.columns / 2); column += 1) {
      const left = row * field.columns + column
      const right = row * field.columns + (field.columns - 1 - column)
      expect(field.magnitude[left]).toBeCloseTo(field.magnitude[right], 4)
    }
  })

  it('places the actual single-slit far-field minimum near a sin θ = λ', () => {
    const wavelength = 2
    const slitWidth = 4
    const field = createWaveField({
      mode: 'single-slit',
      amplitude: 0.2,
      wavelength,
      pointSpacing: 4,
      slitWidth,
      slitSpacing: 6,
      sourceDistance: 100,
      columns: 121,
      rows: 72,
    })
    const observationDistance = field.depth - (field.barrierZ ?? 0)
    const firstMinimumX = observationDistance * Math.tan(Math.asin(wavelength / slitWidth))
    const center = farRowMagnitudeAtX(field, 0)
    const minimum = farRowMagnitudeAtX(field, firstMinimumX)
    expect(minimum / center).toBeLessThan(0.34)
  })

  it('produces actual double-slit bright and dark fringes whose spacing shrinks as separation grows', () => {
    const makeField = (slitSpacing: number) => createWaveField({
      mode: 'double-slit',
      amplitude: 0.2,
      wavelength: 2,
      pointSpacing: 4,
      slitWidth: 1,
      slitSpacing,
      sourceDistance: 100,
      columns: 161,
      rows: 72,
    })
    const field4 = makeField(4)
    const field6 = makeField(6)
    const distance4 = field4.depth - (field4.barrierZ ?? 0)
    const distance6 = field6.depth - (field6.barrierZ ?? 0)
    const firstBright4 = distance4 * Math.tan(Math.asin(2 / 4))
    const firstDark4 = distance4 * Math.tan(Math.asin(1 / 4))
    const firstBright6 = distance6 * Math.tan(Math.asin(2 / 6))
    const firstDark6 = distance6 * Math.tan(Math.asin(1 / 6))

    const bright4 = farRowMagnitudeAtX(field4, firstBright4)
    const dark4 = farRowMagnitudeAtX(field4, firstDark4)
    const bright6 = farRowMagnitudeAtX(field6, firstBright6)
    const dark6 = farRowMagnitudeAtX(field6, firstDark6)

    expect(firstBright6).toBeLessThan(firstBright4)
    expect(bright4 / dark4).toBeGreaterThan(1.5)
    expect(bright6 / dark6).toBeGreaterThan(1.5)
    expect(farRowMagnitudeAtX(field4, -firstBright4)).toBeCloseTo(bright4, 3)
    expect(farRowMagnitudeAtX(field6, -firstBright6)).toBeCloseTo(bright6, 3)
  })

  it('samples a receiver screen at the requested propagation distance', () => {
    const field = createWaveField({
      mode: 'double-source',
      amplitude: 0.2,
      wavelength: 2,
      pointSpacing: 4,
      slitWidth: 1,
      slitSpacing: 4,
      sourceDistance: 5,
      columns: 32,
      rows: 32,
    })
    const profile = sampleReceiverProfile(field, 6, 0.25, 1)
    expect(profile.distance).toBe(6)
    expect(profile.screenZ).toBeCloseTo(field.sourcePositions[0].z + 6, 5)
    expect(profile.x).toHaveLength(field.columns)
    expect(profile.instantaneous).toHaveLength(field.columns)
    expect(profile.rmsEnvelope.every((value) => value >= 0)).toBe(true)
    expect(profile.averageAmplitude).toBeGreaterThan(0)
    expect(profile.instantaneousAmplitude).toBeGreaterThan(0)
  })
})
