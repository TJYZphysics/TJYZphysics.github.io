import { filterPower, mixRgb, reflectDirection, sourceRgb, totalPower } from './rules'
import type { DevicePlacement, EnemyState, LevelConfig, Point, RgbPower, SourceKind } from './types'

export type PositionedEnemy = EnemyState & { position: Point }

export type BeamSegment = {
  start: Point
  end: Point
  power: RgbPower
  focusStrength: number
  blockedEnemyId?: string
  targetDeviceId?: string
}

export type OpticalNetwork = {
  segments: BeamSegment[]
  poweredDeviceIds: Set<string>
  deviceInputs: Map<string, RgbPower>
  deviceIncomingDirections: Map<string, Point>
  focusedDeviceIds: Set<string>
  focusedInputs: Map<string, RgbPower>
  capacitorInputsW: Map<string, number>
  blockedHits: Map<string, RgbPower>
  sensorTriggeredIds: Set<string>
  shutterStates: Map<string, boolean>
}

const TERMINALS = new Set(['bulb', 'laser-emitter', 'radiation-source', 'frost-tower', 'brazier', 'accelerator'])
const AREA_TERMINAL_RANGES: Partial<Record<DevicePlacement['kind'], number>> = {
  bulb: 125,
  'radiation-source': 150,
  'frost-tower': 145,
  brazier: 135,
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

function outputDirection(
  level: LevelConfig,
  placements: readonly DevicePlacement[],
  placement: DevicePlacement,
  index: number,
  fallback: Point,
) {
  const targetId = placement.outputTargetIds?.[index] ?? (index === 0 ? placement.snapTargetId : undefined)
  const target = targetId ? placements.find((item) => item.id === targetId && !item.destroyed) : undefined
  return target ? normalizedDirection(devicePoint(level, placement), devicePoint(level, target)) ?? fallback : fallback
}

function closestDevice(level: LevelConfig, placements: readonly DevicePlacement[], start: Point, direction: Point, ignoredId?: string) {
  return placements
    .filter((placement) => placement.id !== ignoredId && !placement.destroyed)
    .map((placement) => {
      const point = devicePoint(level, placement)
      const dx = point.x - start.x
      const dy = point.y - start.y
      return {
        placement,
        point,
        projection: dx * direction.x + dy * direction.y,
        perpendicular: Math.abs(dx * direction.y - dy * direction.x),
      }
    })
    .filter(({ projection, perpendicular }) => projection > 24 && perpendicular <= 24)
    .sort((left, right) => left.projection - right.projection)[0]
}

function closestEnemy(enemies: readonly PositionedEnemy[], start: Point, direction: Point, maximumDistance: number) {
  return enemies
    .filter((enemy) => !enemy.dead && !enemy.escaped)
    .map((enemy) => {
      const dx = enemy.position.x - start.x
      const dy = enemy.position.y - start.y
      return {
        enemy,
        projection: dx * direction.x + dy * direction.y,
        perpendicular: Math.abs(dx * direction.y - dy * direction.x),
      }
    })
    .filter(({ projection, perpendicular }) => projection > 12 && projection < maximumDistance && perpendicular <= 18)
    .sort((left, right) => left.projection - right.projection)[0]
}

function addPower(target: Map<string, RgbPower>, id: string, power: RgbPower) {
  target.set(id, mixRgb([target.get(id) ?? { r: 0, g: 0, b: 0 }, power]))
}

function mergeCoincidentSegments(sourceSegments: readonly BeamSegment[]) {
  const merged = new Map<string, BeamSegment>()
  sourceSegments.forEach((segment) => {
    const coordinate = (value: number) => Math.round(value * 1000)
    const key = [
      coordinate(segment.start.x), coordinate(segment.start.y),
      coordinate(segment.end.x), coordinate(segment.end.y),
      segment.targetDeviceId ?? '', segment.blockedEnemyId ?? '', Math.round(segment.focusStrength * 100),
    ].join(':')
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
): OpticalNetwork {
  const segments: BeamSegment[] = []
  const poweredDeviceIds = new Set<string>()
  const deviceInputs = new Map<string, RgbPower>()
  const deviceIncomingDirections = new Map<string, Point>()
  const incomingPower = new Map<string, number>()
  const focusedDeviceIds = new Set<string>()
  const focusedInputs = new Map<string, RgbPower>()
  const capacitorInputsW = new Map<string, number>()
  const blockedHits = new Map<string, RgbPower>()
  const shutterStates = new Map<string, boolean>()

  placements.filter((placement) => placement.kind === 'shutter').forEach((shutter) => {
    shutterStates.set(shutter.id, shutterOverrides.get(shutter.id) ?? shutter.enabled !== false)
  })

  const trace = (
    start: Point,
    direction: Point,
    power: RgbPower,
    focusStrength: number,
    ignoredId: string | undefined,
    depth: number,
    visited: Set<string>,
  ) => {
    if (depth > 12 || totalPower(power) <= 0.01) return
    const edge = edgePoint(level, start, direction)
    const device = closestDevice(level, placements, start, direction, ignoredId)
    const deviceDistance = device?.projection ?? Math.hypot(edge.x - start.x, edge.y - start.y)
    const enemy = closestEnemy(enemies, start, direction, deviceDistance)
    if (enemy) {
      segments.push({ start, end: enemy.enemy.position, power, focusStrength, blockedEnemyId: enemy.enemy.id })
      addPower(blockedHits, enemy.enemy.id, power)
      return
    }

    const end = device?.point ?? edge
    segments.push({ start, end, power, focusStrength, targetDeviceId: device?.placement.id })
    if (!device) return
    const target = device.placement
    const key = `${target.id}:${Math.round(Math.atan2(direction.y, direction.x) * 18 / Math.PI)}:${Math.round(focusStrength * 10)}`
    if (visited.has(key)) return
    const nextVisited = new Set(visited).add(key)
    poweredDeviceIds.add(target.id)
    addPower(deviceInputs, target.id, power)
    if (focusStrength > 0) {
      focusedDeviceIds.add(target.id)
      addPower(focusedInputs, target.id, { r: power.r * focusStrength, g: power.g * focusStrength, b: power.b * focusStrength })
    }
    const watts = totalPower(power)
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

    if (target.kind === 'mirror') {
      const reflected = reflectDirection(direction, target.rotationDeg)
      trace(end, reflected, power, focusStrength, target.id, depth + 1, nextVisited)
      return
    }
    if (target.kind === 'splitter') {
      const ratios = target.splitRatios ?? [0.5, 0.5]
      const spread = ratios.length === 3 ? [-0.42, 0, 0.42] : [-0.28, 0.28]
      ratios.forEach((ratio, index) => {
        const angle = Math.atan2(direction.y, direction.x) + spread[index]
        const fallback = { x: Math.cos(angle), y: Math.sin(angle) }
        trace(end, outputDirection(level, placements, target, index, fallback), { r: power.r * ratio, g: power.g * ratio, b: power.b * ratio }, focusStrength, target.id, depth + 1, nextVisited)
      })
      return
    }
    if (target.kind === 'filter') {
      trace(end, outputDirection(level, placements, target, 0, direction), filterPower(power, target.filterColor ?? 'r'), focusStrength, target.id, depth + 1, nextVisited)
      return
    }
    if (target.kind === 'combiner') {
      const angle = target.rotationDeg * Math.PI / 180
      const fallback = { x: Math.cos(angle), y: Math.sin(angle) }
      trace(end, outputDirection(level, placements, target, 0, fallback), power, focusStrength, target.id, depth + 1, nextVisited)
      return
    }
    trace(end, outputDirection(level, placements, target, 0, direction), power, focusStrength, target.id, depth + 1, nextVisited)
  }

  placements.filter((placement) => placement.kind.startsWith('source-') && placement.enabled !== false).forEach((source) => {
    const angle = source.rotationDeg * Math.PI / 180
    const fallback = { x: Math.cos(angle), y: Math.sin(angle) }
    trace(devicePoint(level, source), outputDirection(level, placements, source, 0, fallback), sourceRgb(source.kind as SourceKind), 0, source.id, 0, new Set())
  })
  placements.filter((placement) => placement.kind === 'collector' && placement.enabled !== false).forEach((collector) => {
    const power = collectorInputs.get(collector.id)
    if (!power || totalPower(power) <= 0.01) return
    poweredDeviceIds.add(collector.id)
    addPower(deviceInputs, collector.id, power)
    const angle = collector.rotationDeg * Math.PI / 180
    const fallback = { x: Math.cos(angle), y: Math.sin(angle) }
    trace(devicePoint(level, collector), outputDirection(level, placements, collector, 0, fallback), power, 0, collector.id, 0, new Set())
  })

  return {
    segments: mergeCoincidentSegments(segments), poweredDeviceIds, deviceInputs, deviceIncomingDirections,
    focusedDeviceIds, focusedInputs, capacitorInputsW, blockedHits, sensorTriggeredIds: new Set(), shutterStates,
  }
}

function collectEscapedPower(
  level: LevelConfig,
  placements: readonly DevicePlacement[],
  network: OpticalNetwork,
) {
  const collected = new Map<string, RgbPower>()
  const collectors = placements.filter((item) => item.kind === 'collector' && !item.destroyed)
  const terminals = placements.filter((terminal) => AREA_TERMINAL_RANGES[terminal.kind] && !terminal.destroyed && network.deviceInputs.has(terminal.id))
  terminals.forEach((terminal) => {
    const terminalPoint = devicePoint(level, terminal)
    const range = AREA_TERMINAL_RANGES[terminal.kind]! * (1 + ((terminal.upgradeLevel ?? 1) - 1) * 0.08)
    const eligible = collectors.filter((collector) => {
      const collectorPoint = devicePoint(level, collector)
      return Math.hypot(terminalPoint.x - collectorPoint.x, terminalPoint.y - collectorPoint.y) <= range
    })
    if (!eligible.length) return
    const input = network.deviceInputs.get(terminal.id)!
    const sourcePower = totalPower(input)
    const efficiencies = eligible.map((collector) => 0.1 + ((collector.upgradeLevel ?? 1) - 1) * 0.05)
    const totalEfficiency = Math.min(0.35, efficiencies.reduce((sum, value) => sum + value, 0))
    eligible.forEach((collector, index) => {
      const share = totalEfficiency * efficiencies[index] / efficiencies.reduce((sum, value) => sum + value, 0)
      const watts = sourcePower * share
      let beam: RgbPower
      if (terminal.kind === 'radiation-source') beam = { r: watts * 0.45, g: 0, b: watts * 0.55 }
      else if (terminal.kind === 'frost-tower') beam = { r: 0, g: watts * 0.35, b: watts * 0.65 }
      else if (terminal.kind === 'brazier') beam = { r: watts * 0.72, g: watts * 0.28, b: 0 }
      else beam = { r: input.r * share, g: input.g * share, b: input.b * share }
      addPower(collected, collector.id, beam)
    })
  })
  return collected
}

export function traceOpticalNetwork(
  level: LevelConfig,
  placements: readonly DevicePlacement[],
  enemies: readonly PositionedEnemy[] = [],
): OpticalNetwork {
  const base = traceOnce(level, placements, enemies, new Map())
  const preliminaryCollectors = collectEscapedPower(level, placements, base)
  const preliminary = traceOnce(level, placements, enemies, new Map(), preliminaryCollectors)
  const sensorTriggeredIds = new Set<string>()
  const shutterOverrides = new Map<string, boolean>()

  placements.filter((placement) => placement.hasSensor && placement.sensorTargetId).forEach((sensor) => {
    const input = sensor.kind.startsWith('source-')
      ? sourceRgb(sensor.kind as SourceKind)
      : preliminary.deviceInputs.get(sensor.id) ?? { r: 0, g: 0, b: 0 }
    const channel = sensor.sensorChannel ?? 'any'
    const detectedPower = channel === 'any' ? totalPower(input) : input[channel]
    const triggered = detectedPower >= (sensor.sensorThresholdW ?? 10)
    if (triggered) sensorTriggeredIds.add(sensor.id)
    const open = (sensor.sensorAction ?? 'open-when-triggered') === 'open-when-triggered' ? triggered : !triggered
    shutterOverrides.set(sensor.sensorTargetId!, open)
  })

  const controlledBase = traceOnce(level, placements, enemies, shutterOverrides)
  const collectorInputs = collectEscapedPower(level, placements, controlledBase)
  const network = traceOnce(level, placements, enemies, shutterOverrides, collectorInputs)
  network.sensorTriggeredIds = sensorTriggeredIds
  return network
}
