import {
  activeChannels, filterPower, mixRgb, normalizeSplitRatios, prismSplitPower, reflectDirection,
  scaleRgb, sourceRgb, splitPower, totalPower,
} from './rules'
import type { DeviceKind, DevicePlacement, EnemyState, LevelConfig, Point, RgbPower, SourceKind } from './types'

export type PositionedEnemy = EnemyState & { position: Point }

export type BeamSegment = {
  start: Point
  end: Point
  power: RgbPower
  blockedEnemyId?: string
  targetDeviceId?: string
}

export type OpticalNetwork = {
  segments: BeamSegment[]
  poweredDeviceIds: Set<string>
  deviceInputs: Map<string, RgbPower>
  deviceIncomingDirections: Map<string, Point>
  capacitorInputsW: Map<string, number>
  blockedHits: Map<string, RgbPower>
  sensorTriggeredIds: Set<string>
  shutterStates: Map<string, boolean>
  collectorInputs: Map<string, RgbPower>
  terminalRecoveryFractions: Map<string, number>
}

const TERMINALS = new Set<DeviceKind>(['bulb', 'laser-emitter', 'radiation-source', 'frost-tower', 'brazier', 'accelerator'])
const AREA_TERMINAL_RANGES: Partial<Record<DeviceKind, number>> = {
  bulb: 125, 'radiation-source': 150, 'frost-tower': 145, brazier: 135,
}

export const OPTICAL_TRANSMISSION: Partial<Record<DeviceKind, number>> = {
  mirror: 0.92,
  splitter: 0.96,
  'prism-splitter': 0.96,
  combiner: 1,
  filter: 1,
  shutter: 1,
  collector: 1,
}

export function splitterOutputCount(placement: Pick<DevicePlacement, 'kind' | 'splitRatios'>, input?: RgbPower) {
  if (placement.kind === 'prism-splitter' && input && activeChannels(input).length >= 2) return 3
  if (placement.kind === 'splitter' || placement.kind === 'prism-splitter') return normalizeSplitRatios(placement.splitRatios).length
  return 1
}

function devicePoint(level: LevelConfig, placement: DevicePlacement) {
  return level.holes[Number(placement.holeId.replace('h-', ''))] ?? { x: 0, y: 0 }
}

function edgePoint(level: LevelConfig, start: Point, direction: Point) {
  const distances: number[] = []
  if (direction.x > 0) distances.push((level.board.width - start.x) / direction.x)
  if (direction.x < 0) distances.push((0 - start.x) / direction.x)
  if (direction.y > 0) distances.push((level.board.height - start.y) / direction.y)
  if (direction.y < 0) distances.push((0 - start.y) / direction.y)
  const distance = Math.min(...distances.filter((value) => value > 0))
  return { x: start.x + direction.x * distance, y: start.y + direction.y * distance }
}

function normalizedDirection(start: Point, end: Point): Point | null {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  return length > 0.01 ? { x: dx / length, y: dy / length } : null
}

function outputDirection(level: LevelConfig, placements: readonly DevicePlacement[], placement: DevicePlacement, index: number, fallback: Point) {
  const targetId = placement.outputTargetIds?.[index] ?? (index === 0 ? placement.snapTargetId : undefined)
  const target = targetId ? placements.find((item) => item.id === targetId && !item.destroyed) : undefined
  return target ? normalizedDirection(devicePoint(level, placement), devicePoint(level, target)) ?? fallback : fallback
}

function closestDevice(level: LevelConfig, placements: readonly DevicePlacement[], start: Point, direction: Point, ignoredId?: string) {
  return placements.filter((placement) => placement.id !== ignoredId && !placement.destroyed).map((placement) => {
    const point = devicePoint(level, placement)
    const dx = point.x - start.x
    const dy = point.y - start.y
    return { placement, point, projection: dx * direction.x + dy * direction.y, perpendicular: Math.abs(dx * direction.y - dy * direction.x) }
  }).filter(({ projection, perpendicular }) => projection > 24 && perpendicular <= 24).sort((a, b) => a.projection - b.projection)[0]
}

function closestEnemy(enemies: readonly PositionedEnemy[], start: Point, direction: Point, maximumDistance: number) {
  return enemies.filter((enemy) => !enemy.dead && !enemy.escaped).map((enemy) => {
    const dx = enemy.position.x - start.x
    const dy = enemy.position.y - start.y
    return { enemy, projection: dx * direction.x + dy * direction.y, perpendicular: Math.abs(dx * direction.y - dy * direction.x) }
  }).filter(({ projection, perpendicular }) => projection > 12 && projection < maximumDistance && perpendicular <= 18)
    .sort((a, b) => a.projection - b.projection)[0]
}

function addPower(target: Map<string, RgbPower>, id: string, power: RgbPower) {
  target.set(id, mixRgb([target.get(id) ?? { r: 0, g: 0, b: 0 }, power]))
}

function mergeCoincidentSegments(sourceSegments: readonly BeamSegment[]) {
  const merged = new Map<string, BeamSegment>()
  sourceSegments.forEach((segment) => {
    const coordinate = (value: number) => Math.round(value * 1000)
    const key = [coordinate(segment.start.x), coordinate(segment.start.y), coordinate(segment.end.x), coordinate(segment.end.y), segment.targetDeviceId ?? '', segment.blockedEnemyId ?? ''].join(':')
    const existing = merged.get(key)
    if (existing) existing.power = mixRgb([existing.power, segment.power])
    else merged.set(key, { ...segment, power: { ...segment.power } })
  })
  return [...merged.values()]
}

function traceOnce(
  level: LevelConfig,
  placements: readonly DevicePlacement[],
  enemies: readonly PositionedEnemy[],
  shutterOverrides: ReadonlyMap<string, boolean>,
  collectorInputs: ReadonlyMap<string, RgbPower> = new Map(),
  terminalRecoveryFractions: ReadonlyMap<string, number> = new Map(),
): OpticalNetwork {
  const segments: BeamSegment[] = []
  const poweredDeviceIds = new Set<string>()
  const deviceInputs = new Map<string, RgbPower>()
  const deviceIncomingDirections = new Map<string, Point>()
  const incomingPower = new Map<string, number>()
  const capacitorInputsW = new Map<string, number>()
  const blockedHits = new Map<string, RgbPower>()
  const shutterStates = new Map<string, boolean>()
  type DeferredInput = { power: RgbPower; direction: Point; depth: number; visited: Set<string> }
  const deferredInputs = new Map<string, DeferredInput>()

  placements.filter((placement) => placement.kind === 'shutter').forEach((shutter) => {
    shutterStates.set(shutter.id, shutterOverrides.get(shutter.id) ?? shutter.enabled !== false)
  })

  const deferInput = (target: DevicePlacement, power: RgbPower, direction: Point, depth: number, visited: Set<string>) => {
    const existing = deferredInputs.get(target.id)
    if (!existing) {
      deferredInputs.set(target.id, { power: { ...power }, direction: { ...direction }, depth, visited: new Set(visited) })
      return
    }
    const useNewDirection = totalPower(power) > totalPower(existing.power)
    existing.power = mixRgb([existing.power, power])
    existing.depth = Math.max(existing.depth, depth)
    visited.forEach((key) => existing.visited.add(key))
    if (useNewDirection) existing.direction = { ...direction }
  }

  const trace = (start: Point, direction: Point, power: RgbPower, ignoredId: string | undefined, depth: number, visited: Set<string>) => {
    if (depth > 16 || totalPower(power) <= 0.01) return
    const edge = edgePoint(level, start, direction)
    const device = closestDevice(level, placements, start, direction, ignoredId)
    const deviceDistance = device?.projection ?? Math.hypot(edge.x - start.x, edge.y - start.y)
    const enemy = closestEnemy(enemies, start, direction, deviceDistance)
    if (enemy) {
      segments.push({ start, end: enemy.enemy.position, power, blockedEnemyId: enemy.enemy.id })
      addPower(blockedHits, enemy.enemy.id, power)
      return
    }

    const end = device?.point ?? edge
    segments.push({ start, end, power, targetDeviceId: device?.placement.id })
    if (!device) return
    const target = device.placement
    const key = `${target.id}:${Math.round(Math.atan2(direction.y, direction.x) * 18 / Math.PI)}`
    if (visited.has(key)) return
    const nextVisited = new Set(visited).add(key)
    const recoveryFraction = TERMINALS.has(target.kind) ? Math.max(0, Math.min(0.3, terminalRecoveryFractions.get(target.id) ?? 0)) : 0
    const deliveredPower = recoveryFraction > 0 ? scaleRgb(power, 1 - recoveryFraction) : power
    poweredDeviceIds.add(target.id)
    addPower(deviceInputs, target.id, deliveredPower)
    const watts = totalPower(deliveredPower)
    if (watts > (incomingPower.get(target.id) ?? -1)) {
      incomingPower.set(target.id, watts)
      deviceIncomingDirections.set(target.id, { ...direction })
    }

    if (TERMINALS.has(target.kind)) return
    if (target.kind === 'capacitor') {
      capacitorInputsW.set(target.id, (capacitorInputsW.get(target.id) ?? 0) + watts)
      return
    }
    if (target.kind === 'shutter' && shutterStates.get(target.id) === false) return

    const transmitted = scaleRgb(deliveredPower, OPTICAL_TRANSMISSION[target.kind] ?? 1)
    // These devices depend on the complete RGB input. Defer their output until all
    // currently travelling rays have arrived, then emit the combined spectrum once.
    if (target.kind === 'combiner' || target.kind === 'prism-splitter') {
      deferInput(target, transmitted, direction, depth + 1, nextVisited)
      return
    }
    if (target.kind === 'mirror') {
      trace(end, reflectDirection(direction, target.rotationDeg), transmitted, target.id, depth + 1, nextVisited)
      return
    }
    if (target.kind === 'splitter') {
      const outputs = splitPower(transmitted, normalizeSplitRatios(target.splitRatios))
      const spread = outputs.length === 3 ? [-0.42, 0, 0.42] : [-0.28, 0.28]
      outputs.forEach((output, index) => {
        const angle = Math.atan2(direction.y, direction.x) + spread[index]
        trace(end, outputDirection(level, placements, target, index, { x: Math.cos(angle), y: Math.sin(angle) }), output, target.id, depth + 1, nextVisited)
      })
      return
    }
    if (target.kind === 'filter') {
      trace(end, outputDirection(level, placements, target, 0, direction), filterPower(transmitted, target.filterColor ?? 'r'), target.id, depth + 1, nextVisited)
      return
    }
    trace(end, outputDirection(level, placements, target, 0, direction), transmitted, target.id, depth + 1, nextVisited)
  }

  placements.filter((placement) => placement.kind.startsWith('source-') && placement.enabled !== false).forEach((source) => {
    const angle = source.rotationDeg * Math.PI / 180
    trace(devicePoint(level, source), outputDirection(level, placements, source, 0, { x: Math.cos(angle), y: Math.sin(angle) }), sourceRgb(source.kind as SourceKind), source.id, 0, new Set())
  })
  placements.filter((placement) => placement.kind === 'collector' && placement.enabled !== false).forEach((collector) => {
    const recovered = collectorInputs.get(collector.id)
    if (!recovered || totalPower(recovered) <= 0.01) return
    poweredDeviceIds.add(collector.id)
    addPower(deviceInputs, collector.id, recovered)
    const watts = totalPower(recovered)
    const color = collector.collectorColor ?? 'r'
    const output = { r: color === 'r' ? watts : 0, g: color === 'g' ? watts : 0, b: color === 'b' ? watts : 0 }
    const angle = collector.rotationDeg * Math.PI / 180
    trace(devicePoint(level, collector), outputDirection(level, placements, collector, 0, { x: Math.cos(angle), y: Math.sin(angle) }), output, collector.id, 0, new Set())
  })

  // Combiner outputs are resolved first so a downstream prism sees one composite
  // spectrum. Prism outputs can in turn feed another combiner, so repeat until the
  // deferred queue is empty (the visited/depth guards stop cyclic optical paths).
  let deferredPasses = 0
  while (deferredInputs.size && deferredPasses < 32) {
    deferredPasses += 1
    const nextId = [...deferredInputs.keys()].sort((left, right) => {
      const leftKind = placements.find((item) => item.id === left)?.kind
      const rightKind = placements.find((item) => item.id === right)?.kind
      return Number(leftKind === 'prism-splitter') - Number(rightKind === 'prism-splitter')
    })[0]
    const deferred = deferredInputs.get(nextId)
    const target = placements.find((item) => item.id === nextId && !item.destroyed)
    deferredInputs.delete(nextId)
    if (!deferred || !target) continue
    const start = devicePoint(level, target)
    if (target.kind === 'combiner') {
      const angle = target.rotationDeg * Math.PI / 180
      trace(start, outputDirection(level, placements, target, 0, { x: Math.cos(angle), y: Math.sin(angle) }), deferred.power, target.id, deferred.depth, deferred.visited)
      continue
    }
    const outputs = prismSplitPower(deferred.power, target.splitRatios)
    const spread = outputs.length === 3 ? [-0.42, 0, 0.42] : [-0.28, 0.28]
    outputs.forEach((output, index) => {
      const angle = Math.atan2(deferred.direction.y, deferred.direction.x) + spread[index]
      trace(start, outputDirection(level, placements, target, index, { x: Math.cos(angle), y: Math.sin(angle) }), output, target.id, deferred.depth, new Set(deferred.visited))
    })
  }

  return {
    segments: mergeCoincidentSegments(segments), poweredDeviceIds, deviceInputs, deviceIncomingDirections,
    capacitorInputsW, blockedHits, sensorTriggeredIds: new Set(), shutterStates,
    collectorInputs: new Map(collectorInputs), terminalRecoveryFractions: new Map(terminalRecoveryFractions),
  }
}

function collectEscapedPower(level: LevelConfig, placements: readonly DevicePlacement[], network: OpticalNetwork) {
  const collectorInputs = new Map<string, RgbPower>()
  const terminalRecoveryFractions = new Map<string, number>()
  const collectors = placements.filter((item) => item.kind === 'collector' && !item.destroyed)
  const terminals = placements.filter((item) => AREA_TERMINAL_RANGES[item.kind] && !item.destroyed && network.deviceInputs.has(item.id))
  terminals.forEach((terminal) => {
    const terminalPoint = devicePoint(level, terminal)
    const range = AREA_TERMINAL_RANGES[terminal.kind]! * (1 + ((terminal.upgradeLevel ?? 1) - 1) * 0.08)
    const eligible = collectors.filter((collector) => Math.hypot(terminalPoint.x - devicePoint(level, collector).x, terminalPoint.y - devicePoint(level, collector).y) <= range)
    if (!eligible.length) return
    const efficiencies = eligible.map((collector) => 0.1 + ((collector.upgradeLevel ?? 1) - 1) * 0.05)
    const rawTotal = efficiencies.reduce((sum, value) => sum + value, 0)
    const recoveredFraction = Math.min(0.3, rawTotal)
    terminalRecoveryFractions.set(terminal.id, recoveredFraction)
    const input = network.deviceInputs.get(terminal.id)!
    eligible.forEach((collector, index) => addPower(collectorInputs, collector.id, scaleRgb(input, recoveredFraction * efficiencies[index] / rawTotal)))
  })
  return { collectorInputs, terminalRecoveryFractions }
}

export function traceOpticalNetwork(level: LevelConfig, placements: readonly DevicePlacement[], enemies: readonly PositionedEnemy[] = []): OpticalNetwork {
  const base = traceOnce(level, placements, enemies, new Map())
  const preliminaryRecovery = collectEscapedPower(level, placements, base)
  const preliminary = traceOnce(level, placements, enemies, new Map(), preliminaryRecovery.collectorInputs, preliminaryRecovery.terminalRecoveryFractions)
  const sensorTriggeredIds = new Set<string>()
  const shutterOverrides = new Map<string, boolean>()

  placements.filter((placement) => placement.hasSensor && placement.sensorTargetId).forEach((sensor) => {
    const input = sensor.kind.startsWith('source-') ? sourceRgb(sensor.kind as SourceKind) : preliminary.deviceInputs.get(sensor.id) ?? { r: 0, g: 0, b: 0 }
    const channel = sensor.sensorChannel ?? 'any'
    const detectedPower = channel === 'any' ? totalPower(input) : input[channel]
    const triggered = detectedPower >= (sensor.sensorThresholdW ?? 10)
    if (triggered) sensorTriggeredIds.add(sensor.id)
    const open = (sensor.sensorAction ?? 'open-when-triggered') === 'open-when-triggered' ? triggered : !triggered
    shutterOverrides.set(sensor.sensorTargetId!, open)
  })

  const controlledBase = traceOnce(level, placements, enemies, shutterOverrides)
  const recovery = collectEscapedPower(level, placements, controlledBase)
  const network = traceOnce(level, placements, enemies, shutterOverrides, recovery.collectorInputs, recovery.terminalRecoveryFractions)
  network.sensorTriggeredIds = sensorTriggeredIds
  return network
}
