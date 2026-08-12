import {
  applyOpticalHit,
  applyPowerDrop,
  canPlaceSource,
  chargeCapacitor,
  detonateCapacitor,
  mixRgb,
  sourceRgb,
  SOURCE_POWER_W,
  tickStatuses,
  totalPower,
  mirrorAngleForTarget,
} from './rules'
import { traceOpticalNetwork } from './optics'
import type { OpticalNetwork } from './optics'
import type {
  CapacitorState,
  DeviceKind,
  DevicePlacement,
  EnemyKind,
  EnemyState,
  LevelConfig,
  Point,
  RgbPower,
  SourceKind,
  TargetStrategy,
} from './types'
import { EMPTY_STATUS } from './types'

export type BattlePhase = 'build' | 'running' | 'paused' | 'victory' | 'defeat'

export type SpawnEntry = {
  atSeconds: number
  waveNumber: number
  kind: EnemyKind
  health: number
  speed: number
  rewardCoins: number
  rewardPowerW: number
  resistance?: 'r' | 'g' | 'b'
  routeIndex?: number
}

export type BattleEvent =
  | { id: number; type: 'kill'; value: number; point: Point }
  | { id: number; type: 'escape'; point: Point }
  | { id: number; type: 'explosion'; point: Point; radius: number }

export type BattleState = {
  levelId: number
  phase: BattlePhase
  capacityW: number
  usedPowerW: number
  coins: number
  coreHealth: number
  elapsedSeconds: number
  nextSpawnIndex: number
  nextEntityId: number
  placements: DevicePlacement[]
  enemies: EnemyState[]
  spawnPlan: SpawnEntry[]
  events: BattleEvent[]
  lastExplosionRadius: number
  network?: OpticalNetwork
}

export type ActionResult = { ok: true; state: BattleState } | { ok: false; reason: string; state: BattleState }

export const DEVICE_COSTS: Record<DeviceKind, number> = {
  'source-red': 0,
  'source-green': 0,
  'source-blue': 0,
  mirror: 18,
  splitter: 36,
  combiner: 34,
  filter: 22,
  collector: 40,
  bulb: 26,
  'laser-emitter': 42,
  'radiation-source': 48,
  'frost-tower': 46,
  brazier: 44,
  accelerator: 68,
  shutter: 20,
  'photo-sensor': 30,
  capacitor: 58,
}

export const ATTACK_DEVICES: DeviceKind[] = [
  'bulb', 'laser-emitter', 'radiation-source', 'frost-tower', 'brazier', 'accelerator',
]

export const TERMINAL_ATTACK_PROFILES: Partial<Record<DeviceKind, { range: number; area: boolean; multiplier: number }>> = {
  bulb: { range: 125, area: true, multiplier: 1.1 },
  'laser-emitter': { range: 300, area: false, multiplier: 0.86 },
  'radiation-source': { range: 150, area: true, multiplier: 0.48 },
  'frost-tower': { range: 145, area: true, multiplier: 0.5 },
  brazier: { range: 135, area: true, multiplier: 0.5 },
  accelerator: { range: 360, area: false, multiplier: 0.78 },
}

export const ACCELERATOR_MIN_INPUT_W = 90
export const ACCELERATOR_MAX_CHARGE_J = 360
export const DEVICE_MAX_LEVEL = 3

export const deviceLevel = (placement: DevicePlacement) => placement.upgradeLevel ?? 1

const SOURCE_KINDS: SourceKind[] = ['source-red', 'source-green', 'source-blue']
const TARGETABLE_OUTPUT_KINDS = new Set<DeviceKind>([
  ...SOURCE_KINDS, 'mirror', 'splitter', 'combiner', 'filter', 'collector', 'shutter',
])

export function buildSpawnPlan(level: LevelConfig): SpawnEntry[] {
  const plan: SpawnEntry[] = []
  let waveStart = 0
  level.waves.forEach((wave, waveIndex) => {
    waveStart += wave.delaySeconds
    let cursor = waveStart
    wave.enemies.forEach((group) => {
      for (let index = 0; index < group.count; index += 1) {
        plan.push({
          atSeconds: cursor,
          waveNumber: waveIndex + 1,
          kind: group.kind,
          health: group.health,
          speed: group.speed,
          rewardCoins: group.rewardCoins,
          rewardPowerW: group.rewardPowerW,
          resistance: group.resistance,
          routeIndex: group.routeIndex,
        })
        cursor += group.intervalSeconds
      }
    })
    waveStart = cursor + 1.4
  })
  return plan
}

export function createBattleState(level: LevelConfig): BattleState {
  return {
    levelId: level.id,
    phase: 'build',
    capacityW: level.capacityW,
    usedPowerW: 0,
    coins: level.startingCoins,
    coreHealth: level.coreHealth,
    elapsedSeconds: 0,
    nextSpawnIndex: 0,
    nextEntityId: 1,
    placements: [],
    enemies: [],
    spawnPlan: buildSpawnPlan(level),
    events: [],
    lastExplosionRadius: 0,
  }
}

function sourceKind(kind: DeviceKind): kind is SourceKind {
  return SOURCE_KINDS.includes(kind as SourceKind)
}

export function placeDevice(
  state: BattleState,
  level: LevelConfig,
  kind: DeviceKind,
  holeId: string,
  allowedDevices: readonly DeviceKind[] = level.availableDevices,
): ActionResult {
  if (!allowedDevices.includes(kind)) return { ok: false, reason: '该仪器尚未在本关开放。', state }
  if (kind === 'photo-sensor') return { ok: false, reason: '传感器必须附着到一台已有仪器上。', state }
  if (state.placements.some((placement) => placement.holeId === holeId && !placement.destroyed)) return { ok: false, reason: '这个安装孔已经被占用。', state }
  if (!level.holes.some((_, index) => `h-${index}` === holeId)) return { ok: false, reason: '请选择实验台上的安装孔。', state }
  const cost = DEVICE_COSTS[kind]
  if (state.coins < cost) return { ok: false, reason: '金币不足，先击败敌人获取补给。', state }
  if (sourceKind(kind) && !canPlaceSource(state.usedPowerW, kind, state.capacityW)) {
    return { ok: false, reason: `功率超限：${state.usedPowerW}W + ${SOURCE_POWER_W[kind]}W > ${state.capacityW}W。`, state }
  }

  const placement: DevicePlacement = {
    id: `device-${state.nextEntityId}`,
    kind,
    holeId,
    rotationDeg: kind === 'mirror' ? 45 : 0,
    splitRatios: kind === 'splitter' ? [0.5, 0.5] : undefined,
    filterColor: kind === 'filter' ? 'r' : undefined,
    targetStrategy: kind === 'mirror' ? 'first' : undefined,
    mirrorMode: kind === 'mirror' ? 'fixed' : undefined,
    enabled: true,
    chargeJ: kind === 'capacitor' ? 0 : undefined,
    upgradeLevel: 1,
    rotationSnap: kind === 'mirror' ? true : undefined,
    acceleratorChargeJ: kind === 'accelerator' ? 0 : undefined,
    acceleratorCooldownS: kind === 'accelerator' ? 0 : undefined,
    acceleratorPhase: kind === 'accelerator' ? 'idle' : undefined,
  }
  return {
    ok: true,
    state: {
      ...state,
      nextEntityId: state.nextEntityId + 1,
      coins: state.coins - cost,
      usedPowerW: state.usedPowerW + (sourceKind(kind) ? SOURCE_POWER_W[kind] : 0),
      placements: [...state.placements, placement],
      network: undefined,
    },
  }
}

export function attachSensor(state: BattleState, placementId: string): ActionResult {
  const placement = state.placements.find((item) => item.id === placementId && !item.destroyed)
  if (!placement) return { ok: false, reason: '请选择一台已有仪器安装传感器。', state }
  if (placement.hasSensor) return { ok: false, reason: '该仪器已经安装传感器。', state }
  const cost = DEVICE_COSTS['photo-sensor']
  if (state.coins < cost) return { ok: false, reason: `安装传感器需要 ${cost} 金币。`, state }
  return {
    ok: true,
    state: {
      ...state,
      coins: state.coins - cost,
      placements: state.placements.map((item) => item.id === placementId ? {
        ...item,
        hasSensor: true,
        sensorThresholdW: 10,
        sensorChannel: 'any',
        sensorAction: 'open-when-triggered',
      } : item),
      network: undefined,
    },
  }
}

export function deviceUpgradeCost(placement: DevicePlacement) {
  if (deviceLevel(placement) >= DEVICE_MAX_LEVEL || sourceKind(placement.kind)) return null
  const base = Math.max(16, DEVICE_COSTS[placement.kind])
  return Math.round(base * (0.7 + deviceLevel(placement) * 0.45))
}

function investedCoins(placement: DevicePlacement) {
  let total = DEVICE_COSTS[placement.kind] + (placement.hasSensor ? DEVICE_COSTS['photo-sensor'] : 0)
  for (let level = 1; level < deviceLevel(placement); level += 1) {
    total += Math.round(Math.max(16, DEVICE_COSTS[placement.kind]) * (0.7 + level * 0.45))
  }
  return total
}

export function upgradeDevice(state: BattleState, placementId: string): ActionResult {
  const placement = state.placements.find((item) => item.id === placementId)
  if (!placement) return { ok: false, reason: '没有选中可升级的仪器。', state }
  const cost = deviceUpgradeCost(placement)
  if (cost === null) return { ok: false, reason: sourceKind(placement.kind) ? '光源额定功率不可升级。' : '该仪器已达到最高等级。', state }
  if (state.coins < cost) return { ok: false, reason: `升级需要 ${cost} 金币。`, state }
  return {
    ok: true,
    state: {
      ...state,
      coins: state.coins - cost,
      placements: state.placements.map((item) => item.id === placementId
        ? { ...item, upgradeLevel: Math.min(DEVICE_MAX_LEVEL, deviceLevel(item) + 1) as 1 | 2 | 3 }
        : item),
      network: undefined,
    },
  }
}

export function sellDevice(state: BattleState, placementId: string): BattleState {
  const placement = state.placements.find((item) => item.id === placementId)
  if (!placement) return state
  return {
    ...state,
    coins: state.coins + Math.round(investedCoins(placement) * 0.6),
    usedPowerW: Math.max(0, state.usedPowerW - (sourceKind(placement.kind) ? SOURCE_POWER_W[placement.kind] : 0)),
    placements: state.placements
      .filter((item) => item.id !== placementId)
      .map((item) => ({
        ...item,
        sensorTargetId: item.sensorTargetId === placementId ? undefined : item.sensorTargetId,
        outputTargetIds: item.outputTargetIds?.map((targetId) => targetId === placementId ? undefined : targetId),
        snapTargetId: item.snapTargetId === placementId ? undefined : item.snapTargetId,
      })),
    network: undefined,
  }
}

export function rotateDevice(state: BattleState, placementId: string, amountDeg = 15): BattleState {
  return {
    ...state,
    placements: state.placements.map((placement) => placement.id === placementId
      ? { ...placement, rotationDeg: (placement.rotationDeg + amountDeg + 360) % 360 }
      : placement),
    network: undefined,
  }
}

export function setDeviceRotation(state: BattleState, placementId: string, rotationDeg: number): BattleState {
  if (!Number.isFinite(rotationDeg)) return state
  return {
    ...state,
    placements: state.placements.map((placement) => placement.id === placementId
      ? { ...placement, rotationDeg: (rotationDeg % 360 + 360) % 360 }
      : placement),
    network: undefined,
  }
}

export function snapMirrorToTarget(state: BattleState, level: LevelConfig, mirrorId: string, targetId: string): BattleState {
  const mirror = state.placements.find((placement) => placement.id === mirrorId && placement.kind === 'mirror')
  const target = state.placements.find((placement) => placement.id === targetId && !placement.destroyed)
  if (!mirror || !target || mirror.id === target.id) return state
  const pointForPlacement = (placement: DevicePlacement) => level.holes[Number(placement.holeId.replace('h-', ''))] ?? { x: 0, y: 0 }
  const mirrorPoint = pointForPlacement(mirror)
  const targetPoint = pointForPlacement(target)
  const incomingDirection = traceOpticalNetwork(level, state.placements).deviceIncomingDirections.get(mirror.id)
  if (!incomingDirection) return state
  const rotationDeg = mirrorAngleForTarget(
    incomingDirection,
    { x: targetPoint.x - mirrorPoint.x, y: targetPoint.y - mirrorPoint.y },
  )
  return {
    ...state,
    placements: state.placements.map((placement) => placement.id === mirrorId ? { ...placement, rotationDeg, snapTargetId: targetId, mirrorMode: 'fixed' } : placement),
    network: undefined,
  }
}

export function snapDeviceOutputToTarget(
  state: BattleState,
  level: LevelConfig,
  placementId: string,
  outputIndex: number,
  targetId: string,
): BattleState {
  const placement = state.placements.find((item) => item.id === placementId && !item.destroyed)
  const target = state.placements.find((item) => item.id === targetId && !item.destroyed)
  if (!placement || !target || placement.id === target.id || outputIndex < 0 || outputIndex > 2) return state
  if (!TARGETABLE_OUTPUT_KINDS.has(placement.kind)) return state
  if (placement.kind === 'mirror') return snapMirrorToTarget(state, level, placementId, targetId)
  const outputCount = placement.kind === 'splitter' ? (placement.splitRatios?.length ?? 2) : 1
  if (outputIndex >= outputCount) return state
  const outputTargetIds = Array.from({ length: outputCount }, (_, index) => placement.outputTargetIds?.[index])
  outputTargetIds[outputIndex] = targetId
  return {
    ...state,
    placements: state.placements.map((item) => item.id === placementId
      ? { ...item, outputTargetIds, snapTargetId: outputIndex === 0 ? targetId : item.snapTargetId }
      : item),
    network: undefined,
  }
}

export function updateDevice(
  state: BattleState,
  placementId: string,
  patch: Pick<Partial<DevicePlacement>,
    'splitRatios' | 'filterColor' | 'targetStrategy' | 'enabled' | 'mirrorMode' | 'rotationSnap'
    | 'sensorTargetId' | 'sensorThresholdW' | 'sensorChannel' | 'sensorAction' | 'outputTargetIds'>,
): BattleState {
  return {
    ...state,
    placements: state.placements.map((placement) => placement.id === placementId ? { ...placement, ...patch } : placement),
    network: undefined,
  }
}

export function startWave(state: BattleState): BattleState {
  if (state.phase === 'victory' || state.phase === 'defeat') return state
  return { ...state, phase: 'running' }
}

export function togglePause(state: BattleState): BattleState {
  if (state.phase === 'running') return { ...state, phase: 'paused' }
  if (state.phase === 'paused') return { ...state, phase: 'running' }
  return state
}

export function queueCapacitorDetonation(state: BattleState, placementId: string): ActionResult {
  const capacitor = state.placements.find((placement) => placement.id === placementId && placement.kind === 'capacitor')
  if (!capacitor || capacitor.destroyed || (capacitor.chargeJ ?? 0) <= 0) {
    return { ok: false, reason: '电容器还没有可释放的储能。', state }
  }
  return {
    ok: true,
    state: {
      ...state,
      placements: state.placements.map((placement) => placement.id === placementId ? { ...placement, detonateQueued: true } : placement),
    },
  }
}

export function pathLength(path: readonly Point[]) {
  return path.slice(1).reduce((length, point, index) => length + Math.hypot(point.x - path[index].x, point.y - path[index].y), 0)
}

export function pointOnPath(path: readonly Point[], progress: number): Point {
  const targetDistance = pathLength(path) * Math.max(0, Math.min(1, progress))
  let covered = 0
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1]
    const end = path[index]
    const segment = Math.hypot(end.x - start.x, end.y - start.y)
    if (covered + segment >= targetDistance) {
      const ratio = segment ? (targetDistance - covered) / segment : 0
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio }
    }
    covered += segment
  }
  return path.at(-1) ?? { x: 0, y: 0 }
}

export function activeRgb(state: BattleState): RgbPower {
  return mixRgb(state.placements
    .filter((placement) => sourceKind(placement.kind) && placement.enabled !== false)
    .map((placement) => sourceRgb(placement.kind as SourceKind)))
}

function enemyPath(level: LevelConfig, enemy: Pick<EnemyState, 'routeIndex'>) {
  return level.paths?.[enemy.routeIndex ?? 0] ?? level.path
}

function targetEnemy(enemies: EnemyState[], strategy: TargetStrategy = 'first') {
  const alive = enemies.filter((enemy) => !enemy.dead && !enemy.escaped)
  if (!alive.length) return undefined
  if (strategy === 'last') return alive.reduce((best, enemy) => enemy.progress < best.progress ? enemy : best)
  if (strategy === 'highest-health') return alive.reduce((best, enemy) => enemy.health > best.health ? enemy : best)
  if (strategy === 'lowest-health') return alive.reduce((best, enemy) => enemy.health < best.health ? enemy : best)
  if (strategy === 'boss-first') return alive.find((enemy) => enemy.kind === 'boss') ?? alive.reduce((best, enemy) => enemy.progress > best.progress ? enemy : best)
  if (strategy === 'status-first') return alive.find((enemy) => Object.values(enemy.status).some((value) => value > 0)) ?? alive[0]
  return alive.reduce((best, enemy) => enemy.progress > best.progress ? enemy : best)
}

function moveMirrorAngle(currentDeg: number, targetDeg: number, maximumStepDeg: number) {
  const current = ((currentDeg % 180) + 180) % 180
  const target = ((targetDeg % 180) + 180) % 180
  let difference = target - current
  if (difference > 90) difference -= 180
  if (difference < -90) difference += 180
  const step = Math.max(-maximumStepDeg, Math.min(maximumStepDeg, difference))
  return (current + step + 180) % 180
}

export function trackAutomaticMirrors(
  state: BattleState,
  level: LevelConfig,
  deltaSeconds: number,
  turnRateDegPerSecond = 80,
  network = traceOpticalNetwork(level, state.placements, state.enemies.map((enemy) => ({ ...enemy, position: pointOnPath(enemyPath(level, enemy), enemy.progress) }))),
): BattleState {
  const pointForPlacement = (placement: DevicePlacement) => level.holes[Number(placement.holeId.replace('h-', ''))] ?? { x: 0, y: 0 }
  return {
    ...state,
    placements: state.placements.map((placement) => {
      if (placement.kind !== 'mirror' || placement.mirrorMode !== 'auto') return placement
      const target = targetEnemy(state.enemies, placement.targetStrategy ?? 'first')
      if (!target) return placement
      const mirrorPoint = pointForPlacement(placement)
      const incomingDirection = network.deviceIncomingDirections.get(placement.id)
      if (!incomingDirection) return placement
      const targetPoint = pointOnPath(enemyPath(level, target), target.progress)
      const targetAngle = mirrorAngleForTarget(
        incomingDirection,
        { x: targetPoint.x - mirrorPoint.x, y: targetPoint.y - mirrorPoint.y },
      )
      const upgradedTurnRate = turnRateDegPerSecond * (1 + (deviceLevel(placement) - 1) * 0.18)
      return { ...placement, rotationDeg: moveMirrorAngle(placement.rotationDeg, targetAngle, upgradedTurnRate * deltaSeconds), snapTargetId: undefined }
    }),
    network: undefined,
  }
}

function terminalPower(power: RgbPower, kind: DeviceKind): RgbPower {
  const watts = totalPower(power)
  if (kind === 'frost-tower') return { r: 0, g: watts * 0.35, b: watts * 0.65 }
  if (kind === 'brazier') return { r: watts * 0.72, g: watts * 0.28, b: 0 }
  if (kind === 'radiation-source') return { r: watts * 0.45, g: 0, b: watts * 0.55 }
  return power
}

export function terminalAttackRange(placement: DevicePlacement, focusedStrength: boolean | number = false) {
  const profile = TERMINAL_ATTACK_PROFILES[placement.kind]
  if (!profile) return 0
  const upgradeMultiplier = 1 + (deviceLevel(placement) - 1) * 0.08
  const strength = typeof focusedStrength === 'boolean' ? (focusedStrength ? 1 : 0) : Math.max(0, Math.min(1, focusedStrength))
  return profile.range * upgradeMultiplier * (1 - strength * 0.32)
}

function placementPoint(level: LevelConfig, placement: DevicePlacement) {
  return level.holes[Number(placement.holeId.replace('h-', ''))] ?? { x: 0, y: 0 }
}

function applyTerminalAttacks(state: BattleState, level: LevelConfig, deltaSeconds: number, network: OpticalNetwork) {
  const terminals = state.placements.filter((placement) => ATTACK_DEVICES.includes(placement.kind) && placement.enabled !== false && network.deviceInputs.has(placement.id))
  if (!terminals.length) return { enemies: state.enemies, placements: state.placements }
  let enemies = state.enemies
  let placements = state.placements

  terminals.forEach((terminal) => {
    const inputPower = network.deviceInputs.get(terminal.id)
    if (!inputPower || totalPower(inputPower) <= 0) return
    const focusedPower = network.focusedInputs.get(terminal.id)
    const focusStrength = Math.min(1, totalPower(focusedPower ?? { r: 0, g: 0, b: 0 }) / Math.max(0.01, totalPower(inputPower)))
    const focused = focusStrength > 0
    const range = terminalAttackRange(terminal, focusStrength)
    const point = placementPoint(level, terminal)
    const candidates = enemies.filter((enemy) => !enemy.dead && !enemy.escaped
      && Math.hypot(pointOnPath(enemyPath(level, enemy), enemy.progress).x - point.x, pointOnPath(enemyPath(level, enemy), enemy.progress).y - point.y) <= range)
    const target = targetEnemy(candidates, terminal.targetStrategy ?? 'first')
    const terminalRgb = terminalPower(inputPower, terminal.kind)
    if (terminal.kind === 'accelerator') {
      const level = deviceLevel(terminal)
      const maximumCharge = ACCELERATOR_MAX_CHARGE_J * (1 + (level - 1) * 0.2)
      let charge = terminal.acceleratorChargeJ ?? 0
      let cooldown = Math.max(0, (terminal.acceleratorCooldownS ?? 0) - deltaSeconds)
      let phase: DevicePlacement['acceleratorPhase'] = cooldown > 0 ? 'cooldown' : 'idle'
      if (cooldown <= 0 && totalPower(inputPower) >= ACCELERATOR_MIN_INPUT_W) {
        charge = Math.min(maximumCharge, charge + totalPower(inputPower) * deltaSeconds)
        phase = charge >= maximumCharge ? 'ready' : 'charging'
      }
      if (phase === 'ready' && target) {
        const pulseMultiplier = (5.4 + (level - 1) * 1.2) * (1 + focusStrength * 0.18)
        const scaled = { r: terminalRgb.r * pulseMultiplier, g: terminalRgb.g * pulseMultiplier, b: terminalRgb.b * pulseMultiplier }
        enemies = enemies.map((enemy) => enemy.id === target.id ? applyOpticalHit(enemy, scaled, 0.9, { focused, focusedStrength: focusStrength }) : enemy)
        charge = 0
        cooldown = Math.max(1.4, 2.4 - (level - 1) * 0.35)
        phase = 'cooldown'
      }
      placements = placements.map((placement) => placement.id === terminal.id
        ? { ...placement, acceleratorChargeJ: charge, acceleratorCooldownS: cooldown, acceleratorPhase: phase }
        : placement)
      return
    }
    if (!target) return
    const profile = TERMINAL_ATTACK_PROFILES[terminal.kind]!
    const damageMultiplier = profile.multiplier * (1 + (deviceLevel(terminal) - 1) * 0.18) * (1 + focusStrength * 0.18)
    const affectedIds = new Set(profile.area ? candidates.map((enemy) => enemy.id) : [target.id])
    enemies = enemies.map((enemy) => {
      if (!affectedIds.has(enemy.id)) return enemy
      const scaled: RgbPower = {
        r: terminalRgb.r * damageMultiplier,
        g: terminalRgb.g * damageMultiplier,
        b: terminalRgb.b * damageMultiplier,
      }
      return applyOpticalHit(enemy, scaled, deltaSeconds, { focused: focused && enemy.id === target.id, focusedStrength: focusStrength })
    })
  })
  return { enemies, placements }
}

function spawnEnemy(entry: SpawnEntry, id: number): EnemyState {
  return {
    id: `enemy-${id}`,
    kind: entry.kind,
    health: entry.health,
    maxHealth: entry.health,
    speed: entry.speed,
    progress: 0,
    rewardCoins: entry.rewardCoins,
    rewardPowerW: entry.rewardPowerW,
    resistance: entry.resistance,
    routeIndex: entry.routeIndex,
    status: {
      ...EMPTY_STATUS,
      shield: entry.kind === 'boss' ? 130 : entry.kind === 'armored' ? 20 : 0,
    },
  }
}

export function tickBattle(state: BattleState, level: LevelConfig, deltaSeconds: number): BattleState {
  if (state.phase !== 'running') return state
  const delta = Math.min(0.1, Math.max(0, deltaSeconds))
  let next: BattleState = { ...state, elapsedSeconds: state.elapsedSeconds + delta, events: [] }
  const spawned: EnemyState[] = []
  let spawnIndex = next.nextSpawnIndex
  let entityId = next.nextEntityId
  while (spawnIndex < next.spawnPlan.length && next.spawnPlan[spawnIndex].atSeconds <= next.elapsedSeconds) {
    spawned.push(spawnEnemy(next.spawnPlan[spawnIndex], entityId))
    spawnIndex += 1
    entityId += 1
  }
  next.nextSpawnIndex = spawnIndex
  next.nextEntityId = entityId
  next.enemies = [...next.enemies, ...spawned]

  next.enemies = next.enemies.map((enemy) => {
    if (enemy.dead || enemy.escaped) return enemy
    const statusTicked = tickStatuses(enemy, delta)
    if (statusTicked.dead) return statusTicked
    const slowdown = statusTicked.status.freezeSeconds > 0 ? 0.48 : 1
    const progress = statusTicked.progress + (statusTicked.speed * slowdown * delta) / pathLength(enemyPath(level, statusTicked))
    return progress >= 1 ? { ...statusTicked, progress: 1, escaped: true } : { ...statusTicked, progress }
  })

  const positionedEnemies = next.enemies.map((enemy) => ({ ...enemy, position: pointOnPath(enemyPath(level, enemy), enemy.progress) }))
  const incomingNetwork = next.network ?? traceOpticalNetwork(level, next.placements, positionedEnemies)
  next = trackAutomaticMirrors(next, level, delta, 80, incomingNetwork)

  let network = traceOpticalNetwork(level, next.placements, positionedEnemies)
  next.network = network
  next.enemies = next.enemies.map((enemy) => {
    const blockedPower = network.blockedHits.get(enemy.id)
    return blockedPower && !enemy.dead && !enemy.escaped ? applyOpticalHit(enemy, blockedPower, delta) : enemy
  })
  const terminalResult = applyTerminalAttacks(next, level, delta, network)
  next.enemies = terminalResult.enemies
  next.placements = terminalResult.placements
  next.placements = next.placements.map((placement) => {
    if (placement.kind !== 'capacitor' || placement.destroyed) return placement
    const inputPowerW = network.capacitorInputsW.get(placement.id) ?? 0
    const maximumCharge = 450 * (1 + (deviceLevel(placement) - 1) * 0.25)
    return { ...placement, chargeJ: chargeCapacitor({ chargeJ: placement.chargeJ ?? 0, maxChargeJ: maximumCharge, destroyed: false }, inputPowerW, delta).chargeJ }
  })

  const mapDiagonal = Math.hypot(level.board.width, level.board.height)
  for (const capacitor of next.placements.filter((placement) => placement.kind === 'capacitor' && placement.detonateQueued && !placement.destroyed)) {
    const maximumCharge = 450 * (1 + (deviceLevel(capacitor) - 1) * 0.25)
    const explosion = detonateCapacitor({ chargeJ: capacitor.chargeJ ?? 0, maxChargeJ: maximumCharge, destroyed: false }, mapDiagonal)
    if (!explosion) continue
    const point = level.holes[Number(capacitor.holeId.replace('h-', ''))] ?? { x: 450, y: 260 }
    next.lastExplosionRadius = explosion.radius
    next.events.push({ id: next.nextEntityId++, type: 'explosion', point, radius: explosion.radius })
    next.enemies = next.enemies.map((enemy) => {
      if (enemy.dead || enemy.escaped) return enemy
      const enemyPoint = pointOnPath(enemyPath(level, enemy), enemy.progress)
      if (Math.hypot(enemyPoint.x - point.x, enemyPoint.y - point.y) > explosion.radius) return enemy
      const health = Math.max(0, enemy.health - explosion.damage)
      return { ...enemy, health, dead: health <= 0 }
    })
    next.placements = next.placements.filter((placement) => placement.id !== capacitor.id)
    network = traceOpticalNetwork(level, next.placements, next.enemies.map((enemy) => ({ ...enemy, position: pointOnPath(enemyPath(level, enemy), enemy.progress) })))
    next.network = network
  }

  state.enemies.forEach((previous) => {
    const current = next.enemies.find((enemy) => enemy.id === previous.id)
    if (!previous.dead && current?.dead) {
      next.capacityW = applyPowerDrop(next.capacityW, current.rewardPowerW)
      next.coins += current.rewardCoins
      next.events.push({ id: next.nextEntityId++, type: 'kill', value: current.rewardPowerW, point: pointOnPath(enemyPath(level, current), current.progress) })
    }
    if (!previous.escaped && current?.escaped) {
      next.coreHealth -= current.kind === 'boss' ? 4 : 1
      next.events.push({ id: next.nextEntityId++, type: 'escape', point: enemyPath(level, current).at(-1) ?? { x: 900, y: 260 } })
    }
  })

  if (next.coreHealth <= 0) next.phase = 'defeat'
  else if (next.nextSpawnIndex >= next.spawnPlan.length && next.enemies.every((enemy) => enemy.dead || enemy.escaped)) next.phase = 'victory'
  return next
}

export function scoreBattle(state: BattleState, level: LevelConfig) {
  const healthScore = Math.max(0, state.coreHealth / level.coreHealth)
  const authoredSpawnDuration = state.spawnPlan.at(-1)?.atSeconds ?? 0
  const timeTarget = Math.max(45 + level.id * 8, authoredSpawnDuration + 20)
  const timeScore = Math.max(0, Math.min(1, timeTarget / Math.max(1, state.elapsedSeconds)))
  const efficiencyScore = Math.max(0, 1 - state.usedPowerW / Math.max(1, state.capacityW))
  const composite = healthScore * 0.5 + timeScore * 0.25 + efficiencyScore * 0.25
  return composite >= 0.82 ? 3 : composite >= 0.58 ? 2 : 1
}
