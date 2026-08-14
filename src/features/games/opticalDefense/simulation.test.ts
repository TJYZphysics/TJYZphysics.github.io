import { describe, expect, it } from 'vitest'

import { getOpticalDefenseLevel, OPTICAL_DEFENSE_LEVELS } from './levels'
import {
  ACCELERATOR_MIN_INPUT_W, advanceBattle, attachSensor, CAPACITOR_MAX_CHARGE_J, createBattleState, DEVICE_COSTS, deviceLevel, placeDevice, pointOnPath, scoreBattle,
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
  it('defines twenty levels with valid routes and progressive device access', () => {
    expect(OPTICAL_DEFENSE_LEVELS).toHaveLength(20)
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

  it('applies the documented health curve, type multipliers, and power rewards to all nineteen levels', () => {
    const waveMultipliers = [0.82, 0.94, 1.06, 1.18, 1.3, 1.42]
    const typeMultipliers = { normal: 1, fast: 0.78, armored: 2.4, resistant: 1.65, boss: 4.5 }
    OPTICAL_DEFENSE_LEVELS.forEach((level) => {
      const segmentMultiplier = level.id <= 3 ? 0.65 : level.id <= 10 ? 0.85 : 0.9
      level.waves.forEach((wave, waveIndex) => wave.enemies.forEach((enemy) => {
        expect(enemy.health).toBe(Math.round((26 + 7 * level.id) * typeMultipliers[enemy.kind] * waveMultipliers[waveIndex] * segmentMultiplier))
        expect(enemy.rewardPowerW).toBe(enemy.kind === 'boss' ? 20 : enemy.kind === 'armored' || enemy.kind === 'resistant' ? 2 : 1)
      }))
    })
  })

  it('uses the rebalanced instrument prices', () => {
    expect(DEVICE_COSTS).toMatchObject({
      mirror: 18,
      splitter: 32,
      'prism-splitter': 46,
      combiner: 34,
      filter: 22,
      collector: 44,
      bulb: 30,
      'laser-emitter': 46,
      'radiation-source': 50,
      'frost-tower': 52,
      brazier: 52,
      accelerator: 82,
      shutter: 20,
      'photo-sensor': 28,
      capacitor: 68,
    })
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
    state = updateDevice({ ...state, enemies: [{ id: 'target', kind: 'normal', health: 20, maxHealth: 20, speed: 1, progress: 0.65, rewardCoins: 1, rewardPowerW: 0, status: { ...EMPTY_STATUS } }] }, mirror.id, { mirrorMode: 'auto', targetStrategy: 'first' })
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

  it('spawns a wave and applies ordinary enemy power drops', () => {
    const level = getOpticalDefenseLevel(1)!
    let state = createBattleState(level)
    state = placeDevice(state, level, 'source-red', holeIdAt(level, 0, 1)).state
    state = placeDevice(state, level, 'bulb', holeIdAt(level, 1, 1)).state
    state = startWave(state)
    for (let index = 0; index < 600 && state.phase === 'running'; index += 1) state = tickBattle(state, level, 0.1)
    expect(state.capacityW).toBe(136)
    expect(state.enemies.some((enemy) => enemy.health < enemy.maxHealth)).toBe(true)
    expect(['victory', 'running', 'defeat']).toContain(state.phase)
    expect(scoreBattle({ ...state, phase: 'victory' }, level)).toBeGreaterThan(0)
  })

  it('clamps simultaneous escape damage at zero core health', () => {
    const level = getOpticalDefenseLevel(1)!
    const escapingEnemy = (id: string): EnemyState => ({
      id, kind: 'normal', health: 10, maxHealth: 10, speed: 1000, progress: 0.999,
      rewardCoins: 0, rewardPowerW: 0, status: { ...EMPTY_STATUS },
    })
    let state: BattleState = {
      ...createBattleState(level),
      phase: 'running' as const,
      coreHealth: 1,
      spawnPlan: [{ atSeconds: 999, waveNumber: 1, kind: 'normal' as const, health: 10, speed: 0, rewardCoins: 0, rewardPowerW: 0 }],
      enemies: [escapingEnemy('one'), escapingEnemy('two')],
    }
    state = advanceBattle(state, level, 0.1)
    expect(state.phase).toBe('defeat')
    expect(state.coreHealth).toBe(0)
  })

  it('introduces armored shields only after white light becomes available', () => {
    const earlyLevel = getOpticalDefenseLevel(2)!
    const armoredSpawn = [{ atSeconds: 0, waveNumber: 1, kind: 'armored' as const, health: 100, speed: 0, rewardCoins: 0, rewardPowerW: 2 }]
    let early = startWave({ ...createBattleState(earlyLevel), spawnPlan: armoredSpawn })
    early = advanceBattle(early, earlyLevel, 0.1)
    expect(early.enemies[0].status.shield).toBe(0)

    const shieldLevel = getOpticalDefenseLevel(5)!
    let shielded = startWave({ ...createBattleState(shieldLevel), spawnPlan: armoredSpawn })
    shielded = advanceBattle(shielded, shieldLevel, 0.1)
    expect(shielded.enemies[0].status.shield).toBe(30)
  })

  it('lets the level-one reflected tutorial layout achieve a real first kill', () => {
    const level = getOpticalDefenseLevel(1)!
    let state = createBattleState(level)
    state = placeDevice(state, level, 'source-red', holeIdAt(level, 0, 0)).state
    state = placeDevice(state, level, 'mirror', holeIdAt(level, 2, 0)).state
    state = placeDevice(state, level, 'bulb', holeIdAt(level, 2, 1)).state
    const mirror = state.placements.find((placement) => placement.kind === 'mirror')!
    const bulb = state.placements.find((placement) => placement.kind === 'bulb')!
    state = snapMirrorToTarget(state, level, mirror.id, bulb.id)
    state = startWave(state)
    for (let index = 0; index < 300 && state.phase === 'running' && !state.enemies.some((enemy) => enemy.dead); index += 1) state = tickBattle(state, level, 0.1)
    expect(state.enemies.some((enemy) => enemy.dead)).toBe(true)
    expect(state.elapsedSeconds).toBeLessThanOrEqual(30)
    expect(state.coreHealth).toBe(level.coreHealth)
    expect(state.capacityW).toBe(101)
  })

  it('lets the complete level-one recommended build finish without core damage', () => {
    const level = getOpticalDefenseLevel(1)!
    let state = createBattleState(level)
    state = placeDevice(state, level, 'source-red', holeIdAt(level, 0, 0)).state
    state = placeDevice(state, level, 'mirror', holeIdAt(level, 2, 0)).state
    state = placeDevice(state, level, 'bulb', holeIdAt(level, 2, 1)).state
    state = placeDevice(state, level, 'source-red', holeIdAt(level, 0, 3)).state
    state = placeDevice(state, level, 'bulb', holeIdAt(level, 1, 3)).state
    const mirror = state.placements.find((placement) => placement.kind === 'mirror')!
    const reflectedBulb = state.placements.find((placement) => placement.kind === 'bulb' && placement.holeId === holeIdAt(level, 2, 1))!
    state = snapMirrorToTarget(state, level, mirror.id, reflectedBulb.id)
    state = startWave(state)
    state = advanceBattle(state, level, 60)
    expect(state.phase).toBe('victory')
    expect(state.coreHealth).toBe(level.coreHealth)
    expect(state.enemies.filter((enemy) => enemy.dead)).toHaveLength(36)
    expect(state.peakUsedPowerW).toBe(100)
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
    expect(state.placements[0].outputTargetIds).toEqual([bulb.id, laser.id, undefined])
  })

  it('exposes three independently snappable outputs on a prism splitter', () => {
    const level = getOpticalDefenseLevel(9)!
    let state = createBattleState(level)
    state = placeDevice(state, level, 'prism-splitter', holeIdAt(level, 0, 0)).state
    state = placeDevice(state, level, 'bulb', holeIdAt(level, 1, 0)).state
    state = placeDevice(state, level, 'laser-emitter', holeIdAt(level, 2, 0)).state
    state = placeDevice(state, level, 'radiation-source', holeIdAt(level, 3, 0)).state
    for (let output = 0; output < 3; output += 1) {
      state = snapDeviceOutputToTarget(state, level, state.placements[0].id, output, state.placements[output + 1].id)
    }
    expect(state.placements[0].outputTargetIds).toEqual(state.placements.slice(1).map((placement) => placement.id))
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

  it('advances identically across different render-frame chunking', () => {
    const level = getOpticalDefenseLevel(9)!
    let initial = createBattleState(level)
    initial = placeDevice(initial, level, 'source-red', holeIdAt(level, 0, 0)).state
    initial = placeDevice(initial, level, 'bulb', holeIdAt(level, 1, 0)).state
    initial = {
      ...initial,
      phase: 'running',
      spawnPlan: [],
      enemies: [{ id: 'target', kind: 'normal', health: 100, maxHealth: 100, speed: 0, progress: 0.05, rewardCoins: 0, rewardPowerW: 0, status: { ...EMPTY_STATUS } }],
    }
    const single = advanceBattle(initial, level, 1)
    let chunked = initial
    for (let frame = 0; frame < 60; frame += 1) chunked = advanceBattle(chunked, level, 1 / 60)
    expect(chunked.elapsedSeconds).toBeCloseTo(single.elapsedSeconds, 8)
    expect(chunked.fixedStepRemainderS).toBeCloseTo(single.fixedStepRemainderS, 8)
    expect(chunked.enemies[0].health).toBeCloseTo(single.enemies[0].health, 8)
  })

  it('fires frost and brazier attacks on periodic area cooldowns', () => {
    const level = getOpticalDefenseLevel(9)!
    const setup = (kind: 'frost-tower' | 'brazier') => {
      let state = createBattleState(level)
      state = placeDevice(state, level, 'source-blue', holeIdAt(level, 0, 0)).state
      state = placeDevice(state, level, kind, holeIdAt(level, 1, 0)).state
      return {
        ...state,
        phase: 'running' as const,
        spawnPlan: [],
        enemies: [{ id: 'target', kind: 'normal' as const, health: 100, maxHealth: 100, speed: 0, progress: 0.05, rewardCoins: 0, rewardPowerW: 0, status: { ...EMPTY_STATUS } }],
      }
    }
    const frostFirst = advanceBattle(setup('frost-tower'), level, 0.1)
    expect(frostFirst.enemies[0].status.freezeSeconds).toBeGreaterThan(1.6)
    expect(frostFirst.placements.find((item) => item.kind === 'frost-tower')?.areaCooldownS).toBeGreaterThan(1)
    const frostBeforeSecondPulse = advanceBattle(frostFirst, level, 1)
    expect(frostBeforeSecondPulse.enemies[0].status.freezeSeconds).toBeLessThan(frostFirst.enemies[0].status.freezeSeconds)
    const frostSecond = advanceBattle(frostBeforeSecondPulse, level, 0.3)
    expect(frostSecond.enemies[0].status.freezeSeconds).toBeGreaterThan(1.5)

    const fireFirst = advanceBattle(setup('brazier'), level, 0.1)
    expect(fireFirst.enemies[0].status.burnSeconds).toBeGreaterThan(3.8)
    const fireSecond = advanceBattle(fireFirst, level, 1.2)
    expect(fireSecond.enemies[0].status.burnSeconds).toBeGreaterThan(3.8)
  })

  it('charges each accelerator only above minimum input and pierces enemies in its straight firing lane', () => {
    const base = getOpticalDefenseLevel(10)!
    const level: LevelConfig = {
      ...base,
      board: { width: 500, height: 300 },
      holes: [{ x: 50, y: 100 }, { x: 100, y: 100 }],
      path: [{ x: 100, y: 100 }, { x: 500, y: 100 }],
      paths: [
        [{ x: 100, y: 100 }, { x: 500, y: 100 }],
        [{ x: 100, y: 112 }, { x: 500, y: 112 }],
        [{ x: 100, y: 150 }, { x: 500, y: 150 }],
      ],
    }
    const setup = (source: 'source-red' | 'source-blue'): BattleState => {
      let state = createBattleState(level)
      state = placeDevice(state, level, source, 'h-0').state
      state = placeDevice(state, level, 'accelerator', 'h-1').state
      const makeEnemy = (id: string, progress: number, routeIndex: number): EnemyState => ({
        id, kind: 'normal', health: 1000, maxHealth: 1000, speed: 0, progress,
        rewardCoins: 0, rewardPowerW: 0, routeIndex, status: { ...EMPTY_STATUS },
      })
      return {
        ...state,
        phase: 'running',
        spawnPlan: [],
        enemies: [makeEnemy('near', 0.25, 0), makeEnemy('far', 0.7, 0), makeEnemy('edge', 0.25, 1), makeEnemy('off-axis', 0.25, 2)],
      }
    }
    const low = tickBattle(setup('source-red'), level, 0.1)
    expect(ACCELERATOR_MIN_INPUT_W).toBeGreaterThan(50)
    expect(low.placements.find((placement) => placement.kind === 'accelerator')?.acceleratorChargeJ).toBe(0)

    const charged = advanceBattle(setup('source-blue'), level, 3.7)
    const accelerator = charged.placements.find((placement) => placement.kind === 'accelerator')!
    expect(accelerator.acceleratorPhase).toBe('cooldown')
    expect(charged.enemies.find((enemy) => enemy.id === 'near')!.health).toBeLessThan(1000)
    expect(charged.enemies.find((enemy) => enemy.id === 'far')!.health).toBeLessThan(1000)
    expect(charged.enemies.find((enemy) => enemy.id === 'edge')!.health).toBe(1000)
    expect(charged.enemies.find((enemy) => enemy.id === 'off-axis')!.health).toBe(1000)
  })

  it('routes capacitor explosions through shield and armored health mitigation', () => {
    const level = getOpticalDefenseLevel(9)!
    let state = createBattleState(level)
    state = placeDevice(state, level, 'capacitor', 'h-0').state
    const capacitor = state.placements[0]
    const capacitorPoint = level.holes[0]
    const progress = Array.from({ length: 101 }, (_, index) => index / 100).sort((left, right) => {
      const leftPoint = pointOnPath(level.path, left)
      const rightPoint = pointOnPath(level.path, right)
      return Math.hypot(leftPoint.x - capacitorPoint.x, leftPoint.y - capacitorPoint.y)
        - Math.hypot(rightPoint.x - capacitorPoint.x, rightPoint.y - capacitorPoint.y)
    })[0]
    state = {
      ...state,
      phase: 'running',
      spawnPlan: [{ atSeconds: 999, waveNumber: 1, kind: 'normal', health: 10, speed: 0, rewardCoins: 0, rewardPowerW: 0 }],
      placements: state.placements.map((placement) => placement.id === capacitor.id
        ? { ...placement, chargeJ: 450, detonateQueued: true }
        : placement),
      enemies: [{
        id: 'armored', kind: 'armored', health: 500, maxHealth: 500, speed: 0, progress,
        rewardCoins: 0, rewardPowerW: 0, status: { ...EMPTY_STATUS, shield: 100 },
      }],
    }
    state = advanceBattle(state, level, 0.1)
    const enemy = state.enemies[0]
    expect(enemy.status.shield).toBe(100)
    expect(500 - enemy.health).toBeCloseTo((15 + 450 * 0.18) * 0.7)
    expect(state.placements.some((placement) => placement.kind === 'capacitor')).toBe(false)
  })

  it('keeps upgraded capacitor storage capped at the documented 450 joules', () => {
    const level = getOpticalDefenseLevel(9)!
    let state = createBattleState(level)
    state = placeDevice(state, level, 'source-blue', 'h-0').state
    state = placeDevice(state, level, 'capacitor', 'h-1').state
    const capacitor = state.placements.find((placement) => placement.kind === 'capacitor')!
    state = upgradeDevice(state, capacitor.id).state
    state = upgradeDevice(state, capacitor.id).state
    state = { ...state, phase: 'running', spawnPlan: [{ atSeconds: 999, waveNumber: 1, kind: 'normal', health: 1, speed: 0, rewardCoins: 0, rewardPowerW: 0 }] }
    state = advanceBattle(state, level, 10)
    expect(state.placements.find((placement) => placement.id === capacitor.id)?.chargeJ).toBe(CAPACITOR_MAX_CHARGE_J)
  })
})
