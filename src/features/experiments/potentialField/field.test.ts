import { describe, expect, it } from 'vitest'

import {
  CHARGE_LIMIT,
  FIELD_PRESETS,
  MAX_CHARGES,
  PLACEMENT_LIMIT,
  SOFTENING,
  SURFACE_AMPLITUDE,
  clampCharge,
  clampCoordinate,
  clampHeightScale,
  createCharge,
  evaluateField,
  evaluateFieldVector,
  evaluatePotential,
  formatSigned,
  instantiatePreset,
  softSaturate,
  summarizeField,
  surfaceHeight,
} from './field'

describe('potential field maths', () => {
  it('superposes independent charges', () => {
    const left = createCharge(-2, 0, 1)
    const right = createCharge(2, 0, -1.5)
    expect(evaluatePotential([left, right], 0.7, 1.3)).toBeCloseTo(
      evaluatePotential([left], 0.7, 1.3) + evaluatePotential([right], 0.7, 1.3),
      12,
    )
  })

  it('cancels to zero on a dipole bisector', () => {
    const dipole = [createCharge(0, -2.5, 2), createCharge(0, 2.5, -2)]
    expect(evaluatePotential(dipole, 0, 0)).toBeCloseTo(0, 12)
    expect(evaluatePotential(dipole, 3.4, 0)).toBeCloseTo(0, 12)
  })

  it('replaces the singularity with a finite softened peak', () => {
    const charge = createCharge(0, 0, 2)
    // The softened law is q / sqrt(r^2 + SOFTENING); at r = 0 that is q / sqrt(SOFTENING).
    expect(evaluatePotential([charge], 0, 0)).toBeCloseTo(2 / Math.sqrt(SOFTENING), 12)
    expect(Number.isFinite(evaluatePotential([charge], 0, 0))).toBe(true)
  })

  it('falls off with distance and follows the sign of the charge', () => {
    const positive = [createCharge(0, 0, 1)]
    const negative = [createCharge(0, 0, -1)]
    expect(evaluatePotential(positive, 1, 0)).toBeGreaterThan(evaluatePotential(positive, 2, 0))
    expect(evaluatePotential(positive, 2, 0)).toBeGreaterThan(0)
    expect(evaluatePotential(negative, 2, 0)).toBeLessThan(0)
  })

  it('points the field away from a positive charge and inward for a negative one', () => {
    const outward = evaluateFieldVector([createCharge(0, 0, 1)], 1.5, 0)
    expect(outward.x).toBeGreaterThan(0)
    expect(outward.y).toBeCloseTo(0, 12)

    const inward = evaluateFieldVector([createCharge(0, 0, -1)], 1.5, 0)
    expect(inward.x).toBeLessThan(0)
  })

  it('reports magnitude as a non-negative scalar', () => {
    const charges = [createCharge(-1.5, 0, 2), createCharge(1.5, 0, -2)]
    for (const [x, y] of [
      [0, 0],
      [-1.5, 0],
      [3, 2.5],
      [-4, -4],
    ]) {
      expect(evaluateField(charges, x, y, 'magnitude')).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns zero everywhere with no charges', () => {
    expect(evaluatePotential([], 1, 2)).toBe(0)
    expect(evaluateField([], 1, 2, 'magnitude')).toBe(0)
  })
})

describe('softSaturate', () => {
  it('is odd, bounded and monotonic', () => {
    expect(softSaturate(0)).toBeCloseTo(0, 12)
    expect(softSaturate(1.4)).toBeCloseTo(-softSaturate(-1.4), 12)
    expect(softSaturate(2)).toBeGreaterThan(softSaturate(1))
    for (const value of [-1e6, -12, -1, 0, 1, 12, 1e6]) {
      expect(Math.abs(softSaturate(value))).toBeLessThanOrEqual(1)
      expect(Number.isFinite(softSaturate(value))).toBe(true)
    }
  })

  it('keeps the surface inside the amplitude no matter how large the field is', () => {
    const charges = [createCharge(0, 0, CHARGE_LIMIT)]
    const height = surfaceHeight(charges, 0, 0, 'potential', 10)
    expect(Math.abs(height)).toBeLessThanOrEqual(SURFACE_AMPLITUDE)
  })
})

describe('input clamping', () => {
  it('keeps coordinates inside the placement box', () => {
    expect(clampCoordinate(99)).toBe(PLACEMENT_LIMIT)
    expect(clampCoordinate(-99)).toBe(-PLACEMENT_LIMIT)
    expect(clampCoordinate(1.23456)).toBe(1.23)
    expect(clampCoordinate(Number.NaN)).toBe(0)
    expect(Object.is(clampCoordinate(-0.001), 0)).toBe(true)
  })

  it('keeps charge magnitude inside the allowed range', () => {
    expect(clampCharge(50)).toBe(CHARGE_LIMIT)
    expect(clampCharge(-50)).toBe(-CHARGE_LIMIT)
    expect(clampCharge(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('keeps the height scale inside the slider range', () => {
    expect(clampHeightScale(0)).toBeGreaterThan(0)
    expect(clampHeightScale(99)).toBeLessThanOrEqual(3)
  })
})

describe('charges and presets', () => {
  it('gives every charge a distinct id and clamped values', () => {
    const first = createCharge(99, -99, 99)
    const second = createCharge(0, 0, -1)
    expect(first.id).not.toBe(second.id)
    expect(first.x).toBe(PLACEMENT_LIMIT)
    expect(first.y).toBe(-PLACEMENT_LIMIT)
    expect(first.q).toBe(CHARGE_LIMIT)
  })

  it('ships presets that fit the shader uniform array and the placement box', () => {
    expect(FIELD_PRESETS.length).toBeGreaterThan(0)
    for (const preset of FIELD_PRESETS) {
      expect(preset.charges.length).toBeLessThanOrEqual(MAX_CHARGES)
      const instantiated = instantiatePreset(preset)
      expect(instantiated).toHaveLength(preset.charges.length)
      for (const charge of instantiated) {
        expect(Math.abs(charge.x)).toBeLessThanOrEqual(PLACEMENT_LIMIT)
        expect(Math.abs(charge.y)).toBeLessThanOrEqual(PLACEMENT_LIMIT)
        expect(Math.abs(charge.q)).toBeLessThanOrEqual(CHARGE_LIMIT)
        expect(charge.q).not.toBe(0)
      }
      expect(new Set(instantiated.map((charge) => charge.id)).size).toBe(instantiated.length)
    }
  })
})

describe('summarizeField', () => {
  it('is all zeros with no charges', () => {
    expect(summarizeField([], 'potential')).toEqual({ netCharge: 0, peak: 0, valley: 0 })
  })

  it('adds up the net charge and finds both extremes of a dipole', () => {
    const summary = summarizeField([createCharge(0, -2.5, 2), createCharge(0, 2.5, -3)], 'potential')
    expect(summary.netCharge).toBeCloseTo(-1, 12)
    expect(summary.peak).toBeGreaterThan(0)
    expect(summary.valley).toBeLessThan(0)
  })

  it('never reports a negative valley for field magnitude', () => {
    const summary = summarizeField([createCharge(1, 1, 2), createCharge(-1, -1, -2)], 'magnitude')
    expect(summary.valley).toBeGreaterThanOrEqual(0)
    expect(summary.peak).toBeGreaterThanOrEqual(summary.valley)
  })
})

describe('formatSigned', () => {
  it('marks positives and avoids negative zero', () => {
    expect(formatSigned(2)).toBe('+2.00')
    expect(formatSigned(-1.5)).toBe('-1.50')
    expect(formatSigned(-0.001)).toBe('0.00')
  })
})
