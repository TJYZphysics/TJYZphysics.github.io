import { describe, expect, it } from 'vitest'

import {
  initialVelocity,
  positionDomain,
  predictFirstMeeting,
  simulationDuration,
  stateAt,
  velocityDomain,
  type VehicleParameters,
} from './model'

const vehicle = (
  initialPosition: number,
  speed: number,
  direction: -1 | 1,
  acceleration: number,
): VehicleParameters => ({ initialPosition, speed, direction, acceleration })

describe('pursuit constant-acceleration model', () => {
  it('uses the direction to produce a signed initial velocity', () => {
    expect(initialVelocity(vehicle(0, 8, 1, 0))).toBe(8)
    expect(initialVelocity(vehicle(0, 8, -1, 0))).toBe(-8)
  })

  it('evaluates position and velocity analytically', () => {
    const state = stateAt(vehicle(3, 4, 1, 2), 5)
    expect(state.position).toBeCloseTo(48)
    expect(state.velocity).toBeCloseTo(14)
  })

  it('predicts a constant-speed catch-up meeting', () => {
    const meeting = predictFirstMeeting(
      vehicle(0, 10, 1, 0),
      vehicle(50, 5, 1, 0),
    )
    expect(meeting?.time).toBeCloseTo(10)
    expect(meeting?.position).toBeCloseTo(100)
  })

  it('predicts a meeting when the pursuer accelerates from rest', () => {
    const meeting = predictFirstMeeting(
      vehicle(0, 0, 1, 2),
      vehicle(24, 0, 1, 0),
    )
    expect(meeting?.time).toBeCloseTo(Math.sqrt(24))
    expect(meeting?.position).toBeCloseTo(24)
  })

  it('returns no meeting when equal velocities preserve the separation', () => {
    expect(predictFirstMeeting(
      vehicle(0, 5, 1, 1),
      vehicle(30, 5, 1, 1),
    )).toBeNull()
  })

  it('chooses the first non-negative root when acceleration creates two crossings', () => {
    const meeting = predictFirstMeeting(
      vehicle(0, 10, 1, -2),
      vehicle(8, 0, 1, 0),
    )
    expect(meeting?.time).toBeCloseTo(5 - Math.sqrt(17))
    expect(meeting?.position).toBeCloseTo(8)
  })

  it('includes a turning point when calculating the position range', () => {
    const turningVehicle = vehicle(0, 10, 1, -2)
    const domain = positionDomain([turningVehicle], 10)
    expect(domain.max).toBeGreaterThan(25)
    expect(domain.min).toBeLessThanOrEqual(0)
  })

  it('keeps zero visible in the velocity graph and gives short meetings readable time', () => {
    const domain = velocityDomain([vehicle(0, 3, 1, -1)], 10)
    expect(domain.min).toBeLessThan(0)
    expect(domain.max).toBeGreaterThan(0)
    expect(simulationDuration({ time: 1, position: 10 })).toBe(8)
  })

  it('rejects invalid physical inputs', () => {
    expect(() => stateAt(vehicle(0, -1, 1, 0), 1)).toThrow(RangeError)
    expect(() => stateAt(vehicle(0, 1, 1, 0), -1)).toThrow(RangeError)
  })
})
