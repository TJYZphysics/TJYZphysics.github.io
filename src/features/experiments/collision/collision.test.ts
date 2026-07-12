import { describe, expect, it } from 'vitest'

import { solveCollision } from './collision'

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
})
