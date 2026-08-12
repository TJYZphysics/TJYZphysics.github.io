import type {
  CapacitorState,
  EnemyState,
  ExplosionResult,
  Point,
  RgbPower,
  SourceKind,
} from './types'

export const SOURCE_POWER_W: Record<SourceKind, number> = {
  'source-red': 50,
  'source-green': 75,
  'source-blue': 100,
}

export const LEVEL_CAPACITIES_W = [
  100, 125, 150, 175, 200, 225, 250, 275, 300, 325,
  350, 375, 400, 425, 450, 475, 500, 525, 550,
] as const

export const OPTICAL_REACTIONS = {
  toxinIgnition: { poisonDamagePerSecond: 4.5, burnSeconds: 3 },
  thermalShock: { damage: 10 },
  radiationBurst: { threshold: 3.5, damage: 14 },
  frozenArmorBreak: { seconds: 1.6 },
  focusedStatusMultiplier: 1.22,
} as const

export const totalPower = (power: RgbPower) => power.r + power.g + power.b

export function canPlaceSource(usedPowerW: number, source: SourceKind, capacityW: number) {
  return usedPowerW + SOURCE_POWER_W[source] <= capacityW
}

export function sourceRgb(source: SourceKind): RgbPower {
  const watts = SOURCE_POWER_W[source]
  if (source === 'source-red') return { r: watts, g: 0, b: 0 }
  if (source === 'source-green') return { r: 0, g: watts, b: 0 }
  return { r: 0, g: 0, b: watts }
}

export function mixRgb(beams: readonly RgbPower[]): RgbPower {
  return beams.reduce((mixed, beam) => ({
    r: mixed.r + beam.r,
    g: mixed.g + beam.g,
    b: mixed.b + beam.b,
  }), { r: 0, g: 0, b: 0 })
}

export function visibleColor(power: RgbPower) {
  const active = (['r', 'g', 'b'] as const).filter((channel) => power[channel] > 0.01)
  if (!active.length) return 'dark'
  if (active.length === 1) return active[0] === 'r' ? 'red' : active[0] === 'g' ? 'green' : 'blue'
  if (active.length === 3) return 'white'
  if (active.includes('r') && active.includes('g')) return power.r > power.g * 1.35 ? 'orange' : 'yellow'
  if (active.includes('r')) return 'magenta'
  return 'cyan'
}

export function reflectDirection(direction: Point, mirrorAngleDeg: number): Point {
  const length = Math.hypot(direction.x, direction.y) || 1
  const incoming = { x: direction.x / length, y: direction.y / length }
  const mirrorAngle = mirrorAngleDeg * Math.PI / 180
  const normal = { x: -Math.sin(mirrorAngle), y: Math.cos(mirrorAngle) }
  const dot = incoming.x * normal.x + incoming.y * normal.y
  return {
    x: incoming.x - 2 * dot * normal.x,
    y: incoming.y - 2 * dot * normal.y,
  }
}

export function mirrorAngleForTarget(incomingDirection: Point, outgoingDirection: Point) {
  const incomingLength = Math.hypot(incomingDirection.x, incomingDirection.y) || 1
  const outgoingLength = Math.hypot(outgoingDirection.x, outgoingDirection.y) || 1
  const incoming = { x: incomingDirection.x / incomingLength, y: incomingDirection.y / incomingLength }
  const outgoing = { x: outgoingDirection.x / outgoingLength, y: outgoingDirection.y / outgoingLength }
  const normal = { x: incoming.x - outgoing.x, y: incoming.y - outgoing.y }
  if (Math.hypot(normal.x, normal.y) < 0.0001) return Math.atan2(incoming.y, incoming.x) * 180 / Math.PI
  const normalAngle = Math.atan2(normal.y, normal.x) * 180 / Math.PI
  return (normalAngle + 90 + 360) % 180
}

export function splitPower(input: RgbPower, ratios: readonly number[]): RgbPower[] {
  if (ratios.length < 1 || ratios.length > 3) throw new Error('A splitter supports one to three outputs.')
  if (ratios.some((ratio) => ratio < 0)) throw new Error('Splitter ratios cannot be negative.')
  const ratioTotal = ratios.reduce((sum, ratio) => sum + ratio, 0)
  if (ratioTotal > 1 + Number.EPSILON) throw new Error('Splitter outputs cannot exceed input power.')
  return ratios.map((ratio) => ({ r: input.r * ratio, g: input.g * ratio, b: input.b * ratio }))
}

export function filterPower(input: RgbPower, channel: keyof RgbPower): RgbPower {
  return {
    r: channel === 'r' ? input.r : 0,
    g: channel === 'g' ? input.g : 0,
    b: channel === 'b' ? input.b : 0,
  }
}

export function frontmostBlockingEnemy(
  start: Point,
  end: Point,
  enemies: readonly (EnemyState & { position: Point })[],
  beamRadius = 18,
) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy || 1
  return enemies
    .filter((enemy) => !enemy.dead && !enemy.escaped)
    .map((enemy) => {
      const projected = ((enemy.position.x - start.x) * dx + (enemy.position.y - start.y) * dy) / lengthSquared
      const t = Math.max(0, Math.min(1, projected))
      const nearest = { x: start.x + dx * t, y: start.y + dy * t }
      return { enemy, t, distance: Math.hypot(enemy.position.x - nearest.x, enemy.position.y - nearest.y) }
    })
    .filter(({ t, distance }) => t > 0 && t <= 1 && distance <= beamRadius)
    .sort((a, b) => a.t - b.t)[0]?.enemy
}

export function applyPowerDrop(capacityW: number, rewardPowerW: number) {
  return capacityW + rewardPowerW
}

export function applyOpticalHit(
  enemy: EnemyState,
  power: RgbPower,
  deltaSeconds: number,
  options: { focused?: boolean; focusedStrength?: number } = {},
): EnemyState {
  const next: EnemyState = { ...enemy, status: { ...enemy.status } }
  const effectivePower = { ...power }
  if (enemy.resistance) effectivePower[enemy.resistance] *= 0.2
  const r = effectivePower.r
  const g = effectivePower.g
  const b = effectivePower.b
  const hasWhite = r > 0 && g > 0 && b > 0
  const redStrength = Math.min(1, r / 50)
  const greenStrength = Math.min(1, g / 50)
  const blueStrength = Math.min(1, b / 50)
  const hadStatus = next.status.poisonSeconds > 0 || next.status.burnSeconds > 0
    || next.status.freezeSeconds > 0 || next.status.radiationStacks > 0 || next.status.armorBrokenSeconds > 0
  const poisonBeforeHit = next.status.poisonSeconds
  const freezeBeforeHit = next.status.freezeSeconds
  let damage = (r * 0.085 + g * 0.03 + b * 0.04) * deltaSeconds

  if (g > 0) next.status.poisonSeconds = Math.max(next.status.poisonSeconds, 3 * greenStrength)
  if (r > 0 && g > 0) next.status.burnSeconds = Math.max(next.status.burnSeconds, 2.5 * Math.min(redStrength, greenStrength))
  if (g > 0 && b > 0) next.status.freezeSeconds = Math.max(next.status.freezeSeconds, 1.5 * Math.min(greenStrength, blueStrength))
  if (b > 0) next.status.radiationStacks += deltaSeconds * b / 45

  if (poisonBeforeHit > 0 && r > 0) {
    damage += poisonBeforeHit * OPTICAL_REACTIONS.toxinIgnition.poisonDamagePerSecond * redStrength
    next.status.poisonSeconds = 0
    next.status.burnSeconds = Math.max(next.status.burnSeconds, OPTICAL_REACTIONS.toxinIgnition.burnSeconds)
  }
  if (freezeBeforeHit > 0 && r > 0) {
    damage += OPTICAL_REACTIONS.thermalShock.damage * redStrength
    next.status.freezeSeconds = 0
  }
  if (next.status.radiationStacks >= OPTICAL_REACTIONS.radiationBurst.threshold) {
    damage += OPTICAL_REACTIONS.radiationBurst.damage
    next.status.radiationStacks = 0
  }
  if (b > 0 && next.status.freezeSeconds > 0) {
    next.status.armorBrokenSeconds = Math.max(next.status.armorBrokenSeconds, OPTICAL_REACTIONS.frozenArmorBreak.seconds * blueStrength)
  }
  if (hasWhite && next.status.shield > 0) {
    const shieldDamage = Math.min(next.status.shield, totalPower(effectivePower) * 0.35 * deltaSeconds)
    next.status.shield -= shieldDamage
    damage = Math.max(0, damage - shieldDamage)
  }
  if (enemy.kind === 'armored' && next.status.armorBrokenSeconds <= 0) damage *= 0.32
  if (options.focused && hadStatus) {
    const strength = Math.max(0, Math.min(1, options.focusedStrength ?? 1))
    damage *= 1 + (OPTICAL_REACTIONS.focusedStatusMultiplier - 1) * strength
  }
  next.health = Math.max(0, next.health - damage)
  next.dead = next.health <= 0
  return next
}

export function tickStatuses(enemy: EnemyState, deltaSeconds: number): EnemyState {
  const next = { ...enemy, status: { ...enemy.status } }
  const poisonDamage = next.status.poisonSeconds > 0 ? 2.2 * deltaSeconds : 0
  const burnDamage = next.status.burnSeconds > 0 ? 3.2 * deltaSeconds : 0
  next.health = Math.max(0, next.health - poisonDamage - burnDamage)
  next.status.poisonSeconds = Math.max(0, next.status.poisonSeconds - deltaSeconds)
  next.status.burnSeconds = Math.max(0, next.status.burnSeconds - deltaSeconds)
  next.status.freezeSeconds = Math.max(0, next.status.freezeSeconds - deltaSeconds)
  next.status.armorBrokenSeconds = Math.max(0, next.status.armorBrokenSeconds - deltaSeconds)
  next.dead = next.health <= 0
  return next
}

export function chargeCapacitor(state: CapacitorState, inputPowerW: number, deltaSeconds: number): CapacitorState {
  if (state.destroyed) return state
  return { ...state, chargeJ: Math.min(state.maxChargeJ, state.chargeJ + inputPowerW * deltaSeconds) }
}

export function detonateCapacitor(state: CapacitorState, mapDiagonal: number): ExplosionResult | null {
  if (state.destroyed || state.chargeJ <= 0) return null
  const fraction = Math.min(1, state.chargeJ / state.maxChargeJ)
  return {
    radius: Math.max(90, mapDiagonal * Math.sqrt(fraction)),
    damage: 25 + state.chargeJ * 0.9,
    destroyed: true,
    chargeSpentJ: state.chargeJ,
  }
}
