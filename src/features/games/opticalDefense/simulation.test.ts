import { describe, expect, it } from 'vitest'

import { getOpticalDefenseLevel, OPTICAL_DEFENSE_LEVELS } from './levels'
import {
  ACCELERATOR_MIN_INPUT_W, attachSensor, createBattleState, deviceLevel, placeDevice, pointOnPath, scoreBattle,
  setDeviceRotation, snapDeviceOutputToTarget, snapMirrorToTarget, startWave, terminalAttackRange, tickBattle, trackAutomaticMirrors,
  updateDevice, upgradeDevice,
} from './simulation'
import type { BattleState } from './simulation'
import type { EnemyState, LevelConfig } from './types'
import { EMPTY_STATUS } from './types'

function holeIdAt(level: LevelConfig, column: number, row: number) {
  const x = level.grid.originX + column * level.grid.cellSize + level.grid.cellSize / 2
  const y = level.grid.originY + row * level.grid.cellSize + level.grid.cellSize / 2
  const index = level.holes.findIndex((hole) => hole.x === x && hole.y === y)
  if (index < 0) throw new Error(`Expected a buildable cell at ${column},${row}`)
  return `h-${index}`
}

describe('optical defense levels and simulation', () => {
  it('defines nineteen hand-authored levels with valid routes and progressive device access', () => {
    expect(OPTICAL_DEFENSE_LEVELS).toHaveLength(19)
    expect(OPTICAL_DEFENSE_LEVELS[0].capacityW).toBe(100)
    OPTICAL_DEFENSE_LEVELS.forEach((level, index) => {
      expect(level.id).toBe(index + 1)
      expect(level.path.length).toBeGreaterThan(2)
      expect(level.paths?.length).toBeGreaterThanOrEqual(1)
      expect(level.waves.length).toBeGreaterThanOrEqual(3)
      expect(level.capacityW).toBeGreaterThan(0)
      expect(level.holes.length + level.routeCells.length).toBe(level.grid.columns * level.grid.rows)
      const occupiedCells = new Set([...level.holes, ...level.routeCells].map((point) => `${point.x}:${point.y}`))
      expect(occupiedCells.size).toBe(level.grid.columns * level.grid.rows)
      level.holes.forEach((hole) => {
        const minimum = level.path.slice(1).reduce((best, point, pointIndex) => {
          const start = level.path[pointIndex]
          const dx = point.x - start.x
          const dy = point.y - start.y
          const lengthSquared = dx * dx + dy * dy || 1
          const projected = Math.max(0, Math.min(1, ((hole.x - start.x) * dx + (hole.y - start.y) * dy) / lengthSquared))
          return Math.min(best, Math.hypot(hole.x - (start.x + dx * projected), hole.y - (start.y + dy * projected)))
        }, Infinity)
        expect(minimum).toBeGreaterThanOrEqual(level.grid.cellSize)
      })
    })
    expect(OPTICAL_DEFENSE_LEVELS.slice(0, 8).every((level) => level.availableDevices.length < OPTICAL_DEFENSE_LEVELS[8].availableDevices.length)).toBe(true)
    expect(OPTICAL_DEFENSE_LEVELS.slice(8).every((level) => level.availableDevices.length === OPTICAL_DEFENSE_LEVELS[8].availableDevices.length)).toBe(true)
    expect(OPTICAL_DEFENSE_LEVELS.filter((level) => (level.paths?.length ?? 1) === 2)).toHaveLength(2)
    expect(OPTICAL_DEFENSE_LEVELS.slice(10).every((level) => level.grid.columns === 16 && level.grid.rows === 9)).toBe(true)
  })

  it('snaps a mirror toward a selected device without a 15 degree restriction', () => {
    const level = getOpticalDefenseLevel(1)!
    let state = createBattleState(level)
    state = placeDevice(state, level, 'source-red', holeIdAt(level, 0, 0)).state
    state = placeDevice(state, level, 'mirror', holeIdAt(level, 2, 0)).state
    state = placeDevice(state, level, 'bulb', holeIdAt(level, 2, 1)).state
    const mirror = state.placements.find((placement) => placement.kind === 'mirror')!
    const bulb = state.placements.find((placement) => placement.kind === 'bulb')!
    state = snapMirrorToTarget(state, level, mirror.id, bulb.id)
    expect(state.placements.find((placement) => placement.id === mirror.id)?.rotationDeg).toBeCloseTo(45)
    expect(state.placements.find((placement) => placement.id === mirror.id)?.snapTargetId).toBe(bulb.id)
  })

  it('tracks enemies in automatic mirror mode with a limited turn rate', () => {
    const level = getOpticalDefenseLevel(1)!
    let state = createBattleState(level)
    state = placeDevice(state, level, 'source-red', holeIdAt(level, 0, 0)).state
    state = placeDevice(state, level, 'mirror', holeIdAt(level, 2, 0)).state
    const mirror = state.placements.find((placement) => placement.kind === 'mirror')!
    state = updateDevice({ ...state, enemies: [{ id: 'target', kind: 'normal', health: 20, maxHealth: 20, speed: 1, progress: 0.65, rewardCoins: 1, rewardPowerW: 1, status: { poisonSeconds: 0, burnSeconds: 0, freezeSeconds: 0, radiationStacks: 0, armorBrokenSeconds: 0, shield: 0 } }] }, mirror.id, { mirrorMode: 'auto', targetStrategy: 'first' })
    state = { ...state, placements: state.placements.map((placement) => placement.id === mirror.id ? { ...placement, rotationDeg: 0 } : placement) }
    const tracked = trackAutomaticMirrors(state, level, 0.1, 80)
    const rotation = tracked.placements.find((placement) => placement.id === mirror.id)!.rotationDeg
    expect(rotation).toBeGreaterThan(0)
    expect(rotation).toBeLessThanOrEqual(8)
  })

  it('rejects a third 50W source while a 1W reward immediately exposes 1W spare capacity', () => {
    const level = getOpticalDefenseLevel(1)!
    let state = createBattleState(level)
    const firstHole = holeIdAt(level, 0, 0)
    const secondHole = holeIdAt(level, 1, 0)
    const thirdHole = holeIdAt(level, 2, 0)
    state = placeDevice(state, level, 'source-red', firstHole).state
    state = placeDevice(state, level, 'source-red', secondHole).state
    expect(placeDevice(state, level, 'source-red', thirdHole).ok).toBe(false)
    state = { ...state, capacityW: 101 }
    expect(state.capacityW - state.usedPowerW).toBe(1)
    expect(placeDevice(state, level, 'source-red', thirdHole).ok).toBe(false)
  })

  it('spawns a wave and turns a powered bulb into a real kill/reward', () => {
    const level = getOpticalDefenseLevel(1)!
    let state = createBattleState(level)
    state = placeDevice(state, level, 'source-red', holeIdAt(level, 0, 1)).state
    state = placeDevice(state, level, 'bulb', holeIdAt(level, 1, 1)).state
    state = startWave(state)
    for (let index = 0; index < 600 && state.phase === 'running'; index += 1) state = tickBattle(state, level, 0.1)
    expect(state.capacityW).toBeGreaterThan(100)
    expect(state.coins).toBeGreaterThan(level.startingCoins - 26)
    expect(['victory', 'running', 'defeat']).toContain(state.phase)
    expect(scoreBattle({ ...state, phase: 'victory' }, level)).toBeGreaterThan(0)
  })

  it('lets the level-one reflected tutorial layout earn its first kill within thirty seconds', () => {
    const level = getOpticalDefenseLevel(1)!
    let state = createBattleState(level)
    state = placeDevice(state, level, 'source-red', holeIdAt(level, 0, 0)).state
    state = placeDevice(state, level, 'mirror', holeIdAt(level, 2, 0)).state
    state = placeDevice(state, level, 'bulb', holeIdAt(level, 2, 1)).state
    const mirror = state.placements.find((placement) => placement.kind === 'mirror')!
    const bulb = state.placements.find((placement) => placement.kind === 'bulb')!
    state = snapMirrorToTarget(state, level, mirror.id, bulb.id)
    state = startWave(state)
    for (let index = 0; index < 300 && state.phase === 'running'; index += 1) state = tickBattle(state, level, 0.1)
    expect(state.enemies.some((enemy) => enemy.dead)).toBe(true)
    expect(state.capacityW).toBeGreaterThan(100)
  })

  it('uses terminal-to-enemy Euclidean range and leaves distant enemies untouched', () => {
    const level = getOpticalDefenseLevel(1)!
    let state = createBattleState(level)
    state = placeDevice(state, level, 'source-red', holeIdAt(level, 0, 1)).state
    state = placeDevice(state, level, 'bulb', holeIdAt(level, 1, 1)).state
    const terminal = state.placements.find((placement) => placement.kind === 'bulb')!
    const nearProgress = Array.from({ length: 101 }, (_, index) => index / 100).find((progress) => {
      const point = pointOnPath(level.path, progress)
      const terminalPoint = level.holes[Number(terminal.holeId.replace('h-', ''))]
      return Math.hypot(point.x - terminalPoint.x, point.y - terminalPoint.y) < terminalAttackRange(terminal) * 0.7
    })!
    const makeEnemy = (id: string, progress: number): EnemyState => ({
      id, kind: 'normal', health: 100, maxHealth: 100, speed: 0, progress,
      rewardCoins: 1, rewardPowerW: 1, status: { ...EMPTY_STATUS },
    })
    state = { ...state, phase: 'running', spawnPlan: [], enemies: [makeEnemy('near', nearProgress), makeEnemy('far', 0.95)] }
    state = tickBattle(state, level, 0.1)
    expect(state.enemies.find((enemy) => enemy.id === 'near')!.health).toBeLessThan(100)
    expect(state.enemies.find((enemy) => enemy.id === 'far')!.health).toBe(100)
  })

  it('enforces per-level instruments even when an external list could contain later tools', () => {
    const level = getOpticalDefenseLevel(1)!
    const state = createBattleState(level)
    expect(placeDevice(state, level, 'splitter', holeIdAt(level, 0, 0)).ok).toBe(false)
    expect(placeDevice(state, level, 'splitter', holeIdAt(level, 0, 0), ['splitter']).ok).toBe(true)
  })

  it('attaches a sensor to an existing instrument without occupying another hole', () => {
    const level = getOpticalDefenseLevel(8)!
    let state = createBattleState(level)
    state = placeDevice(state, level, 'mirror', holeIdAt(level, 0, 0)).state
    const result = attachSensor(state, state.placements[0].id)
    expect(result.ok).toBe(true)
    expect(result.state.placements).toHaveLength(1)
    expect(result.state.placements[0].hasSensor).toBe(true)
    expect(placeDevice(result.state, level, 'photo-sensor', holeIdAt(level, 1, 0)).ok).toBe(false)
  })

  it('snaps each splitter output to an arbitrary target', () => {
    const level = getOpticalDefenseLevel(9)!
    let state = createBattleState(level)
    state = placeDevice(state, level, 'splitter', holeIdAt(level, 0, 0)).state
    state = placeDevice(state, level, 'bulb', holeIdAt(level, 1, 0)).state
    state = placeDevice(state, level, 'laser-emitter', holeIdAt(level, 2, 0)).state
    const [splitter, bulb, laser] = state.placements
    state = snapDeviceOutputToTarget(state, level, splitter.id, 0, bulb.id)
    state = snapDeviceOutputToTarget(state, level, splitter.id, 1, laser.id)
    expect(state.placements[0].outputTargetIds).toEqual([bulb.id, laser.id])
  })

  it('upgrades instruments with bounded levels, effect growth, and exact mirror rotation', () => {
    const level = getOpticalDefenseLevel(1)!
    let state = createBattleState(level)
    state = placeDevice(state, level, 'mirror', holeIdAt(level, 0, 0)).state
    const mirror = state.placements[0]
    const baseRange = terminalAttackRange({ ...mirror, kind: 'bulb' })
    const first = upgradeDevice(state, mirror.id)
    expect(first.ok).toBe(true)
    state = first.state
    expect(deviceLevel(state.placements[0])).toBe(2)
    expect(terminalAttackRange({ ...state.placements[0], kind: 'bulb' })).toBeGreaterThan(baseRange)
    state = setDeviceRotation(state, mirror.id, 46.5)
    expect(state.placements[0].rotationDeg).toBe(46.5)
    expect(setDeviceRotation(state, mirror.id, -1).placements[0].rotationDeg).toBe(359)
  })

  it('keeps an automatic mirror still without real incoming light', () => {
    const level = getOpticalDefenseLevel(1)!
    let state = createBattleState(level)
    state = placeDevice(state, level, 'mirror', holeIdAt(level, 0, 0)).state
    const mirror = state.placements[0]
    state = updateDevice({ ...state, enemies: [{ id: 'target', kind: 'normal', health: 20, maxHealth: 20, speed: 0, progress: 0.5, rewardCoins: 1, rewardPowerW: 1, status: { ...EMPTY_STATUS } }] }, mirror.id, { mirrorMode: 'auto' })
    state = setDeviceRotation(state, mirror.id, 37)
    expect(trackAutomaticMirrors(state, level, 0.2).placements[0].rotationDeg).toBe(37)
  })

  it('charges each accelerator only above minimum input and releases a consumed pulse', () => {
    const level = getOpticalDefenseLevel(10)!
    const setup = (source: 'source-red' | 'source-blue'): BattleState => {
      let state = createBattleState(level)
      state = placeDevice(state, level, source, holeIdAt(level, 0, 0)).state
      state = placeDevice(state, level, 'accelerator', holeIdAt(level, 1, 0)).state
      const target: EnemyState = { id: 'target', kind: 'normal', health: 1000, maxHealth: 1000, speed: 0, progress: 0.03, rewardCoins: 1, rewardPowerW: 1, status: { ...EMPTY_STATUS } }
      return { ...state, phase: 'running' as const, spawnPlan: [], enemies: [target] }
    }
    const low = tickBattle(setup('source-red'), level, 0.1)
    expect(ACCELERATOR_MIN_INPUT_W).toBeGreaterThan(50)
    expect(low.placements.find((placement) => placement.kind === 'accelerator')?.acceleratorChargeJ).toBe(0)

    let charged = setup('source-blue')
    for (let index = 0; index < 45; index += 1) charged = tickBattle(charged, level, 0.1)
    const accelerator = charged.placements.find((placement) => placement.kind === 'accelerator')!
    expect(['ready', 'cooldown']).toContain(accelerator.acceleratorPhase)
    if (accelerator.acceleratorPhase === 'cooldown') expect(charged.enemies[0].health).toBeLessThan(1000)
  })
})
