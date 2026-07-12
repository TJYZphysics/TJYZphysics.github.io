export interface CollisionInput {
  massA: number
  massB: number
  velocityA: number
  velocityB: number
  restitution: number
}

export interface CollisionResult {
  finalVelocityA: number
  finalVelocityB: number
  initialMomentum: number
  finalMomentum: number
  momentumDelta: number
  initialKineticEnergy: number
  finalKineticEnergy: number
  energyDelta: number
}

export function solveCollision(input: CollisionInput): CollisionResult {
  const { massA, massB, velocityA, velocityB, restitution } = input

  if (!Number.isFinite(massA) || !Number.isFinite(massB) || massA <= 0 || massB <= 0) {
    throw new RangeError('Masses must be positive finite numbers.')
  }

  if (!Number.isFinite(velocityA) || !Number.isFinite(velocityB)) {
    throw new RangeError('Velocities must be finite numbers.')
  }

  if (!Number.isFinite(restitution) || restitution < 0 || restitution > 1) {
    throw new RangeError('Restitution must be between 0 and 1.')
  }

  const totalMass = massA + massB
  const relativeVelocity = velocityA - velocityB
  const initialMomentum = massA * velocityA + massB * velocityB
  const initialKineticEnergy =
    0.5 * massA * velocityA ** 2 + 0.5 * massB * velocityB ** 2

  const finalVelocityA =
    (initialMomentum - massB * restitution * relativeVelocity) / totalMass
  const finalVelocityB =
    (initialMomentum + massA * restitution * relativeVelocity) / totalMass

  const finalMomentum = massA * finalVelocityA + massB * finalVelocityB
  const finalKineticEnergy =
    0.5 * massA * finalVelocityA ** 2 + 0.5 * massB * finalVelocityB ** 2

  return {
    finalVelocityA,
    finalVelocityB,
    initialMomentum,
    finalMomentum,
    momentumDelta: finalMomentum - initialMomentum,
    initialKineticEnergy,
    finalKineticEnergy,
    energyDelta: finalKineticEnergy - initialKineticEnergy,
  }
}
