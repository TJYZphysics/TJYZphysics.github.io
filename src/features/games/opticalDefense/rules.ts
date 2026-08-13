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
  poisonSeconds: 4,
  poisonDps: 2.2,
  burnSeconds: 4,
  burnDps: 3,
  freezeSeconds: 1.8,
  freezeSpeedMultiplier: 0.55,
  toxinIgnitionCooldownS: 1,
  thermalShockDamage: 12,
  thermalShockCooldownS: 1.2,
  radiationThreshold: 4,
  radiationBurstDamage: 18,
  radiationDecayDelayS: 1.5,
  radiationDecayPerSecond: 0.6,
  armorBreakSeconds: 2,
  vulnerableSeconds: 4,
  vulnerableDamageMultiplier: 1.25,
  armoredDamageMultiplier: 0.55,
  shieldDamageMultiplier: 0.7,
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

export function scaleRgb(power: RgbPower, multiplier: number): RgbPower {
  return { r: power.r * multiplier, g: power.g * multiplier, b: power.b * multiplier }
}

export function activeChannels(power: RgbPower, minimumShare = 0.1) {
  const watts = totalPower(power)
  if (watts <= 0.01) return [] as Array<keyof RgbPower>
  return (['r', 'g', 'b'] as const).filter((channel) => power[channel] / watts >= minimumShare)
}

export function visibleColor(power: RgbPower) {
  const active = activeChannels(power)
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
  return { x: incoming.x - 2 * dot * normal.x, y: incoming.y - 2 * dot * normal.y }
}

export function mirrorAngleForTarget(incomingDirection: Point, outgoingDirection: Point) {
  const incomingLength = Math.hypot(incomingDirection.x, incomingDirection.y) || 1
  const outgoingLength = Math.hypot(outgoingDirection.x, outgoingDirection.y) || 1
  const incoming = { x: incomingDirection.x / incomingLength, y: incomingDirection.y / incomingLength }
  const outgoing = { x: outgoingDirection.x / outgoingLength, y: outgoingDirection.y / outgoingLength }
  const normal = { x: incoming.x - outgoing.x, y: incoming.y - outgoing.y }
  if (Math.hypot(normal.x, normal.y) < 0.0001) return Math.atan2(incoming.y, incoming.x) * 180 / Math.PI
  return (Math.atan2(normal.y, normal.x) * 180 / Math.PI + 90 + 360) % 180
}

export function normalizeSplitRatios(ratios: readonly number[] | undefined, fallback = [0.5, 0.5]) {
  const sanitized = (ratios?.length ? ratios : fallback).slice(0, 3).map((ratio) => Number.isFinite(ratio) ? Math.max(0, ratio) : 0)
  const valid = sanitized.length ? sanitized : [...fallback]
  const sum = valid.reduce((total, ratio) => total + ratio, 0)
  if (sum <= 0.0001) return valid.map(() => 1 / valid.length)
  return valid.map((ratio) => ratio / sum)
}

export function splitPower(input: RgbPower, ratios: readonly number[]): RgbPower[] {
  const normalized = normalizeSplitRatios(ratios)
  return normalized.map((ratio) => scaleRgb(input, ratio))
}

export function prismSplitPower(input: RgbPower, ratios: readonly number[] | undefined) {
  const active = activeChannels(input)
  if (active.length < 2) return splitPower(input, normalizeSplitRatios(ratios))
  return [
    { r: input.r, g: 0, b: 0 },
    { r: 0, g: input.g, b: 0 },
    { r: 0, g: 0, b: input.b },
  ]
}

export function filterPower(input: RgbPower, channel: keyof RgbPower): RgbPower {
  return { r: channel === 'r' ? input.r : 0, g: channel === 'g' ? input.g : 0, b: channel === 'b' ? input.b : 0 }
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
  return enemies.filter((enemy) => !enemy.dead && !enemy.escaped).map((enemy) => {
    const projected = ((enemy.position.x - start.x) * dx + (enemy.position.y - start.y) * dy) / lengthSquared
    const t = Math.max(0, Math.min(1, projected))
    const nearest = { x: start.x + dx * t, y: start.y + dy * t }
    return { enemy, t, distance: Math.hypot(enemy.position.x - nearest.x, enemy.position.y - nearest.y) }
  }).filter(({ t, distance }) => t > 0 && t <= 1 && distance <= beamRadius).sort((a, b) => a.t - b.t)[0]?.enemy
}

export function applyPowerDrop(capacityW: number, rewardPowerW: number) {
  return capacityW + rewardPowerW
}

export type OpticalHitOptions = {
  damageMultiplier?: number
  statusMultiplier?: number
  reactionMultiplier?: number
  directDamage?: number
  forceStatus?: 'freeze' | 'burn'
}

export function applyOpticalHit(
  enemy: EnemyState,
  power: RgbPower,
  deltaSeconds: number,
  options: OpticalHitOptions = {},
): EnemyState {
  if (enemy.dead || enemy.escaped) return enemy
  const next: EnemyState = { ...enemy, status: { ...enemy.status } }
  const effective = { ...power }
  if (enemy.resistance) effective[enemy.resistance] *= 0.3
  const color = visibleColor(power)
  const isWhite = color === 'white'
  const isOrange = color === 'orange'
  const isMagenta = color === 'magenta'
  const isBurnHit = color === 'green' || color === 'yellow' || isOrange || options.forceStatus === 'burn'
  const isFreezeHit = color === 'cyan' || options.forceStatus === 'freeze'
  const statusMultiplier = Math.max(0, options.statusMultiplier ?? 1)
  const reactionMultiplier = Math.max(0, options.reactionMultiplier ?? statusMultiplier)
  let rawDamage = (effective.r * 0.06 + effective.g * 0.018 + effective.b * 0.025) * deltaSeconds
  if (isOrange) rawDamage *= 1.25
  if (isMagenta) rawDamage *= 1.25
  rawDamage = rawDamage * Math.max(0, options.damageMultiplier ?? 1) + Math.max(0, options.directDamage ?? 0)

  const poisonBeforeHit = next.status.poisonSeconds
  const freezeBeforeHit = next.status.freezeSeconds
  if (poisonBeforeHit > 0 && isBurnHit && next.status.toxinIgnitionCooldownS <= 0) {
    rawDamage += Math.min(14, 6 + 2 * poisonBeforeHit) * reactionMultiplier
    next.status.poisonSeconds = 0
    next.status.poisonPotency = 0
    next.status.toxinIgnitionCooldownS = OPTICAL_REACTIONS.toxinIgnitionCooldownS
  }
  if (freezeBeforeHit > 0 && isBurnHit && next.status.thermalShockCooldownS <= 0) {
    rawDamage += OPTICAL_REACTIONS.thermalShockDamage * reactionMultiplier
    next.status.freezeSeconds = 0
    next.status.freezeStrength = 0
    next.status.thermalShockCooldownS = OPTICAL_REACTIONS.thermalShockCooldownS
  } else if (freezeBeforeHit > 0 && rawDamage > 0) {
    next.status.armorBrokenSeconds = Math.max(next.status.armorBrokenSeconds, OPTICAL_REACTIONS.armorBreakSeconds)
  }

  const clampStrength = (value: number, maximum = 1) => Math.max(0, Math.min(maximum, value))
  if (color === 'red') {
    next.status.poisonSeconds = Math.max(next.status.poisonSeconds, OPTICAL_REACTIONS.poisonSeconds)
    next.status.poisonPotency = Math.max(next.status.poisonPotency, clampStrength(effective.r / 25) * statusMultiplier)
  }
  if (isBurnHit) {
    const spectralStrength = options.forceStatus === 'burn'
      ? 1
      : color === 'green'
        ? clampStrength(effective.g / 25)
        : clampStrength(totalPower(effective) / 50 * (isOrange ? 1.25 : 1), isOrange ? 1.25 : 1)
    next.status.burnSeconds = Math.max(next.status.burnSeconds, OPTICAL_REACTIONS.burnSeconds)
    next.status.burnPotency = Math.max(next.status.burnPotency, spectralStrength * statusMultiplier)
  }
  if (isFreezeHit) {
    const freezeStrength = options.forceStatus === 'freeze'
      ? 1
      : clampStrength(Math.min(effective.g, effective.b) / 25)
    next.status.freezeSeconds = Math.max(next.status.freezeSeconds, OPTICAL_REACTIONS.freezeSeconds)
    next.status.freezeStrength = Math.max(next.status.freezeStrength, freezeStrength * statusMultiplier)
  }
  if (color === 'blue' || isMagenta) {
    next.status.radiationStacks += deltaSeconds * effective.b / 45 * statusMultiplier * (isMagenta ? 1.25 : 1)
    next.status.radiationIdleSeconds = 0
  }
  if (next.status.radiationStacks >= OPTICAL_REACTIONS.radiationThreshold) {
    rawDamage += OPTICAL_REACTIONS.radiationBurstDamage
    next.status.radiationStacks = 0
  }
  if (next.status.vulnerableSeconds > 0) rawDamage *= OPTICAL_REACTIONS.vulnerableDamageMultiplier

  let healthDamage = rawDamage
  if (next.status.shield > 0) {
    if (isWhite) {
      const shieldDamage = Math.min(next.status.shield, rawDamage * 2.5)
      next.status.shield -= shieldDamage
      healthDamage = 0
      if (next.status.shield <= 0) next.status.vulnerableSeconds = OPTICAL_REACTIONS.vulnerableSeconds
    } else {
      // Shield and armor reductions do not stack: a shielded target takes the shield cut only.
      healthDamage *= OPTICAL_REACTIONS.shieldDamageMultiplier
    }
  } else if (enemy.kind === 'armored' && next.status.armorBrokenSeconds <= 0) {
    healthDamage *= OPTICAL_REACTIONS.armoredDamageMultiplier
  }
  next.health = Math.max(0, next.health - healthDamage)
  next.dead = next.health <= 0
  return next
}

export function tickStatuses(enemy: EnemyState, deltaSeconds: number): EnemyState {
  if (enemy.dead || enemy.escaped) return enemy
  const next = { ...enemy, status: { ...enemy.status } }
  let damage = (next.status.poisonSeconds > 0 ? OPTICAL_REACTIONS.poisonDps * next.status.poisonPotency : 0)
    + (next.status.burnSeconds > 0 ? OPTICAL_REACTIONS.burnDps * next.status.burnPotency : 0)
  if (next.status.vulnerableSeconds > 0) damage *= OPTICAL_REACTIONS.vulnerableDamageMultiplier
  if (next.status.shield > 0) damage *= OPTICAL_REACTIONS.shieldDamageMultiplier
  else if (enemy.kind === 'armored' && next.status.armorBrokenSeconds <= 0) damage *= OPTICAL_REACTIONS.armoredDamageMultiplier
  next.health = Math.max(0, next.health - damage * deltaSeconds)
  next.status.poisonSeconds = Math.max(0, next.status.poisonSeconds - deltaSeconds)
  if (next.status.poisonSeconds <= 0) next.status.poisonPotency = 0
  next.status.burnSeconds = Math.max(0, next.status.burnSeconds - deltaSeconds)
  if (next.status.burnSeconds <= 0) next.status.burnPotency = 0
  next.status.freezeSeconds = Math.max(0, next.status.freezeSeconds - deltaSeconds)
  if (next.status.freezeSeconds <= 0) next.status.freezeStrength = 0
  next.status.armorBrokenSeconds = Math.max(0, next.status.armorBrokenSeconds - deltaSeconds)
  next.status.vulnerableSeconds = Math.max(0, next.status.vulnerableSeconds - deltaSeconds)
  next.status.toxinIgnitionCooldownS = Math.max(0, next.status.toxinIgnitionCooldownS - deltaSeconds)
  next.status.thermalShockCooldownS = Math.max(0, next.status.thermalShockCooldownS - deltaSeconds)
  next.status.radiationIdleSeconds += deltaSeconds
  if (next.status.radiationIdleSeconds > OPTICAL_REACTIONS.radiationDecayDelayS) {
    next.status.radiationStacks = Math.max(0, next.status.radiationStacks - OPTICAL_REACTIONS.radiationDecayPerSecond * deltaSeconds)
  }
  next.dead = next.health <= 0
  return next
}

export function chargeCapacitor(state: CapacitorState, inputPowerW: number, deltaSeconds: number): CapacitorState {
  if (state.destroyed) return state
  return { ...state, chargeJ: Math.min(state.maxChargeJ, state.chargeJ + inputPowerW * deltaSeconds) }
}

export function detonateCapacitor(state: CapacitorState): ExplosionResult | null {
  if (state.destroyed || state.chargeJ <= 0) return null
  const fraction = Math.min(1, state.chargeJ / state.maxChargeJ)
  return {
    radius: 90 + 330 * Math.sqrt(fraction),
    damage: 15 + state.chargeJ * 0.18,
    destroyed: true,
    chargeSpentJ: state.chargeJ,
  }
}
