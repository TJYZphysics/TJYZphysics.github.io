import { describe, expect, it } from 'vitest'

import { DEFAULT_TUNING } from './tuning'
import { applyOpticalHit, OPTICAL_REACTIONS } from './rules'
import {
  buildCustomLevel, createDefaultCustomConfig, isEdgeCell, normalizeCustomConfig, validateCustomLevel,
} from './customLevel'
import {
  advanceBattle, buildSpawnPlan, clearEnemies, continueAfterCoreLoss, createBattleState, rebuildSpawnPlan, startWave,
} from './simulation'
import { EMPTY_STATUS } from './types'
import type { EnemyState } from './types'

describe('optical defense custom level', () => {
  it('keeps DEFAULT_TUNING equivalent to the current battle constants', () => {
    const t = DEFAULT_TUNING
    expect(t.damage.rgb).toEqual({ r: 0.06, g: 0.018, b: 0.025 })
    expect(t.damage.orangeMultiplier).toBe(1.25)
    expect(t.damage.magentaMultiplier).toBe(1.25)
    expect(t.damage.whiteShieldMultiplier).toBe(2.5)
    expect(t.damage.bareBeamDamageMultiplier).toBe(0.22)
    expect(t.damage.bareBeamStatusMultiplier).toBe(0.25)
    expect(t.damage.resistanceChannelMultiplier).toBe(0.3)
    expect(t.damage.vulnerableDamageMultiplier).toBe(1.25)
    expect(t.damage.vulnerableSeconds).toBe(4)
    expect(t.damage.magentaRadiationMultiplier).toBe(1.25)
    expect(t.reactions).toMatchObject({
      poisonSeconds: OPTICAL_REACTIONS.poisonSeconds,
      poisonDps: OPTICAL_REACTIONS.poisonDps,
      burnSeconds: OPTICAL_REACTIONS.burnSeconds,
      burnDps: OPTICAL_REACTIONS.burnDps,
      freezeSeconds: OPTICAL_REACTIONS.freezeSeconds,
      toxinIgnitionCooldownS: OPTICAL_REACTIONS.toxinIgnitionCooldownS,
      thermalShockDamage: OPTICAL_REACTIONS.thermalShockDamage,
      thermalShockCooldownS: OPTICAL_REACTIONS.thermalShockCooldownS,
      radiationThreshold: OPTICAL_REACTIONS.radiationThreshold,
      radiationBurstDamage: OPTICAL_REACTIONS.radiationBurstDamage,
      radiationDecayDelayS: OPTICAL_REACTIONS.radiationDecayDelayS,
      radiationDecayPerSecond: OPTICAL_REACTIONS.radiationDecayPerSecond,
      armorBreakSeconds: OPTICAL_REACTIONS.armorBreakSeconds,
    })
    expect(t.armorShield).toEqual({
      armoredDamageMultiplier: 0.55,
      shieldDamageMultiplier: 0.7,
      armoredShieldFraction: 0.12,
      armoredShieldMinimum: 30,
      armoredShieldLevelFloor: 5,
      bossShieldFraction: 0.15,
      bossShieldMinimum: 120,
    })
    expect(t.coreLeak).toEqual({ bossDamage: 3, otherDamage: 1 })
  })

  it('builds a complete custom LevelConfig with grid coverage and edge entrance/core', () => {
    const config = createDefaultCustomConfig()
    const level = buildCustomLevel(config)
    expect(level.id).toBe(20)
    expect(level.grid.columns).toBe(16)
    expect(level.grid.rows).toBe(9)
    expect(level.holes.length + level.routeCells.length).toBe(16 * 9)
    expect(level.availableDevices).toContain('capacitor')
    expect(level.tuning).toBe(config.tuning)
    expect(isEdgeCell(config.entranceCell, 16, 9)).toBe(true)
    expect(isEdgeCell(config.coreCell, 16, 9)).toBe(true)
    // 路径从入口边缘点延伸到核心边缘点。
    expect(level.path[0].x).toBe(0)
    expect(level.path.at(-1)!.x).toBe(1200)
    const plan = buildSpawnPlan(level)
    expect(plan.length).toBe(config.waves.reduce((sum, wave) => sum + wave.totalCount, 0))
    expect(plan[0].atSeconds).toBe(0)
  })

  it('applies the wave strength curve to enemy health and speed', () => {
    const config = createDefaultCustomConfig()
    config.enemies.normal = { health: 100, speed: 50, rewardCoins: 7, rewardPowerW: 1 }
    config.waveStrengthCurve = [0.5, 2, 2]
    config.waves = [0, 1, 2].map((waveIndex) => ({
      delaySeconds: waveIndex === 0 ? 0 : 1,
      totalCount: 2,
      distribution: { normal: 1, fast: 0, armored: 0, resistant: 0, boss: 0 },
      random: false,
      intervalSeconds: 0.5,
    }))
    const level = buildCustomLevel(config)
    const plan = buildSpawnPlan(level)
    expect(plan[0].health).toBe(50)
    expect(plan[0].speed).toBe(25)
    expect(plan[2].health).toBe(200)
    expect(plan[2].speed).toBe(100)
  })

  it('distributes wave counts by enabled-kind proportions', () => {
    const config = createDefaultCustomConfig()
    config.enabledKinds = ['normal', 'fast']
    config.waves = [{
      delaySeconds: 0,
      totalCount: 100,
      distribution: { normal: 0.75, fast: 0.25, armored: 0, resistant: 0, boss: 0 },
      random: false,
      intervalSeconds: 0.1,
    }]
    const level = buildCustomLevel(config)
    const plan = buildSpawnPlan(level)
    expect(plan.length).toBe(100)
    expect(plan.filter((entry) => entry.kind === 'normal')).toHaveLength(75)
    expect(plan.filter((entry) => entry.kind === 'fast')).toHaveLength(25)
  })

  it('supports random mode with the configured total count', () => {
    const config = createDefaultCustomConfig()
    config.enabledKinds = ['normal', 'fast']
    config.waves = [{
      delaySeconds: 0,
      totalCount: 40,
      distribution: { normal: 0.5, fast: 0.5, armored: 0, resistant: 0, boss: 0 },
      random: true,
      intervalSeconds: 0.1,
    }]
    const level = buildCustomLevel(config)
    const plan = buildSpawnPlan(level)
    expect(plan.length).toBe(40)
    expect(plan.every((entry) => entry.kind === 'normal' || entry.kind === 'fast')).toBe(true)
  })

  it('validates path, edge entrance and edge core', () => {
    const config = createDefaultCustomConfig()
    expect(validateCustomLevel(config)).toBeNull()
    config.pathCells = []
    expect(validateCustomLevel(config)).toContain('路径')
    config.pathCells = [[1, 1], [1, 2]]
    config.entranceCell = [1, 1]
    expect(validateCustomLevel(config)).toContain('边缘')
    config.entranceCell = [0, 1]
    config.coreCell = [1, 1]
    expect(validateCustomLevel(config)).toContain('边缘')
    config.coreCell = [15, 2]
    expect(validateCustomLevel(config)).toBeNull()
  })

  it('builds a safe placeholder level while the path is empty', () => {
    const config = createDefaultCustomConfig()
    config.pathCells = []
    config.entranceCell = undefined
    config.coreCell = undefined
    expect(() => buildCustomLevel(config)).not.toThrow()
    expect(buildCustomLevel(config).path.length).toBeGreaterThanOrEqual(1)
  })

  it('normalizes malformed persisted config and clamps fields', () => {
    const normalized = normalizeCustomConfig({
      columns: 99,
      rows: 0,
      startingCoins: 5,
      capacityW: -10,
      coreHealth: 0,
      pathCells: [[0, 0], [0, 0]],
      waves: [],
    })
    expect(normalized.columns).toBe(30)
    expect(normalized.rows).toBe(4)
    expect(normalized.startingCoins).toBe(100)
    expect(normalized.capacityW).toBe(50)
    expect(normalized.coreHealth).toBe(1)
    expect(normalized.waves.length).toBeGreaterThan(0)
    expect(normalized.tuning.damage.rgb.r).toBe(0.06)
    const tuned = normalizeCustomConfig({ tuning: { damage: { rgb: { r: 0.1 } } } })
    expect(tuned.tuning.damage.rgb.r).toBe(0.1)
    expect(tuned.tuning.damage.rgb.g).toBe(0.018)
  })

  it('threads tuning into damage application', () => {
    const config = createDefaultCustomConfig()
    config.tuning.damage.rgb = { r: 0, g: 0, b: 0 }
    const level = buildCustomLevel(config)
    const enemy: EnemyState = {
      id: 'e', kind: 'normal', health: 100, maxHealth: 100, speed: 40, progress: 0, rewardCoins: 7, rewardPowerW: 1,
      status: { ...EMPTY_STATUS },
    }
    expect(applyOpticalHit(enemy, { r: 100, g: 0, b: 0 }, 1, { tuning: level.tuning }).health).toBe(100)
    expect(applyOpticalHit(enemy, { r: 100, g: 0, b: 0 }, 1).health).toBeLessThan(100)
  })

  it('rebuilds the spawn plan for later waves without dropping living enemies', () => {
    const config = createDefaultCustomConfig()
    const level = buildCustomLevel(config)
    const advanced = advanceBattle(startWave(createBattleState(level)), level, 3)
    const livingBefore = advanced.enemies.filter((enemy) => !enemy.dead && !enemy.escaped).length
    const nextLevel = buildCustomLevel({
      ...config,
      waves: [...config.waves, {
        delaySeconds: 1,
        totalCount: 5,
        distribution: { normal: 1, fast: 0, armored: 0, resistant: 0, boss: 0 },
        random: false,
        intervalSeconds: 0.5,
      }],
    })
    const rebuilt = rebuildSpawnPlan(advanced, nextLevel)
    expect(rebuilt.spawnPlan.length).toBeGreaterThan(advanced.spawnPlan.length)
    expect(rebuilt.enemies.filter((enemy) => !enemy.dead && !enemy.escaped)).toHaveLength(livingBefore)
  })

  it('continues after core loss with full core and running phase', () => {
    const config = createDefaultCustomConfig()
    config.coreHealth = 1
    const level = buildCustomLevel(config)
    const defeated = { ...createBattleState(level), phase: 'defeat' as const, coreHealth: 0 }
    const next = continueAfterCoreLoss(defeated, level)
    expect(next.phase).toBe('running')
    expect(next.coreHealth).toBe(level.coreHealth)
  })

  it('clears living enemies but keeps resolved stats', () => {
    const config = createDefaultCustomConfig()
    const level = buildCustomLevel(config)
    const state = {
      ...createBattleState(level),
      enemies: [
        { ...baseEnemy('a'), health: 10 },
        { ...baseEnemy('b'), health: 0, dead: true },
        { ...baseEnemy('c'), kind: 'fast' as const, escaped: true },
      ],
    }
    const next = clearEnemies(state)
    expect(next.enemies).toHaveLength(2)
    expect(next.enemies.some((enemy) => enemy.id === 'a')).toBe(false)
    expect(next.enemies.some((enemy) => enemy.id === 'b')).toBe(true)
    expect(next.enemies.some((enemy) => enemy.id === 'c')).toBe(true)
  })
})

function baseEnemy(id: string): EnemyState {
  return {
    id,
    kind: 'normal',
    health: 10,
    maxHealth: 10,
    speed: 40,
    progress: 0.4,
    rewardCoins: 7,
    rewardPowerW: 1,
    status: { ...EMPTY_STATUS },
  }
}
