export type Direction = -1 | 1

export interface VehicleParameters {
  initialPosition: number
  speed: number
  direction: Direction
  acceleration: number
}

export interface VehicleState {
  position: number
  velocity: number
}

export interface MeetingPrediction {
  time: number
  position: number
}

export interface ValueDomain {
  min: number
  max: number
}

const EPSILON = 1e-9

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number.`)
  }
}

export function initialVelocity(vehicle: VehicleParameters): number {
  assertFinite(vehicle.speed, 'Speed')
  if (vehicle.speed < 0) throw new RangeError('Speed must not be negative.')
  if (vehicle.direction !== -1 && vehicle.direction !== 1) {
    throw new RangeError('Direction must be -1 or 1.')
  }
  return vehicle.speed * vehicle.direction
}

export function stateAt(vehicle: VehicleParameters, time: number): VehicleState {
  assertFinite(vehicle.initialPosition, 'Initial position')
  assertFinite(vehicle.acceleration, 'Acceleration')
  assertFinite(time, 'Time')
  if (time < 0) throw new RangeError('Time must not be negative.')

  const velocity0 = initialVelocity(vehicle)
  return {
    position:
      vehicle.initialPosition + velocity0 * time + 0.5 * vehicle.acceleration * time ** 2,
    velocity: velocity0 + vehicle.acceleration * time,
  }
}

/**
 * Finds the first non-negative solution of xA(t) = xB(t).
 * Both vehicles follow exact one-dimensional constant-acceleration motion.
 */
export function predictFirstMeeting(
  vehicleA: VehicleParameters,
  vehicleB: VehicleParameters,
  maximumTime = Number.POSITIVE_INFINITY,
): MeetingPrediction | null {
  assertFinite(maximumTime === Number.POSITIVE_INFINITY ? 0 : maximumTime, 'Maximum time')
  if (maximumTime < 0) throw new RangeError('Maximum time must not be negative.')

  const relativePosition = vehicleA.initialPosition - vehicleB.initialPosition
  const relativeVelocity = initialVelocity(vehicleA) - initialVelocity(vehicleB)
  const quadraticCoefficient = 0.5 * (vehicleA.acceleration - vehicleB.acceleration)

  ;[
    vehicleA.initialPosition,
    vehicleB.initialPosition,
    vehicleA.acceleration,
    vehicleB.acceleration,
  ].forEach((value, index) => assertFinite(value, `Vehicle parameter ${index + 1}`))

  let roots: number[] = []

  if (Math.abs(relativePosition) <= EPSILON) {
    roots = [0]
  } else if (Math.abs(quadraticCoefficient) <= EPSILON) {
    if (Math.abs(relativeVelocity) <= EPSILON) return null
    roots = [-relativePosition / relativeVelocity]
  } else {
    const discriminant = relativeVelocity ** 2
      - 4 * quadraticCoefficient * relativePosition
    const tolerance = EPSILON * Math.max(
      1,
      relativeVelocity ** 2,
      Math.abs(4 * quadraticCoefficient * relativePosition),
    )

    if (discriminant < -tolerance) return null
    const squareRoot = Math.sqrt(Math.max(0, discriminant))
    roots = [
      (-relativeVelocity - squareRoot) / (2 * quadraticCoefficient),
      (-relativeVelocity + squareRoot) / (2 * quadraticCoefficient),
    ]
  }

  const time = roots
    .filter((root) => Number.isFinite(root) && root >= -EPSILON && root <= maximumTime + EPSILON)
    .map((root) => Math.max(0, root))
    .sort((left, right) => left - right)[0]

  if (time === undefined) return null

  const stateA = stateAt(vehicleA, time)
  const stateB = stateAt(vehicleB, time)
  return {
    time,
    position: (stateA.position + stateB.position) / 2,
  }
}

function paddedDomain(values: readonly number[], includeZero: boolean): ValueDomain {
  const finiteValues = values.filter(Number.isFinite)
  if (includeZero) finiteValues.push(0)
  if (finiteValues.length === 0) return { min: -1, max: 1 }

  let min = Math.min(...finiteValues)
  let max = Math.max(...finiteValues)
  if (Math.abs(max - min) < EPSILON) {
    const padding = Math.max(1, Math.abs(max) * 0.2)
    return { min: min - padding, max: max + padding }
  }

  const padding = (max - min) * 0.12
  return { min: min - padding, max: max + padding }
}

export function positionDomain(
  vehicles: readonly VehicleParameters[],
  duration: number,
): ValueDomain {
  assertFinite(duration, 'Duration')
  if (duration <= 0) throw new RangeError('Duration must be positive.')

  const values: number[] = []
  vehicles.forEach((vehicle) => {
    values.push(stateAt(vehicle, 0).position, stateAt(vehicle, duration).position)
    if (Math.abs(vehicle.acceleration) > EPSILON) {
      const turningTime = -initialVelocity(vehicle) / vehicle.acceleration
      if (turningTime > 0 && turningTime < duration) {
        values.push(stateAt(vehicle, turningTime).position)
      }
    }
  })
  return paddedDomain(values, false)
}

export function velocityDomain(
  vehicles: readonly VehicleParameters[],
  duration: number,
): ValueDomain {
  assertFinite(duration, 'Duration')
  if (duration <= 0) throw new RangeError('Duration must be positive.')
  return paddedDomain(
    vehicles.flatMap((vehicle) => [stateAt(vehicle, 0).velocity, stateAt(vehicle, duration).velocity]),
    true,
  )
}

export function simulationDuration(prediction: MeetingPrediction | null): number {
  if (!prediction || prediction.time > 28) return 20
  return Math.min(30, Math.max(8, prediction.time + Math.max(1.5, prediction.time * 0.15)))
}
