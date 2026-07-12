export interface Vector {
  x: number
  y: number
}

export interface Body {
  id: string
  name: string
  mass: number
  position: Vector
  velocity: Vector
  color: string
}

export type ThreeBodyPresetKey =
  | 'figure-eight'
  | 'lagrange-triangle'
  | 'binary-companion'

export interface ThreeBodyPresetOption {
  key: ThreeBodyPresetKey
  label: string
  description: string
}

export const THREE_BODY_PRESETS: readonly ThreeBodyPresetOption[] = [
  {
    key: 'figure-eight',
    label: '8 字舞',
    description: '三个等质量天体沿同一条 8 字轨道相互追逐。',
  },
  {
    key: 'lagrange-triangle',
    label: '拉格朗日三角',
    description: '三个等质量天体保持近似等边三角形共同旋转。',
  },
  {
    key: 'binary-companion',
    label: '双星与远伴星',
    description: '一对紧密双星牵引较轻的远方伴星。',
  },
] as const

const MIN_SOFTENING = 1e-6

function cloneBody(body: Body): Body {
  return {
    ...body,
    position: { ...body.position },
    velocity: { ...body.velocity },
  }
}

export function cloneBodies(bodies: readonly Body[]): Body[] {
  return bodies.map(cloneBody)
}

export function centerOfMass(bodies: readonly Body[]): Vector {
  const totalMass = bodies.reduce((sum, body) => sum + body.mass, 0)
  if (!Number.isFinite(totalMass) || totalMass <= 0) {
    return { x: 0, y: 0 }
  }

  return bodies.reduce<Vector>(
    (center, body) => ({
      x: center.x + (body.position.x * body.mass) / totalMass,
      y: center.y + (body.position.y * body.mass) / totalMass,
    }),
    { x: 0, y: 0 },
  )
}

export function totalMomentum(bodies: readonly Body[]): Vector {
  return bodies.reduce<Vector>(
    (momentum, body) => ({
      x: momentum.x + body.mass * body.velocity.x,
      y: momentum.y + body.mass * body.velocity.y,
    }),
    { x: 0, y: 0 },
  )
}

export function isFiniteSystem(bodies: readonly Body[]): boolean {
  return (
    bodies.length > 0 &&
    bodies.every(
      (body) =>
        Number.isFinite(body.mass) &&
        body.mass > 0 &&
        Number.isFinite(body.position.x) &&
        Number.isFinite(body.position.y) &&
        Number.isFinite(body.velocity.x) &&
        Number.isFinite(body.velocity.y),
    )
  )
}

function accelerations(
  bodies: readonly Body[],
  gravity: number,
  softening: number,
): Vector[] {
  const result = bodies.map(() => ({ x: 0, y: 0 }))
  const softenedDistance = Math.max(Math.abs(softening), MIN_SOFTENING)
  const softeningSquared = softenedDistance * softenedDistance

  for (let left = 0; left < bodies.length; left += 1) {
    for (let right = left + 1; right < bodies.length; right += 1) {
      const dx = bodies[right].position.x - bodies[left].position.x
      const dy = bodies[right].position.y - bodies[left].position.y
      const distanceSquared = dx * dx + dy * dy + softeningSquared
      const inverseDistanceCubed = 1 / Math.pow(distanceSquared, 1.5)
      const scale = gravity * inverseDistanceCubed

      result[left].x += scale * bodies[right].mass * dx
      result[left].y += scale * bodies[right].mass * dy
      result[right].x -= scale * bodies[left].mass * dx
      result[right].y -= scale * bodies[left].mass * dy
    }
  }

  return result
}

/**
 * Advances a Newtonian N-body system with velocity Verlet integration.
 * Pairwise accelerations are accumulated symmetrically so linear momentum is
 * conserved up to floating-point rounding. Softening prevents singular forces.
 */
export function stepSystem(
  bodies: readonly Body[],
  dt: number,
  gravity: number,
  softening: number,
): Body[] {
  if (!isFiniteSystem(bodies)) {
    throw new RangeError('The body system must contain finite, positive masses.')
  }
  if (![dt, gravity, softening].every(Number.isFinite)) {
    throw new RangeError('Integration parameters must be finite numbers.')
  }

  const firstAcceleration = accelerations(bodies, gravity, softening)
  const dtSquared = dt * dt
  const projected = bodies.map((body, index) => ({
    ...cloneBody(body),
    position: {
      x:
        body.position.x +
        body.velocity.x * dt +
        0.5 * firstAcceleration[index].x * dtSquared,
      y:
        body.position.y +
        body.velocity.y * dt +
        0.5 * firstAcceleration[index].y * dtSquared,
    },
  }))
  const secondAcceleration = accelerations(projected, gravity, softening)

  const next = projected.map((body, index) => ({
    ...body,
    velocity: {
      x:
        bodies[index].velocity.x +
        0.5 * (firstAcceleration[index].x + secondAcceleration[index].x) * dt,
      y:
        bodies[index].velocity.y +
        0.5 * (firstAcceleration[index].y + secondAcceleration[index].y) * dt,
    },
  }))

  if (!isFiniteSystem(next)) {
    throw new RangeError('Integration produced a non-finite state.')
  }
  return next
}

export function createFigureEightPreset(): Body[] {
  return [
    {
      id: 'cyan',
      name: '天体 A',
      mass: 1,
      position: { x: -0.97000436, y: 0.24308753 },
      velocity: { x: 0.466203685, y: 0.43236573 },
      color: '#66e8ff',
    },
    {
      id: 'blue',
      name: '天体 B',
      mass: 1,
      position: { x: 0.97000436, y: -0.24308753 },
      velocity: { x: 0.466203685, y: 0.43236573 },
      color: '#7695ff',
    },
    {
      id: 'gold',
      name: '天体 C',
      mass: 1,
      position: { x: 0, y: 0 },
      velocity: { x: -0.93240737, y: -0.86473146 },
      color: '#ffd27a',
    },
  ]
}

export function createLagrangeTrianglePreset(): Body[] {
  const angularSpeed = Math.sqrt(1 / Math.sqrt(3))
  const points = [
    { x: 0, y: -1 },
    { x: Math.sqrt(3) / 2, y: 0.5 },
    { x: -Math.sqrt(3) / 2, y: 0.5 },
  ]
  const colors = ['#66e8ff', '#7695ff', '#ffd27a']

  return points.map((position, index) => ({
    id: ['cyan', 'blue', 'gold'][index],
    name: `天体 ${String.fromCharCode(65 + index)}`,
    mass: 1,
    position: { ...position },
    velocity: {
      x: -angularSpeed * position.y,
      y: angularSpeed * position.x,
    },
    color: colors[index],
  }))
}

export function createBinaryCompanionPreset(): Body[] {
  return [
    {
      id: 'cyan',
      name: '天体 A',
      mass: 1.2,
      position: { x: -0.48, y: -0.16 },
      velocity: { x: -0.18, y: -0.74 },
      color: '#66e8ff',
    },
    {
      id: 'blue',
      name: '天体 B',
      mass: 1.2,
      position: { x: 0.48, y: -0.16 },
      velocity: { x: -0.18, y: 0.74 },
      color: '#7695ff',
    },
    {
      id: 'gold',
      name: '天体 C',
      mass: 0.34,
      position: { x: 0, y: 2.15 },
      velocity: { x: 1.2705882353, y: 0 },
      color: '#ffd27a',
    },
  ]
}

export function createPreset(key: ThreeBodyPresetKey): Body[] {
  switch (key) {
    case 'figure-eight':
      return createFigureEightPreset()
    case 'lagrange-triangle':
      return createLagrangeTrianglePreset()
    case 'binary-companion':
      return createBinaryCompanionPreset()
  }
}
