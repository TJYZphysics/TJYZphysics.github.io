import { traceOpticalNetwork } from './optics'
import { totalPower } from './rules'
import {
  advanceBattle, createBattleState, placeDevice, pointOnPath, snapDeviceOutputToTarget,
  queueCapacitorDetonation, startWave, terminalAttackRange, updateDevice, upgradeDevice,
} from './simulation'
import type { BattleState } from './simulation'
import type { DeviceKind, EnemyStatus, LevelConfig, SourceKind } from './types'

export type RouteBias = 'all' | number

export type BenchmarkMetrics = {
  levelId: number
  policy: 'recommended' | 'wrong'
  phase: BattleState['phase']
  coreHealth: number
  kills: number
  leaks: number
  firstKillSeconds: number | null
  statusTriggers: number
  statusSurvivalSamples: number
  averageStatusSurvivalSeconds: number
  damagePerWatt: number
  damagePerCoin: number
  peakPowerW: number
  endingCapacityW: number
  spentCoins: number
  elapsedSeconds: number
  capacitorDetonations: number
}

export const REINFORCEMENT_SECONDS = [10, 30, 60, 90, 120, 150] as const
export const DETONATION_SECONDS = [30, 60, 90, 120, 150] as const
export const LATE_DETONATION_LEVELS = new Set([14, 18])
export const LATE_DETONATION_SECONDS = [90, 120, 150] as const

type StatusFlags = Record<'poison' | 'burn' | 'freeze' | 'radiation' | 'armorBreak' | 'vulnerable', boolean>

export const statusFlags = (status: EnemyStatus): StatusFlags => ({
  poison: status.poisonSeconds > 0,
  burn: status.burnSeconds > 0,
  freeze: status.freezeSeconds > 0,
  radiation: status.radiationStacks > 0,
  armorBreak: status.armorBrokenSeconds > 0,
  vulnerable: status.vulnerableSeconds > 0,
})

export function routeSamples(level: LevelConfig, routeIndex: number, count = 160) {
  const path = level.paths?.[routeIndex] ?? level.path
  return Array.from({ length: count + 1 }, (_, index) => pointOnPath(path, index / count))
}

export function rankedTerminalHoles(level: LevelConfig, state: BattleState, kind: DeviceKind, bias: RouteBias) {
  const occupied = new Set(state.placements.filter((item) => !item.destroyed).map((item) => item.holeId))
  const range = terminalAttackRange({ id: '', kind, holeId: '', rotationDeg: 0, upgradeLevel: 1 })
  const paths = level.paths ?? [level.path]
  const samples = paths.map((_, routeIndex) => routeSamples(level, routeIndex))
  const existingTerminals = state.placements.filter((placement) => !placement.destroyed && terminalAttackRange(placement) > 0).map((placement) => ({
    point: level.holes[Number(placement.holeId.slice(2))],
    range: terminalAttackRange(placement),
  }))
  return level.holes.map((hole, index) => {
    const routeScores = samples.map((points) => points.reduce((score, point, sampleIndex) => {
      if (Math.hypot(point.x - hole.x, point.y - hole.y) > range) return score
      const progress = sampleIndex / Math.max(1, points.length - 1)
      const exitWeight = 1 + 6 * (1 - progress) * (1 - progress)
      const existingCoverage = existingTerminals.filter((terminal) => Math.hypot(point.x - terminal.point.x, point.y - terminal.point.y) <= terminal.range).length
      return score + exitWeight / (1 + existingCoverage * 2.5)
    }, 0))
    const score = bias === 'all'
      ? routeScores.reduce((sum, value) => sum + value, 0) + (routeScores.length > 1 ? Math.min(...routeScores) * 2 : 0)
      : routeScores[bias] ?? 0
    return { holeId: `h-${index}`, point: hole, score }
  }).filter((item) => !occupied.has(item.holeId) && item.score > 0).sort((left, right) => right.score - left.score)
}

export function distanceToRoutes(level: LevelConfig, point: { x: number; y: number }) {
  return Math.min(...(level.paths ?? [level.path]).flatMap((_, routeIndex) => routeSamples(level, routeIndex, 80)
    .map((sample) => Math.hypot(sample.x - point.x, sample.y - point.y))))
}

export function sourceCandidates(level: LevelConfig, state: BattleState, targetId: string) {
  const target = state.placements.find((item) => item.id === targetId)
  if (!target) return []
  const targetPoint = level.holes[Number(target.holeId.slice(2))]
  const occupied = new Set(state.placements.filter((item) => !item.destroyed).map((item) => item.holeId))
  return level.holes.map((point, index) => {
    const distance = Math.hypot(point.x - targetPoint.x, point.y - targetPoint.y)
    const routeClearance = distanceToRoutes(level, point)
    const lineClearance = Math.min(...(level.paths ?? [level.path]).flatMap((_, routeIndex) => routeSamples(level, routeIndex, 120).map((sample) => {
      const segmentX = targetPoint.x - point.x
      const segmentY = targetPoint.y - point.y
      const segmentLengthSq = segmentX * segmentX + segmentY * segmentY
      const projection = segmentLengthSq ? Math.max(0, Math.min(1, ((sample.x - point.x) * segmentX + (sample.y - point.y) * segmentY) / segmentLengthSq)) : 0
      return Math.hypot(sample.x - (point.x + segmentX * projection), sample.y - (point.y + segmentY * projection))
    })))
    const preferredDistance = Math.max(0, 220 - Math.abs(distance - level.grid.cellSize * 1.35))
    return { holeId: `h-${index}`, score: preferredDistance + routeClearance * 0.35 + Math.min(180, lineClearance * 3), distance, lineClearance }
  }).filter((item) => !occupied.has(item.holeId) && item.distance > 28 && item.distance < level.grid.cellSize * 3.2 && item.lineClearance > 20)
    .sort((left, right) => right.score - left.score)
}

export function addSourceToTarget(state: BattleState, level: LevelConfig, kind: SourceKind, targetId: string) {
  const before = totalPower(traceOpticalNetwork(level, state.placements).deviceInputs.get(targetId) ?? { r: 0, g: 0, b: 0 })
  for (const candidate of sourceCandidates(level, state, targetId)) {
    const placed = placeDevice(state, level, kind, candidate.holeId)
    if (!placed.ok) continue
    const source = placed.state.placements.at(-1)!
    const snapped = snapDeviceOutputToTarget(placed.state, level, source.id, 0, targetId)
    const after = totalPower(traceOpticalNetwork(level, snapped.placements).deviceInputs.get(targetId) ?? { r: 0, g: 0, b: 0 })
    if (after > before + 1) return snapped
  }
  throw new Error(`L${level.id}: unable to connect ${kind} to ${targetId}`)
}

export function upgradeTo(state: BattleState, placementId: string, targetLevel: 1 | 2 | 3) {
  let next = state
  while ((next.placements.find((item) => item.id === placementId)?.upgradeLevel ?? 1) < targetLevel) {
    const upgraded = upgradeDevice(next, placementId)
    if (!upgraded.ok) throw new Error(upgraded.reason)
    next = upgraded.state
  }
  return next
}

export function addDirectBranch(
  state: BattleState,
  level: LevelConfig,
  sourceKind: SourceKind,
  terminalKind: DeviceKind,
  upgradeLevel: 1 | 2 | 3,
  bias: RouteBias = 'all',
) {
  for (const terminalHole of rankedTerminalHoles(level, state, terminalKind, bias)) {
    const placed = placeDevice(state, level, terminalKind, terminalHole.holeId)
    if (!placed.ok) continue
    const terminal = placed.state.placements.at(-1)!
    try {
      let next = addSourceToTarget(placed.state, level, sourceKind, terminal.id)
      next = upgradeTo(next, terminal.id, upgradeLevel)
      return next
    } catch {
      // Try the next coverage-ranked terminal hole when no clear source ray exists.
    }
  }
  throw new Error(`L${level.id}: unable to build ${sourceKind} -> ${terminalKind}`)
}

export function preferredReinforcementKinds(level: LevelConfig): DeviceKind[] {
  if (level.id <= 3) return ['laser-emitter', 'bulb']
  if (level.id === 4) return ['radiation-source', 'bulb']
  if (level.id <= 6) return ['brazier', 'bulb', 'laser-emitter']
  if (level.id <= 8) return ['brazier', 'frost-tower', 'laser-emitter']
  return ['brazier', 'frost-tower', 'radiation-source', 'laser-emitter']
}

export function reinforce(state: BattleState, level: LevelConfig, reinforcementIndex: number) {
  let next = state
  let spentCoins = 0
  const spend = (updated: BattleState) => {
    spentCoins += Math.max(0, next.coins - updated.coins)
    next = updated
  }

  const branchKinds = preferredReinforcementKinds(level)
  if (next.capacityW - next.usedPowerW >= 50) {
    for (let offset = 0; offset < branchKinds.length; offset += 1) {
      const kind = branchKinds[(reinforcementIndex + offset) % branchKinds.length]
      if (!level.availableDevices.includes(kind)) continue
      try {
        const branch = addDirectBranch(next, level, 'source-red', kind, 1, level.paths?.length === 2 ? reinforcementIndex % 2 : 'all')
        spend(branch)
        break
      } catch {
        // Another branch type may fit the remaining coins, capacity, and geometry.
      }
    }
  }

  const priorities = new Map(branchKinds.map((kind, index) => [kind, index]))
  const upgradable = () => next.placements.filter((placement) => terminalAttackRange(placement) > 0 && (placement.upgradeLevel ?? 1) < 3)
    .sort((left, right) => (priorities.get(left.kind) ?? 99) - (priorities.get(right.kind) ?? 99)
      || (left.upgradeLevel ?? 1) - (right.upgradeLevel ?? 1))
  while (true) {
    const placement = upgradable().find((candidate) => {
      const probe = upgradeDevice(next, candidate.id)
      return probe.ok
    })
    if (!placement) break
    const upgraded = upgradeDevice(next, placement.id)
    if (!upgraded.ok) break
    spend(upgraded.state)
  }
  return { state: next, spentCoins }
}

export function addWhiteBranch(
  state: BattleState,
  level: LevelConfig,
  terminalKind: DeviceKind,
  upgradeLevel: 1 | 2 | 3,
  bias: RouteBias = 'all',
) {
  for (const terminalHole of rankedTerminalHoles(level, state, terminalKind, bias)) {
    const terminalResult = placeDevice(state, level, terminalKind, terminalHole.holeId)
    if (!terminalResult.ok) continue
    const terminal = terminalResult.state.placements.at(-1)!
    const combinerHoles = sourceCandidates(level, terminalResult.state, terminal.id)
    for (const combinerHole of combinerHoles) {
      const combinerResult = placeDevice(terminalResult.state, level, 'combiner', combinerHole.holeId)
      if (!combinerResult.ok) continue
      const combiner = combinerResult.state.placements.at(-1)!
      let next = snapDeviceOutputToTarget(combinerResult.state, level, combiner.id, 0, terminal.id)
      try {
        next = addSourceToTarget(next, level, 'source-red', combiner.id)
        next = addSourceToTarget(next, level, 'source-green', combiner.id)
        next = addSourceToTarget(next, level, 'source-blue', combiner.id)
        const input = traceOpticalNetwork(level, next.placements).deviceInputs.get(terminal.id)
        if (!input || input.r < 40 || input.g < 60 || input.b < 80) continue
        return upgradeTo(next, terminal.id, upgradeLevel)
      } catch {
        // Try another combiner/terminal geometry when one of the RGB rays is blocked.
      }
    }
  }
  throw new Error(`L${level.id}: unable to build RGB combiner -> ${terminalKind}`)
}

export function addWhiteSplitBranch(
  state: BattleState,
  level: LevelConfig,
  terminalKind: DeviceKind,
  upgradeLevel: 1 | 2 | 3,
  biases: readonly RouteBias[] = ['all', 'all'],
) {
  let next = state
  const terminalIds: string[] = []
  for (const bias of biases) {
    const hole = rankedTerminalHoles(level, next, terminalKind, bias).at(0)
    if (!hole) throw new Error(`L${level.id}: no white-split terminal hole`)
    const placed = placeDevice(next, level, terminalKind, hole.holeId)
    if (!placed.ok) throw new Error(placed.reason)
    next = placed.state
    terminalIds.push(next.placements.at(-1)!.id)
  }
  for (const splitterHole of sourceCandidates(level, next, terminalIds[0])) {
    const splitterResult = placeDevice(next, level, 'splitter', splitterHole.holeId)
    if (!splitterResult.ok) continue
    let splitterState = splitterResult.state
    const splitter = splitterState.placements.at(-1)!
    terminalIds.forEach((terminalId, outputIndex) => {
      splitterState = snapDeviceOutputToTarget(splitterState, level, splitter.id, outputIndex, terminalId)
    })
    for (const combinerHole of sourceCandidates(level, splitterState, splitter.id)) {
      const combinerResult = placeDevice(splitterState, level, 'combiner', combinerHole.holeId)
      if (!combinerResult.ok) continue
      let candidate = combinerResult.state
      const combiner = candidate.placements.at(-1)!
      candidate = snapDeviceOutputToTarget(candidate, level, combiner.id, 0, splitter.id)
      try {
        candidate = addSourceToTarget(candidate, level, 'source-red', combiner.id)
        candidate = addSourceToTarget(candidate, level, 'source-green', combiner.id)
        candidate = addSourceToTarget(candidate, level, 'source-blue', combiner.id)
        const network = traceOpticalNetwork(level, candidate.placements)
        if (!terminalIds.every((terminalId) => totalPower(network.deviceInputs.get(terminalId) ?? { r: 0, g: 0, b: 0 }) > 40)) continue
        for (const terminalId of terminalIds) candidate = upgradeTo(candidate, terminalId, upgradeLevel)
        return candidate
      } catch {
        // Try another combiner/splitter geometry with three clear source rays.
      }
    }
  }
  throw new Error(`L${level.id}: unable to build RGB combiner -> splitter -> terminals`)
}

export function addRgbPrismNetwork(
  state: BattleState,
  level: LevelConfig,
  terminals: readonly DeviceKind[] = ['bulb', 'brazier', 'laser-emitter'],
) {
  let next = state
  const terminalIds: string[] = []
  for (const kind of terminals) {
    const terminalHole = rankedTerminalHoles(level, next, kind, 'all').at(0)
    if (!terminalHole) throw new Error(`L${level.id}: no coverage hole for ${kind}`)
    const placed = placeDevice(next, level, kind, terminalHole.holeId)
    if (!placed.ok) throw new Error(placed.reason)
    next = placed.state
    terminalIds.push(next.placements.at(-1)!.id)
  }

  for (const prismHole of sourceCandidates(level, next, terminalIds[0])) {
    const prismResult = placeDevice(next, level, 'prism-splitter', prismHole.holeId)
    if (!prismResult.ok) continue
    let prismState = prismResult.state
    const prism = prismState.placements.at(-1)!
    terminalIds.forEach((terminalId, outputIndex) => {
      prismState = snapDeviceOutputToTarget(prismState, level, prism.id, outputIndex, terminalId)
    })
    for (const combinerHole of sourceCandidates(level, prismState, prism.id)) {
      const combinerResult = placeDevice(prismState, level, 'combiner', combinerHole.holeId)
      if (!combinerResult.ok) continue
      let candidate = combinerResult.state
      const combiner = candidate.placements.at(-1)!
      candidate = snapDeviceOutputToTarget(candidate, level, combiner.id, 0, prism.id)
      try {
        candidate = addSourceToTarget(candidate, level, 'source-red', combiner.id)
        candidate = addSourceToTarget(candidate, level, 'source-green', combiner.id)
        candidate = addSourceToTarget(candidate, level, 'source-blue', combiner.id)
        const network = traceOpticalNetwork(level, candidate.placements)
        if (terminalIds.every((terminalId) => totalPower(network.deviceInputs.get(terminalId) ?? { r: 0, g: 0, b: 0 }) > 10)) {
          return candidate
        }
      } catch {
        // Try another stable prism and combiner geometry.
      }
    }
  }
  throw new Error(`L${level.id}: unable to build RGB combiner -> prism -> terminals`)
}

export function addSplitBranch(
  state: BattleState,
  level: LevelConfig,
  sourceKind: SourceKind,
  terminalKind: DeviceKind,
  terminalCount = 2,
) {
  let next = state
  const terminalIds: string[] = []
  for (let index = 0; index < terminalCount; index += 1) {
    const hole = rankedTerminalHoles(level, next, terminalKind, level.paths?.length === 2 ? index % 2 : 'all').at(0)
    if (!hole) throw new Error(`L${level.id}: no split-terminal hole for ${terminalKind}`)
    const placed = placeDevice(next, level, terminalKind, hole.holeId)
    if (!placed.ok) throw new Error(placed.reason)
    next = placed.state
    terminalIds.push(next.placements.at(-1)!.id)
  }
  for (const splitterHole of sourceCandidates(level, next, terminalIds[0])) {
    const splitterResult = placeDevice(next, level, 'splitter', splitterHole.holeId)
    if (!splitterResult.ok) continue
    let candidate = splitterResult.state
    const splitter = candidate.placements.at(-1)!
    candidate = updateDevice(candidate, splitter.id, { splitRatios: Array.from({ length: terminalCount }, () => 1) })
    terminalIds.forEach((terminalId, outputIndex) => {
      candidate = snapDeviceOutputToTarget(candidate, level, splitter.id, outputIndex, terminalId)
    })
    try {
      candidate = addSourceToTarget(candidate, level, sourceKind, splitter.id)
      const network = traceOpticalNetwork(level, candidate.placements)
      if (terminalIds.every((terminalId) => totalPower(network.deviceInputs.get(terminalId) ?? { r: 0, g: 0, b: 0 }) > 10)) return candidate
    } catch {
      // Try another splitter geometry with clear rays to all terminals.
    }
  }
  throw new Error(`L${level.id}: unable to build ${sourceKind} -> splitter -> ${terminalKind}`)
}

export function rankedCapacitorHoles(level: LevelConfig, state: BattleState) {
  const occupied = new Set(state.placements.filter((item) => !item.destroyed).map((item) => item.holeId))
  const samples = (level.paths ?? [level.path]).flatMap((_, routeIndex) => routeSamples(level, routeIndex, 120))
  return level.holes.map((hole, index) => ({
    holeId: `h-${index}`,
    score: samples.reduce((score, point) => score + (Math.hypot(point.x - hole.x, point.y - hole.y) <= 380 ? 1 : 0), 0),
  })).filter((item) => !occupied.has(item.holeId) && item.score > 0).sort((left, right) => right.score - left.score)
}

export function addCollectorCapacitor(state: BattleState, level: LevelConfig) {
  const poweredAreaTerminals = state.placements.filter((placement) => ['bulb', 'radiation-source', 'frost-tower', 'brazier'].includes(placement.kind))
  for (const capacitorHole of rankedCapacitorHoles(level, state)) {
    const capacitorResult = placeDevice(state, level, 'capacitor', capacitorHole.holeId)
    if (!capacitorResult.ok) continue
    const capacitor = capacitorResult.state.placements.at(-1)!
    for (const collectorHole of sourceCandidates(level, capacitorResult.state, capacitor.id)) {
      const collectorPoint = level.holes[Number(collectorHole.holeId.slice(2))]
      const terminal = poweredAreaTerminals.find((candidate) => {
        const terminalPoint = level.holes[Number(candidate.holeId.slice(2))]
        return Math.hypot(terminalPoint.x - collectorPoint.x, terminalPoint.y - collectorPoint.y) <= terminalAttackRange(candidate)
      })
      if (!terminal) continue
      const collectorResult = placeDevice(capacitorResult.state, level, 'collector', collectorHole.holeId)
      if (!collectorResult.ok) continue
      const collector = collectorResult.state.placements.at(-1)!
      const snapped = snapDeviceOutputToTarget(collectorResult.state, level, collector.id, 0, capacitor.id)
      const network = traceOpticalNetwork(level, snapped.placements)
      if ((network.capacitorInputsW.get(capacitor.id) ?? 0) > 1) return snapped
    }
  }
  throw new Error(`L${level.id}: unable to build collector -> capacitor`)
}

export function augmentRecommended(state: BattleState, level: LevelConfig) {
  if (![9, 16, 18].includes(level.id)) return state
  try {
    return addCollectorCapacitor(state, level)
  } catch {
    return state
  }
}

export function buildLevelOne(state: BattleState, level: LevelConfig) {
  let next = placeDevice(state, level, 'source-red', 'h-0').state
  next = placeDevice(next, level, 'mirror', 'h-2').state
  next = placeDevice(next, level, 'bulb', 'h-16').state
  const mirror = next.placements.find((item) => item.kind === 'mirror')!
  const bulb = next.placements.find((item) => item.kind === 'bulb')!
  next = snapDeviceOutputToTarget(next, level, mirror.id, 0, bulb.id)
  next = placeDevice(next, level, 'source-red', 'h-39').state
  next = placeDevice(next, level, 'bulb', 'h-40').state
  return next
}

export function buildRecommended(level: LevelConfig) {
  let state = createBattleState(level)
  if (level.id === 1) return buildLevelOne(state, level)
  if (level.id <= 4) {
    if (level.id === 4) {
      state = addDirectBranch(state, level, 'source-red', 'radiation-source', 1)
      state = addDirectBranch(state, level, 'source-red', 'radiation-source', 1)
      return addDirectBranch(state, level, 'source-red', 'laser-emitter', 1)
    }
    if (level.id >= 3) {
      state = addDirectBranch(state, level, 'source-red', 'bulb', 2)
      state = addDirectBranch(state, level, 'source-red', 'bulb', 2)
      return addDirectBranch(state, level, 'source-red', 'laser-emitter', 2)
    }
    state = addDirectBranch(state, level, 'source-red', 'bulb', 2)
    state = addDirectBranch(state, level, 'source-red', 'bulb', 2)
    return state
  }
  if (level.id === 5) {
    state = addDirectBranch(state, level, 'source-red', 'bulb', 2)
    state = addDirectBranch(state, level, 'source-green', 'brazier', 3)
    state = addDirectBranch(state, level, 'source-green', 'laser-emitter', 1)
    return state
  }
  if (level.id === 6) {
    state = addDirectBranch(state, level, 'source-green', 'brazier', 2)
    state = addDirectBranch(state, level, 'source-red', 'laser-emitter', 2)
    return state
  }
  if (level.id <= 8) {
    // Leave capacity headroom so in-battle reinforcement can add branches early.
    state = addDirectBranch(state, level, 'source-blue', 'frost-tower', 2)
    state = addDirectBranch(state, level, 'source-green', 'brazier', 2)
    return state
  }
  if (level.id === 9) {
    // L9: white bulb leaves capacity headroom for the collector-capacitor augment.
    return addWhiteBranch(state, level, 'bulb', 3)
  }
  if (level.id <= 11) {
    state = addWhiteBranch(state, level, 'bulb', 3)
    state = addDirectBranch(state, level, 'source-blue', 'frost-tower', 3)
    return state
  }
  if (level.id === 12) {
    state = addWhiteBranch(state, level, 'bulb', 3)
    return addDirectBranch(state, level, 'source-green', 'brazier', 2)
  }
  if (level.id === 13) {
    state = addWhiteSplitBranch(state, level, 'bulb', 2)
    state = addDirectBranch(state, level, 'source-blue', 'frost-tower', 2)
    return addDirectBranch(state, level, 'source-green', 'brazier', 2)
  }
  if (level.id === 14) {
    state = addWhiteSplitBranch(state, level, 'bulb', 1, [0, 1])
    state = addDirectBranch(state, level, 'source-blue', 'frost-tower', 2)
    return addDirectBranch(state, level, 'source-blue', 'frost-tower', 1)
  }
  if (level.id === 15) {
    state = addWhiteBranch(state, level, 'bulb', 3)
    state = addDirectBranch(state, level, 'source-blue', 'frost-tower', 3)
    return addDirectBranch(state, level, 'source-blue', 'brazier', 3)
  }
  if (level.id === 16) {
    state = addWhiteSplitBranch(state, level, 'bulb', 2)
    state = addDirectBranch(state, level, 'source-blue', 'frost-tower', 3)
    return addDirectBranch(state, level, 'source-green', 'brazier', 3)
  }
  if (level.id === 17) {
    state = addWhiteSplitBranch(state, level, 'bulb', 2)
    state = addDirectBranch(state, level, 'source-blue', 'frost-tower', 3)
    state = addDirectBranch(state, level, 'source-green', 'brazier', 3)
    state = addDirectBranch(state, level, 'source-red', 'laser-emitter', 1)
    return addDirectBranch(state, level, 'source-red', 'laser-emitter', 1)
  }
  if (level.id === 18) {
    state = addWhiteSplitBranch(state, level, 'bulb', 2, [0, 1])
    state = addDirectBranch(state, level, 'source-blue', 'frost-tower', 2)
    return addDirectBranch(state, level, 'source-blue', 'frost-tower', 2)
  }
  state = addWhiteBranch(state, level, 'bulb', 3)
  return addDirectBranch(state, level, 'source-blue', 'frost-tower', 2)
}

export function buildWrong(level: LevelConfig) {
  if (level.id === 1) return createBattleState(level)
  return addDirectBranch(createBattleState(level), level, 'source-red', level.id >= 11 ? 'laser-emitter' : 'bulb', 3, 0)
}

export function simulate(level: LevelConfig, policy: BenchmarkMetrics['policy'], built: BattleState): BenchmarkMetrics {
  let spentCoins = level.startingCoins - built.coins
  let state = startWave(built)
  let reinforcementIndex = 0
  let detonationIndex = 0
  let capacitorDetonations = 0
  let firstKillSeconds: number | null = null
  let statusTriggers = 0
  const previousFlags = new Map<string, StatusFlags>()
  const firstStatusAt = new Map<string, number>()
  const statusSurvivalSeconds: number[] = []
  const slowestSpeed = Math.min(...state.spawnPlan.map((entry) => entry.speed))
  const longestPath = Math.max(...(level.paths ?? [level.path]).map((path) => path.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - path[index].x, point.y - path[index].y), 0)))
  const maximumSeconds = (state.spawnPlan.at(-1)?.atSeconds ?? 0) + longestPath / slowestSpeed + 120

  while (state.phase === 'running' && state.elapsedSeconds < maximumSeconds) {
    state = advanceBattle(state, level, 0.25)
    if (policy === 'recommended') {
      while (reinforcementIndex < REINFORCEMENT_SECONDS.length
        && state.elapsedSeconds + 1e-6 >= REINFORCEMENT_SECONDS[reinforcementIndex]) {
        const reinforced = reinforce(state, level, reinforcementIndex)
        state = reinforced.state
        spentCoins += reinforced.spentCoins
        reinforcementIndex += 1
      }
      while (detonationIndex < DETONATION_SECONDS.length
        && state.elapsedSeconds + 1e-6 >= DETONATION_SECONDS[detonationIndex]) {
        const capacitor = state.placements.find((placement) => placement.kind === 'capacitor' && (placement.chargeJ ?? 0) >= 180)
        if (capacitor) {
          const queued = queueCapacitorDetonation(state, capacitor.id)
          if (queued.ok) {
            state = queued.state
            capacitorDetonations += 1
          }
        }
        detonationIndex += 1
      }
    }
    if (firstKillSeconds === null && state.events.some((event) => event.type === 'kill')) firstKillSeconds = state.elapsedSeconds
    state.enemies.forEach((enemy) => {
      const current = statusFlags(enemy.status)
      const previous = previousFlags.get(enemy.id) ?? {
        poison: false, burn: false, freeze: false, radiation: false, armorBreak: false, vulnerable: false,
      }
      const activated = (Object.keys(current) as Array<keyof StatusFlags>).filter((key) => current[key] && !previous[key]).length
      statusTriggers += activated
      if (activated > 0 && !firstStatusAt.has(enemy.id)) firstStatusAt.set(enemy.id, state.elapsedSeconds)
      if ((enemy.dead || enemy.escaped) && firstStatusAt.has(enemy.id)) {
        statusSurvivalSeconds.push(Math.max(0, state.elapsedSeconds - firstStatusAt.get(enemy.id)!))
        firstStatusAt.delete(enemy.id)
      }
      previousFlags.set(enemy.id, current)
    })
  }

  const kills = state.enemies.filter((enemy) => enemy.dead).length
  const leaks = state.enemies.filter((enemy) => enemy.escaped).length
  const totalDamage = state.enemies.reduce((sum, enemy) => sum + enemy.maxHealth - enemy.health, 0)
  return {
    levelId: level.id,
    policy,
    phase: state.phase,
    coreHealth: state.coreHealth,
    kills,
    leaks,
    firstKillSeconds,
    statusTriggers,
    statusSurvivalSamples: statusSurvivalSeconds.length,
    averageStatusSurvivalSeconds: statusSurvivalSeconds.length
      ? statusSurvivalSeconds.reduce((sum, value) => sum + value, 0) / statusSurvivalSeconds.length
      : 0,
    damagePerWatt: totalDamage / Math.max(1, state.peakUsedPowerW),
    damagePerCoin: totalDamage / Math.max(1, spentCoins),
    peakPowerW: state.peakUsedPowerW,
    endingCapacityW: state.capacityW,
    spentCoins,
    elapsedSeconds: state.elapsedSeconds,
    capacitorDetonations,
  }
}
