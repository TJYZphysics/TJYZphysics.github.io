import { describe, expect, it } from 'vitest'

import { calculateTrajectoryPositions, solveCollision } from './collision'

describe('solveCollision', () => {
  it('exchanges velocities for an equal-mass elastic collision', () => {
    const result = solveCollision({
      massA: 1,
      massB: 1,
      velocityA: 2,
      velocityB: 0,
      restitution: 1,
    })

    expect(result.finalVelocityA).toBeCloseTo(0)
    expect(result.finalVelocityB).toBeCloseTo(2)
    expect(result.energyDelta).toBeCloseTo(0)
  })

  it('transfers velocity according to mass in an unequal elastic collision', () => {
    const result = solveCollision({
      massA: 2,
      massB: 1,
      velocityA: 3,
      velocityB: 0,
      restitution: 1,
    })

    expect(result.finalVelocityA).toBeCloseTo(1)
    expect(result.finalVelocityB).toBeCloseTo(4)
    expect(result.energyDelta).toBeCloseTo(0)
  })

  it('gives both bodies their shared center-of-mass velocity when perfectly inelastic', () => {
    const result = solveCollision({
      massA: 3,
      massB: 1,
      velocityA: 2,
      velocityB: -2,
      restitution: 0,
    })

    expect(result.finalVelocityA).toBeCloseTo(1)
    expect(result.finalVelocityB).toBeCloseTo(1)
    expect(result.energyDelta).toBeCloseTo(-6)
  })

  it('conserves total momentum for a general collision', () => {
    const result = solveCollision({
      massA: 2.4,
      massB: 4.1,
      velocityA: 3.2,
      velocityB: -1.3,
      restitution: 0.63,
    })

    expect(result.finalMomentum).toBeCloseTo(result.initialMomentum, 10)
    expect(result.momentumDelta).toBeCloseTo(0, 10)
  })

  it('can send equal masses in opposite directions after a head-on elastic collision', () => {
    const result = solveCollision({ massA: 1, massB: 1, velocityA: 2, velocityB: -1, restitution: 1 })
    expect(result.finalVelocityA).toBeCloseTo(-1)
    expect(result.finalVelocityB).toBeCloseTo(2)
  })

  it('moves both bodies right before a same-direction rightward catch-up collision', () => {
    const start = calculateTrajectoryPositions({ progress: 0, collisionPoint: 0.5, contactA: 48, contactB: 52, velocityA: 3, velocityB: 1, finalVelocityA: 1, finalVelocityB: 3 })
    const later = calculateTrajectoryPositions({ progress: 0.25, collisionPoint: 0.5, contactA: 48, contactB: 52, velocityA: 3, velocityB: 1, finalVelocityA: 1, finalVelocityB: 3 })
    expect(later.positionA).toBeGreaterThan(start.positionA)
    expect(later.positionB).toBeGreaterThan(start.positionB)
  })

  it('moves both bodies left before a same-direction leftward catch-up collision', () => {
    const start = calculateTrajectoryPositions({ progress: 0, collisionPoint: 0.5, contactA: 48, contactB: 52, velocityA: -1, velocityB: -3, finalVelocityA: -3, finalVelocityB: -1 })
    const later = calculateTrajectoryPositions({ progress: 0.25, collisionPoint: 0.5, contactA: 48, contactB: 52, velocityA: -1, velocityB: -3, finalVelocityA: -3, finalVelocityB: -1 })
    expect(later.positionA).toBeLessThan(start.positionA)
    expect(later.positionB).toBeLessThan(start.positionB)
  })

  it('uses each final velocity sign after collision', () => {
    const contact = calculateTrajectoryPositions({ progress: 0.5, collisionPoint: 0.5, contactA: 48, contactB: 52, velocityA: 3.5, velocityB: -1.2, finalVelocityA: -1.63, finalVelocityB: 2.22 })
    const after = calculateTrajectoryPositions({ progress: 0.75, collisionPoint: 0.5, contactA: 48, contactB: 52, velocityA: 3.5, velocityB: -1.2, finalVelocityA: -1.63, finalVelocityB: 2.22 })
    expect(after.positionA).toBeLessThan(contact.positionA)
    expect(after.positionB).toBeGreaterThan(contact.positionB)
  })
})
