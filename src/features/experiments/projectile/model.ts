export const PROJECTILE_HEIGHT = 20

export interface ProjectileParameters {
  initialSpeed: number
  gravity: number
  height?: number
}

export interface ProjectileState {
  time: number
  x: number
  y: number
  vx: number
  vy: number
  landed: boolean
}

function positive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function flightTime(gravity: number, height = PROJECTILE_HEIGHT) {
  const safeGravity = positive(gravity, 9.8)
  const safeHeight = positive(height, PROJECTILE_HEIGHT)
  return Math.sqrt((2 * safeHeight) / safeGravity)
}

export function horizontalRange(initialSpeed: number, gravity: number, height = PROJECTILE_HEIGHT) {
  return Math.max(0, initialSpeed) * flightTime(gravity, height)
}

export function projectileStateAtTime(
  time: number,
  { initialSpeed, gravity, height = PROJECTILE_HEIGHT }: ProjectileParameters,
): ProjectileState {
  const safeGravity = positive(gravity, 9.8)
  const safeHeight = positive(height, PROJECTILE_HEIGHT)
  const safeSpeed = Math.max(0, Number.isFinite(initialSpeed) ? initialSpeed : 0)
  const landingTime = flightTime(safeGravity, safeHeight)
  const clampedTime = Math.min(Math.max(Number.isFinite(time) ? time : 0, 0), landingTime)
  const landed = clampedTime >= landingTime

  return {
    time: clampedTime,
    x: safeSpeed * clampedTime,
    y: landed ? 0 : safeHeight - 0.5 * safeGravity * clampedTime * clampedTime,
    vx: safeSpeed,
    vy: -safeGravity * clampedTime,
    landed,
  }
}

export function equalTimeSamples(
  parameters: ProjectileParameters,
  sampleCount = 13,
): ProjectileState[] {
  const count = Math.max(2, Math.floor(sampleCount))
  const duration = flightTime(parameters.gravity, parameters.height)

  return Array.from({ length: count }, (_, index) => (
    projectileStateAtTime((duration * index) / (count - 1), parameters)
  ))
}
