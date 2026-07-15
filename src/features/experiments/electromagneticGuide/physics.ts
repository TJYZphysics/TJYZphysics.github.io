export interface Vector2 { x: number; y: number }
export interface Size2 { x: number; y: number }

export type PlacementKind =
  | 'positive-charge'
  | 'negative-charge'
  | 'electric-field'
  | 'magnetic-field'
  | 'velocity-selector'

interface PlacementBase {
  id: string
  kind: PlacementKind
  position: Vector2
  strength: number
}

export interface PointChargePlacement extends PlacementBase {
  kind: 'positive-charge' | 'negative-charge'
  charge?: number
}

export interface RegionPlacement extends PlacementBase {
  kind: 'electric-field' | 'magnetic-field' | 'velocity-selector'
  size: Size2
  /** Clockwise angle in canvas coordinates, in radians. */
  rotation: number
  direction?: 1 | -1
  /** Selected speed for a velocity selector. */
  selectorSpeed?: number
}

export type Placement = PointChargePlacement | RegionPlacement

export interface ParticleDefinition {
  id: string
  label: string
  charge: number
  mass: number
  radius: number
  color: string
  startPosition: Vector2
  startVelocity: Vector2
}

export type ParticleStatus =
  | 'active'
  | 'collected'
  | 'crashed'
  | 'escaped'
  | 'timed-out'

export interface ParticleState extends ParticleDefinition {
  position: Vector2
  velocity: Vector2
  elapsed: number
  status: ParticleStatus
  collectorId?: string
  path: Vector2[]
  /** Simulation time represented by the latest path sample. */
  pathSampleElapsed: number
}

export type Obstacle =
  | { id: string; shape: 'rectangle'; position: Vector2; size: Size2 }
  | { id: string; shape: 'circle'; position: Vector2; radius: number }

export interface CollectorRule {
  particleIds?: readonly string[]
  chargeSign?: -1 | 0 | 1
  minMass?: number
  maxMass?: number
}

export interface Collector {
  id: string
  label: string
  position: Vector2
  radius: number
  accepts?: CollectorRule
}

export type WorldBounds =
  | { kind: 'finite'; width: number; height: number }
  | { kind: 'infinite'; initialViewport: { width: number; height: number } }

export type LevelDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'sandbox'

export interface ElectromagneticLevel {
  id: number
  title: string
  subtitle: string
  difficulty: LevelDifficulty
  briefing: string
  hint: string
  world: WorldBounds
  particles: readonly ParticleDefinition[]
  obstacles: readonly Obstacle[]
  collectors: readonly Collector[]
  availableTools: readonly PlacementKind[]
  placementLimits: Partial<Record<PlacementKind, number>>
  fixedPlacements: readonly Placement[]
  referenceSolution: readonly Placement[]
  goal: 'collect-all' | 'free-play'
  maxSimulationTime?: number
}

export interface SimulationState {
  particles: ParticleState[]
  /** Compatibility alias for renderers that prefer an explicit state name. */
  particleStates: ParticleState[]
  elapsed: number
  status: 'running' | 'won' | 'failed' | 'free-play'
}

export interface FieldSample { electric: Vector2; magnetic: number }

const COULOMB_CONSTANT = 8
const SOFTENING_SQUARED = 0.16
const MAX_FIELD = 80
const PATH_INTERVAL = 0.045
const MAX_PATH_POINTS = 8192
const MAX_INTEGRATION_STEP = 0.03
const COLLISION_EPSILON = 1e-9

const add = (a: Vector2, b: Vector2): Vector2 => ({ x: a.x + b.x, y: a.y + b.y })
const scale = (v: Vector2, n: number): Vector2 => ({ x: v.x * n, y: v.y * n })

function rotate(v: Vector2, angle: number): Vector2 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}

function insideRegion(point: Vector2, region: RegionPlacement): boolean {
  const local = rotate(
    { x: point.x - region.position.x, y: point.y - region.position.y },
    -region.rotation,
  )
  return Math.abs(local.x) <= region.size.x / 2 && Math.abs(local.y) <= region.size.y / 2
}

function isRegionPlacement(placement: Placement): placement is RegionPlacement {
  return placement.kind === 'electric-field' || placement.kind === 'magnetic-field' || placement.kind === 'velocity-selector'
}

export function fieldAt(point: Vector2, placements: readonly Placement[]): FieldSample {
  let electric = { x: 0, y: 0 }
  let magnetic = 0

  for (const item of placements) {
    if (item.kind === 'positive-charge' || item.kind === 'negative-charge') {
      const dx = point.x - item.position.x
      const dy = point.y - item.position.y
      const r2 = dx * dx + dy * dy + SOFTENING_SQUARED
      const signedCharge = item.charge ?? (item.kind === 'positive-charge' ? item.strength : -item.strength)
      const factor = (COULOMB_CONSTANT * signedCharge) / Math.pow(r2, 1.5)
      electric = add(electric, { x: dx * factor, y: dy * factor })
      continue
    }
    if (!isRegionPlacement(item) || !insideRegion(point, item)) continue
    const direction = item.direction ?? 1
    if (item.kind === 'electric-field') {
      electric = add(electric, scale(rotate({ x: 1, y: 0 }, item.rotation), item.strength * direction))
    } else if (item.kind === 'magnetic-field') {
      magnetic += item.strength * direction
    } else {
      const b = item.strength * direction
      const speed = item.selectorSpeed ?? 4
      electric = add(electric, scale(rotate({ x: 0, y: 1 }, item.rotation), speed * b))
      magnetic += b
    }
  }

  const magnitude = Math.hypot(electric.x, electric.y)
  if (magnitude > MAX_FIELD) electric = scale(electric, MAX_FIELD / magnitude)
  return { electric, magnetic }
}

export function createSimulation(level: ElectromagneticLevel): SimulationState {
  const particles = level.particles.map((particle) => ({
      ...particle,
      startPosition: { ...particle.startPosition },
      startVelocity: { ...particle.startVelocity },
      position: { ...particle.startPosition },
      velocity: { ...particle.startVelocity },
      elapsed: 0,
      status: 'active' as const,
      path: [{ ...particle.startPosition }],
      pathSampleElapsed: 0,
    }))
  return {
    particles,
    particleStates: particles,
    elapsed: 0,
    status: level.goal === 'free-play' ? 'free-play' : 'running',
  }
}

function collectorAccepts(collector: Collector, particle: ParticleState): boolean {
  const rule = collector.accepts
  if (!rule) return true
  if (rule.particleIds && !rule.particleIds.includes(particle.id)) return false
  if (rule.chargeSign !== undefined && Math.sign(particle.charge) !== rule.chargeSign) return false
  if (rule.minMass !== undefined && particle.mass < rule.minMass) return false
  if (rule.maxMass !== undefined && particle.mass > rule.maxMass) return false
  return true
}

function segmentCircleContactT(
  start: Vector2,
  end: Vector2,
  center: Vector2,
  radius: number,
): number | undefined {
  const offset = { x: start.x - center.x, y: start.y - center.y }
  const delta = { x: end.x - start.x, y: end.y - start.y }
  const c = offset.x * offset.x + offset.y * offset.y - radius * radius
  if (c <= COLLISION_EPSILON) return 0

  const a = delta.x * delta.x + delta.y * delta.y
  if (a === 0) return undefined
  const b = 2 * (offset.x * delta.x + offset.y * delta.y)
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return undefined

  const t = (-b - Math.sqrt(Math.max(0, discriminant))) / (2 * a)
  if (t < -COLLISION_EPSILON || t > 1 + COLLISION_EPSILON) return undefined
  return Math.max(0, Math.min(1, t))
}

function segmentRectangleContactT(
  start: Vector2,
  end: Vector2,
  center: Vector2,
  halfSize: Size2,
): number | undefined {
  let entry = 0
  let exit = 1

  for (const axis of ['x', 'y'] as const) {
    const delta = end[axis] - start[axis]
    const minimum = center[axis] - halfSize[axis]
    const maximum = center[axis] + halfSize[axis]

    if (delta === 0) {
      if (start[axis] < minimum || start[axis] > maximum) return undefined
      continue
    }

    let near = (minimum - start[axis]) / delta
    let far = (maximum - start[axis]) / delta
    if (near > far) [near, far] = [far, near]
    entry = Math.max(entry, near)
    exit = Math.min(exit, far)
    if (entry - exit > COLLISION_EPSILON) return undefined
  }

  if (exit < -COLLISION_EPSILON || entry > 1 + COLLISION_EPSILON) return undefined
  return Math.max(0, Math.min(1, entry))
}

type SweptContact =
  | { kind: 'collector'; t: number; collector: Collector }
  | { kind: 'obstacle'; t: number; obstacle: Obstacle }

function earliestSweptContact(
  particle: ParticleState,
  nextPosition: Vector2,
  collectors: readonly Collector[],
  obstacles: readonly Obstacle[],
): SweptContact | undefined {
  let earliest: SweptContact | undefined

  for (const collector of collectors) {
    const t = segmentCircleContactT(
      particle.position,
      nextPosition,
      collector.position,
      collector.radius + particle.radius,
    )
    if (t !== undefined && (!earliest || t < earliest.t - COLLISION_EPSILON)) {
      earliest = { kind: 'collector', t, collector }
    }
  }

  for (const obstacle of obstacles) {
    const t = obstacle.shape === 'circle'
      ? segmentCircleContactT(
          particle.position,
          nextPosition,
          obstacle.position,
          obstacle.radius + particle.radius,
        )
      : segmentRectangleContactT(
          particle.position,
          nextPosition,
          obstacle.position,
          {
            x: obstacle.size.x / 2 + particle.radius,
            y: obstacle.size.y / 2 + particle.radius,
          },
        )
    if (t !== undefined && (!earliest || t < earliest.t - COLLISION_EPSILON)) {
      earliest = { kind: 'obstacle', t, obstacle }
    }
  }

  return earliest
}

function outsideWorld(particle: ParticleState, world: WorldBounds): boolean {
  if (world.kind === 'infinite') return false
  const margin = particle.radius * 2
  return particle.position.x < -margin || particle.position.y < -margin || particle.position.x > world.width + margin || particle.position.y > world.height + margin
}

function integrateParticle(
  particle: ParticleState,
  dt: number,
  placements: readonly Placement[],
): ParticleState {
  const { electric, magnetic } = fieldAt(particle.position, placements)
  const chargeToMass = particle.charge / particle.mass
  const halfKick = scale(electric, chargeToMass * dt * 0.5)
  const vMinus = add(particle.velocity, halfKick)
  const t = chargeToMass * magnetic * dt * 0.5
  const s = (2 * t) / (1 + t * t)
  const vPrime = { x: vMinus.x + vMinus.y * t, y: vMinus.y - vMinus.x * t }
  const vPlus = { x: vMinus.x + vPrime.y * s, y: vMinus.y - vPrime.x * s }
  const velocity = add(vPlus, halfKick)
  const position = add(particle.position, scale(velocity, dt))
  const elapsed = particle.elapsed + dt
  const shouldAppend = elapsed - particle.pathSampleElapsed >= PATH_INTERVAL
  let path = shouldAppend ? [...particle.path, position] : particle.path
  if (path.length > MAX_PATH_POINTS) {
    const latest = path[path.length - 1]
    path = path.filter((_, index) => index % 2 === 0)
    if (path[path.length - 1] !== latest) path.push(latest)
  }
  return { ...particle, position, velocity, elapsed, path, pathSampleElapsed: shouldAppend ? elapsed : particle.pathSampleElapsed }
}

function particleAtContact(
  previous: ParticleState,
  integrated: ParticleState,
  dt: number,
  t: number,
): ParticleState {
  const position = {
    x: previous.position.x + (integrated.position.x - previous.position.x) * t,
    y: previous.position.y + (integrated.position.y - previous.position.y) * t,
  }
  const velocity = {
    x: previous.velocity.x + (integrated.velocity.x - previous.velocity.x) * t,
    y: previous.velocity.y + (integrated.velocity.y - previous.velocity.y) * t,
  }
  const lastPathPoint = previous.path[previous.path.length - 1]
  const shouldAppend = !lastPathPoint
    || Math.hypot(position.x - lastPathPoint.x, position.y - lastPathPoint.y) > COLLISION_EPSILON
  return {
    ...integrated,
    position,
    velocity,
    elapsed: previous.elapsed + dt * t,
    path: shouldAppend ? [...previous.path, position] : previous.path,
    pathSampleElapsed: shouldAppend ? previous.elapsed + dt * t : previous.pathSampleElapsed,
  }
}

function advanceParticle(
  previous: ParticleState,
  dt: number,
  simulationElapsed: number,
  level: ElectromagneticLevel,
  placements: readonly Placement[],
): ParticleState {
  let particle = previous
  let advanced = 0

  while (advanced < dt) {
    let substep = Math.min(MAX_INTEGRATION_STEP, dt - advanced)
    if (level.maxSimulationTime !== undefined) {
      const timeUntilTimeout = level.maxSimulationTime - (simulationElapsed + advanced)
      if (timeUntilTimeout <= 0) return { ...particle, status: 'timed-out' }
      substep = Math.min(substep, timeUntilTimeout)
    }

    const integrated = integrateParticle(particle, substep, placements)
    const contact = earliestSweptContact(
      particle,
      integrated.position,
      level.collectors,
      level.obstacles,
    )
    if (contact) {
      const atContact = particleAtContact(particle, integrated, substep, contact.t)
      if (contact.kind === 'collector') {
        return collectorAccepts(contact.collector, atContact)
          ? { ...atContact, status: 'collected', collectorId: contact.collector.id }
          : { ...atContact, status: 'crashed', collectorId: contact.collector.id }
      }
      return { ...atContact, status: 'crashed' }
    }

    particle = integrated
    advanced += substep
    if (outsideWorld(particle, level.world)) return { ...particle, status: 'escaped' }
    if (
      level.maxSimulationTime !== undefined
      && simulationElapsed + advanced >= level.maxSimulationTime
    ) {
      return { ...particle, status: 'timed-out' }
    }
  }

  return particle
}

export function stepSimulation(
  state: SimulationState,
  level: ElectromagneticLevel,
  dt: number,
  placements: readonly Placement[],
): SimulationState {
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('dt must be a finite positive number')
  if (state.status === 'won' || state.status === 'failed') return state
  const allPlacements = [...level.fixedPlacements, ...placements]
  const elapsed = state.elapsed + dt
  const particles = state.particles.map((previous) => {
    if (previous.status !== 'active') return previous
    return advanceParticle(previous, dt, state.elapsed, level, allPlacements)
  })

  if (level.goal === 'free-play') return { particles, particleStates: particles, elapsed, status: 'free-play' }
  const won = particles.every((particle) => particle.status === 'collected')
  const failed = particles.some((particle) => ['crashed', 'escaped', 'timed-out'].includes(particle.status))
  return { particles, particleStates: particles, elapsed, status: won ? 'won' : failed ? 'failed' : 'running' }
}

export function simulateLevel(
  level: ElectromagneticLevel,
  placements: readonly Placement[] = level.referenceSolution,
  dt = 1 / 120,
): SimulationState {
  let state = createSimulation(level)
  const duration = level.goal === 'free-play' ? 12 : (level.maxSimulationTime ?? 20)
  while ((state.status === 'running' || state.status === 'free-play') && state.elapsed < duration) {
    state = stepSimulation(state, level, dt, placements)
  }
  return state
}

export function placementCount(placements: readonly Placement[], kind: PlacementKind): number {
  return placements.filter((placement) => placement.kind === kind).length
}

export function canPlace(level: ElectromagneticLevel, placements: readonly Placement[], kind: PlacementKind): boolean {
  if (!level.availableTools.includes(kind)) return false
  const limit = level.placementLimits[kind]
  return limit === undefined || placementCount(placements, kind) < limit
}

export function speedOf(particle: Pick<ParticleState, 'velocity'>): number {
  return Math.hypot(particle.velocity.x, particle.velocity.y)
}
