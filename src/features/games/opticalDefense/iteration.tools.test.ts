import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

import { OPTICAL_DEFENSE_LEVELS } from './levels'
import { totalPower } from './rules'
import { traceOpticalNetwork } from './optics'
import {
  advanceBattle, createBattleState, placeDevice, snapDeviceOutputToTarget, startWave, terminalAttackRange,
} from './simulation'
import type { BattleState } from './simulation'
import {
  augmentRecommended, buildRecommended, buildWrong, simulate, reinforce, statusFlags,
  addDirectBranch, addSplitBranch, addWhiteBranch, addWhiteSplitBranch, upgradeTo,
  DETONATION_SECONDS, REINFORCEMENT_SECONDS, LATE_DETONATION_LEVELS, LATE_DETONATION_SECONDS,
} from './benchmark-strategies'
import type { BenchmarkMetrics, RouteBias } from './benchmark-strategies'
import { queueCapacitorDetonation } from './simulation'

/** A/B experiment config: test-results/experiment.json
 * {
 *   "levels": { "3": [ { "name": "desc", "branches": [["direct","source-red","bulb",2,"all"], ...] } ] }
 * }
 * Branch shapes:
 *   ["direct", sourceKind, terminalKind, upgradeLevel, bias?]
 *   ["split", sourceKind, terminalKind, count(2|3), upgradeLevel?, bias?]
 * Bias may be 'all' or a route index.
 */
export type ExperimentBranch = Array<string | number | RouteBias | undefined>

/** Returns a copy of the level with every enemy's health scaled by `mult`.
 *  Used to calibrate product-level numeric adjustments (HP curve tuning). */
export function scaleLevelHealth(level: (typeof OPTICAL_DEFENSE_LEVELS)[number], mult: number) {
  return {
    ...level,
    waves: level.waves.map((item) => ({
      ...item,
      enemies: item.enemies.map((enemy) => ({ ...enemy, health: Math.round(enemy.health * mult) })),
    })),
  }
}

export function buildFromBranches(level: (typeof OPTICAL_DEFENSE_LEVELS)[number], branches: ExperimentBranch[]) {
  let state = createBattleState(level)
  branches.forEach((branch) => {
    const [type, ...rest] = branch
    if (type === 'split') {
      const [source, terminal, count, upgradeLevel, bias] = rest as [string, string, number, 1 | 2 | 3 | undefined, RouteBias | undefined]
      state = addSplitBranch(state, level, source as Parameters<typeof addSplitBranch>[2], terminal as Parameters<typeof addSplitBranch>[3], count)
      if (upgradeLevel && upgradeLevel > 1) {
        state.placements.filter((placement) => terminalAttackRange(placement) > 0)
          .forEach((placement) => {
            while ((state.placements.find((item) => item.id === placement.id)?.upgradeLevel ?? 1) < upgradeLevel) {
              state = upgradeTo(state, placement.id, upgradeLevel)
            }
          })
      }
      return
    }
    if (type === 'white') {
      const [terminal, upgradeLevel, bias] = rest as [string, 1 | 2 | 3, RouteBias | undefined]
      state = addWhiteBranch(state, level, terminal as Parameters<typeof addWhiteBranch>[2], upgradeLevel, bias ?? 'all')
      return
    }
    if (type === 'white-split') {
      const [terminal, upgradeLevel, biases] = rest as [string, 1 | 2 | 3, Array<RouteBias | undefined> | undefined]
      state = addWhiteSplitBranch(state, level, terminal as Parameters<typeof addWhiteSplitBranch>[2], upgradeLevel, (biases ?? ['all', 'all']) as readonly RouteBias[])
      return
    }
    const [source, terminal, upgradeLevel, bias] = rest as [string, string, 1 | 2 | 3, RouteBias | undefined]
    state = addDirectBranch(state, level, source as Parameters<typeof addDirectBranch>[2], terminal as Parameters<typeof addDirectBranch>[3], upgradeLevel, bias ?? 'all')
  })
  return state
}

/**
 * Simulates like `simulate` but writes an economy/build trace to lines[] at each
 * reinforcement checkpoint, plus terminal inputs per phase.
 */
export function simulateTraced(
  level: (typeof OPTICAL_DEFENSE_LEVELS)[number],
  built: BattleState,
  lines: string[],
): BenchmarkMetrics {
  let spentCoins = level.startingCoins - built.coins
  let state = startWave(built)
  let reinforcementIndex = 0
  let detonationIndex = 0
  let capacitorDetonations = 0
  let firstKillSeconds: number | null = null
  let statusTriggers = 0
  const previousFlags = new Map<string, ReturnType<typeof statusFlags>>()
  const firstStatusAt = new Map<string, number>()
  const statusSurvivalSeconds: number[] = []
  const slowestSpeed = Math.min(...state.spawnPlan.map((entry) => entry.speed))
  const longestPath = Math.max(...(level.paths ?? [level.path]).map((path) => path.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - path[index].x, point.y - path[index].y), 0)))
  const maximumSeconds = (state.spawnPlan.at(-1)?.atSeconds ?? 0) + longestPath / slowestSpeed + 120
  const logCheckpoint = (label: string, current: BattleState) => {
    const kills = current.enemies.filter((enemy) => enemy.dead).length
    const leaks = current.enemies.filter((enemy) => enemy.escaped).length
    const terminalInfo = current.placements
      .filter((placement) => terminalAttackRange(placement) > 0 && !placement.destroyed)
      .map((placement) => {
        const input = current.network?.deviceInputs.get(placement.id)
        const watts = input ? totalPower(input) : 0
        return `${placement.kind}@${placement.holeId}:L${placement.upgradeLevel ?? 1}(${watts.toFixed(0)}W)`
      }).join(' ')
    lines.push(`  [${label}] t=${current.elapsedSeconds.toFixed(1)}s coins=${current.coins} cap=${current.capacityW} used=${current.usedPowerW} kills=${kills} leaks=${leaks} core=${current.coreHealth}`)
    if (terminalInfo) lines.push(`    ${terminalInfo}`)
  }

  logCheckpoint('start', state)
  while (state.phase === 'running' && state.elapsedSeconds < maximumSeconds) {
    state = advanceBattle(state, level, 0.25)
    if (true) {
      while (reinforcementIndex < REINFORCEMENT_SECONDS.length
        && state.elapsedSeconds + 1e-6 >= REINFORCEMENT_SECONDS[reinforcementIndex]) {
        const reinforced = reinforce(state, level, reinforcementIndex)
        state = reinforced.state
        spentCoins += reinforced.spentCoins
        reinforcementIndex += 1
        logCheckpoint(`reinforce`, state)
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
      const activated = (Object.keys(current) as Array<keyof typeof current>).filter((key) => current[key] && !previous[key]).length
      statusTriggers += activated
      if (activated > 0 && !firstStatusAt.has(enemy.id)) firstStatusAt.set(enemy.id, state.elapsedSeconds)
      if ((enemy.dead || enemy.escaped) && firstStatusAt.has(enemy.id)) {
        statusSurvivalSeconds.push(Math.max(0, state.elapsedSeconds - firstStatusAt.get(enemy.id)!))
        firstStatusAt.delete(enemy.id)
      }
      previousFlags.set(enemy.id, current)
    })
  }
  logCheckpoint('end', state)

  const leaksByKind = state.enemies.filter((enemy) => enemy.escaped)
    .reduce<Record<string, number>>((acc, enemy) => {
      acc[enemy.kind] = (acc[enemy.kind] ?? 0) + 1
      return acc
    }, {})
  if (Object.keys(leaksByKind).length) {
    lines.push(`  leaksByKind: ${Object.entries(leaksByKind).map(([kind, count]) => `${kind}×${count}`).join(' ')}`)
  }

  const kills = state.enemies.filter((enemy) => enemy.dead).length
  const leaks = state.enemies.filter((enemy) => enemy.escaped).length
  const totalDamage = state.enemies.reduce((sum, enemy) => sum + enemy.maxHealth - enemy.health, 0)
  return {
    levelId: level.id,
    policy: 'recommended',
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

/**
 * Fast iteration harness for difficulty calibration. Not a real assertion suite.
 *
 * Usage:
 *   OPTICAL_ITER_LEVEL=3 npx vitest run src/features/games/opticalDefense/iteration.tools.test.ts
 *   OPTICAL_ITER_LEVEL=3,4,6 npx vitest run ...
 *   OPTICAL_ITER_LEVEL=all npx vitest run ...
 *
 * Writes a compact per-level report to test-results/optical-iter.txt so strategies
 * can be tuned quickly without waiting for the full 38-run benchmark.
 */

function fmt(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value) ? '-' : value.toFixed(digits)
}

describe('optical defense iteration harness', () => {
  it('reproduces the E2E L1 build and reports 14s kills', () => {
    if (!process.env.OPTICAL_E2E_CHECK) return
    const level = OPTICAL_DEFENSE_LEVELS[0]
    let state = createBattleState(level)
    state = placeDevice(state, level, 'source-red', 'h-0').state
    state = placeDevice(state, level, 'mirror', 'h-2').state
    state = placeDevice(state, level, 'bulb', 'h-16').state
    const mirror = state.placements.find((item) => item.kind === 'mirror')!
    const bulb = state.placements.find((item) => item.kind === 'bulb')!
    state = snapDeviceOutputToTarget(state, level, mirror.id, 0, bulb.id)
    let s = startWave(state)
    while (s.phase === 'running' && s.elapsedSeconds < 14) {
      s = advanceBattle(s, level, 0.25)
    }
    const kills = s.enemies.filter((enemy) => enemy.dead).length
    const line = `E2E L1 14s: kills=${kills} capacity=${s.capacityW} core=${s.coreHealth}`
    mkdirSync('test-results', { recursive: true })
    writeFileSync('test-results/optical-e2e-check.txt', line + '\n')
    console.log(line)
  }, 60_000)

  it('prints per-level calibration metrics', () => {
    const target = process.env.OPTICAL_ITER_LEVEL ?? ''
    const ids = target === 'all'
      ? OPTICAL_DEFENSE_LEVELS.map((level) => level.id)
      : target ? target.split(',').map((value) => Number(value.trim())) : []
    const lines: string[] = []
    ids.forEach((id) => {
      const level = OPTICAL_DEFENSE_LEVELS.find((item) => item.id === id)
      if (!level) return
      const recommendedBuild = augmentRecommended(buildRecommended(level), level)
      const recommended = simulate(level, 'recommended', recommendedBuild)
      const wrong = simulate(level, 'wrong', buildWrong(level))
      const coreThreshold = Math.ceil(level.coreHealth * (level.id <= 3 ? 0.8 : level.id <= 10 ? 0.6 : 0.25))
      lines.push([
        `L${level.id}`,
        `rec=${recommended.phase.slice(0, 4)}`,
        `core=${recommended.coreHealth}/${level.coreHealth}>=${coreThreshold}`,
        recommended.coreHealth >= coreThreshold ? 'OK' : 'FAIL',
        `kills=${recommended.kills}`,
        `leaks=${recommended.leaks}`,
        `statusLife=${fmt(recommended.averageStatusSurvivalSeconds)}s(${recommended.statusSurvivalSamples})`,
        `dmgW=${fmt(recommended.damagePerWatt)}`,
        `dmgCoin=${fmt(recommended.damagePerCoin)}`,
        `power=${recommended.peakPowerW}/${recommended.endingCapacityW}`,
        `coins=${recommended.spentCoins}`,
        `elapsed=${fmt(recommended.elapsedSeconds)}`,
        `cap=${recommended.capacitorDetonations}`,
      ].join(' | '))
      lines.push(`  wrong: ${wrong.phase.slice(0, 4)} core=${wrong.coreHealth}/${level.coreHealth} kills=${wrong.kills} leaks=${wrong.leaks} firstKill=${fmt(wrong.firstKillSeconds)}`)
      const build = augmentRecommended(buildRecommended(level), level)
      lines.push(`  build: ${build.placements.map((placement) => `${placement.kind}@${placement.holeId}:L${placement.upgradeLevel ?? 1}`).join(' ')}`)
      lines.push(`  buildCoins=${build.coins} power=${build.usedPowerW}/${level.capacityW}`)
      if (process.env.OPTICAL_TRACE) {
        simulateTraced(level, build, lines)
      }
    })

    // A/B experiments: OPTICAL_ITER_EXP=1 reads test-results/experiment.json.
    if (process.env.OPTICAL_ITER_EXP) {
      const config = JSON.parse(readFileSync('test-results/experiment.json', 'utf8')) as {
        levels: Record<string, Array<{ name: string; branches: ExperimentBranch[] }>>
      }
      const hpMultipliers = process.env.OPTICAL_HP_SWEEP
        ? [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6].map(Number)
        : process.env.OPTICAL_HP_MULT
          ? [Number(process.env.OPTICAL_HP_MULT)]
          : [1]
      Object.entries(config.levels).forEach(([id, variants]) => {
        const level = OPTICAL_DEFENSE_LEVELS.find((item) => item.id === Number(id))
        if (!level) return
        const coreThreshold = Math.ceil(level.coreHealth * (level.id <= 3 ? 0.8 : level.id <= 10 ? 0.6 : 0.25))
        hpMultipliers.forEach((mult) => {
          const target = scaleLevelHealth(level, mult)
          const baseline = simulate(target, 'recommended', augmentRecommended(buildRecommended(target), target))
          const label = `\nL${id}${mult !== 1 ? `@hp${mult}` : ''} baseline core=${baseline.coreHealth}/${level.coreHealth}>=${coreThreshold} ${baseline.coreHealth >= coreThreshold ? 'OK' : 'FAIL'} kills=${baseline.kills} leaks=${baseline.leaks}`
          lines.push(label)
          if (mult !== 1 && process.env.OPTICAL_HP_SWEEP && !process.env.OPTICAL_TRACE) return
          variants.forEach((variant) => {
          try {
            const built = buildFromBranches(target, variant.branches)
            const result = simulate(target, 'recommended', built)
            lines.push([
              `  [${variant.name}]`,
              `core=${result.coreHealth}/${level.coreHealth}>=${coreThreshold}`,
              result.coreHealth >= coreThreshold ? 'OK' : 'FAIL',
              `kills=${result.kills}`,
              `leaks=${result.leaks}`,
              `coinsLeft=${built.coins}`,
              `power=${built.usedPowerW}/${level.capacityW}`,
              `phase=${result.phase}`,
              `elapsed=${fmt(result.elapsedSeconds)}`,
            ].join(' | '))
            if (process.env.OPTICAL_TRACE) {
              lines.push(`      build: ${built.placements.map((placement) => `${placement.kind}@${placement.holeId}:L${placement.upgradeLevel ?? 1}`).join(' ')}`)
            }
          } catch (error) {
            lines.push(`  [${variant.name}] BUILD FAILED: ${error instanceof Error ? error.message : String(error)}`)
          }
          })
        })
      })
    }

    mkdirSync('test-results', { recursive: true })
    writeFileSync('test-results/optical-iter.txt', lines.join('\n') + '\n')
    console.log(lines.join('\n'))
  }, 300_000)
})
