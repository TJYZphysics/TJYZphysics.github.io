import { describe, expect, it } from 'vitest'

import {
  applyOpticalHit,
  applyPowerDrop,
  canPlaceSource,
  chargeCapacitor,
  detonateCapacitor,
  filterPower,
  frontmostBlockingEnemy,
  mixRgb,
  mirrorAngleForTarget,
  normalizeSplitRatios,
  prismSplitPower,
  reflectDirection,
  splitPower,
  tickStatuses,
  totalPower,
  visibleColor,
  OPTICAL_REACTIONS,
} from './rules'
import type { EnemyState, Point } from './types'
import { EMPTY_STATUS } from './types'

const target = (patch: Partial<EnemyState> = {}): EnemyState => ({
  id: 'target', kind: 'normal', health: 200, maxHealth: 200, speed: 1, progress: 0,
  rewardCoins: 1, rewardPowerW: 0, status: { ...EMPTY_STATUS }, ...patch,
})

describe('optical defense rules', () => {
  it('keeps level one at 100W and enforces source capacity', () => {
    expect(canPlaceSource(0, 'source-red', 100)).toBe(true)
    expect(canPlaceSource(50, 'source-red', 100)).toBe(true)
    expect(canPlaceSource(100, 'source-red', 100)).toBe(false)
    expect(canPlaceSource(100, 'source-red', 101)).toBe(false)
    expect(applyPowerDrop(100, 1)).toBe(101)
  })

  it('normalizes hostile splitter ratios at the rules boundary and conserves power', () => {
    expect(normalizeSplitRatios([0.8, 0.4])).toEqual([2 / 3, 1 / 3])
    expect(normalizeSplitRatios([-3, Number.NaN, 0])).toEqual([1 / 3, 1 / 3, 1 / 3])
    const outputs = splitPower({ r: 50, g: 75, b: 100 }, [8, 4, -2])
    expect(outputs).toHaveLength(3)
    expect(outputs.reduce((sum, output) => sum + totalPower(output), 0)).toBeCloseTo(225)
    expect(outputs[0].r).toBeCloseTo(50 * 2 / 3)
    expect(outputs[0].g).toBeCloseTo(50)
    expect(outputs[0].b).toBeCloseTo(100 * 2 / 3)
  })

  it('separates multicolor prism input into RGB and treats monochrome input as a normal splitter', () => {
    expect(prismSplitPower({ r: 40, g: 30, b: 20 }, [0.9, 0.1])).toEqual([
      { r: 40, g: 0, b: 0 },
      { r: 0, g: 30, b: 0 },
      { r: 0, g: 0, b: 20 },
    ])
    expect(prismSplitPower({ r: 48, g: 0, b: 0 }, [2, 1, 1])).toEqual([
      { r: 24, g: 0, b: 0 },
      { r: 12, g: 0, b: 0 },
      { r: 12, g: 0, b: 0 },
    ])
    expect(mixRgb([{ r: 50, g: 0, b: 0 }, { r: 0, g: 75, b: 0 }, { r: 0, g: 0, b: 100 }])).toEqual({ r: 50, g: 75, b: 100 })
    expect(visibleColor({ r: 50, g: 50, b: 0 })).toBe('yellow')
    expect(filterPower({ r: 50, g: 75, b: 100 }, 'g')).toEqual({ r: 0, g: 75, b: 0 })
  })

  it('requires a ten-percent channel share for mixed-color classification', () => {
    expect(visibleColor({ r: 89, g: 10, b: 1 })).toBe('orange')
    expect(visibleColor({ r: 90, g: 9, b: 1 })).toBe('red')
  })

  it('reflects and freely snaps mirror directions', () => {
    const reflected = reflectDirection({ x: 1, y: 0 }, 45)
    expect(reflected.x).toBeCloseTo(0, 5)
    expect(reflected.y).toBeCloseTo(1, 5)
    const angle = mirrorAngleForTarget({ x: 1, y: 0 }, { x: 0.32, y: 0.95 })
    const snapped = reflectDirection({ x: 1, y: 0 }, angle)
    expect(snapped.x).toBeCloseTo(0.32, 2)
    expect(snapped.y).toBeCloseTo(0.95, 2)
  })

  it('only lets the front enemy block a beam and restores the path after it dies', () => {
    const enemies: Array<EnemyState & { position: Point }> = [
      { ...target({ id: 'near', health: 10, maxHealth: 10 }), position: { x: 30, y: 0 } },
      { ...target({ id: 'far', health: 10, maxHealth: 10 }), position: { x: 70, y: 0 } },
    ]
    expect(frontmostBlockingEnemy({ x: 0, y: 0 }, { x: 100, y: 0 }, enemies)?.id).toBe('near')
    enemies[0].dead = true
    expect(frontmostBlockingEnemy({ x: 0, y: 0 }, { x: 100, y: 0 }, enemies)?.id).toBe('far')
  })

  it('charges a capacitor and uses the documented nonlinear radius and damage', () => {
    const charged = chargeCapacitor({ chargeJ: 0, maxChargeJ: 450, destroyed: false }, 90, 5)
    expect(charged.chargeJ).toBe(450)
    expect(detonateCapacitor(charged)).toMatchObject({ radius: 420, damage: 96, chargeSpentJ: 450, destroyed: true })
    expect(detonateCapacitor({ ...charged, destroyed: true })).toBeNull()
  })

  it('builds radiation, bursts at four stacks, and decays only after 1.5 idle seconds', () => {
    const irradiated = applyOpticalHit(target(), { r: 0, g: 0, b: 90 }, 1)
    expect(irradiated.status.radiationStacks).toBe(2)
    const burst = applyOpticalHit({ ...irradiated, status: { ...irradiated.status, radiationStacks: 3 } }, { r: 0, g: 0, b: 45 }, 1)
    expect(burst.status.radiationStacks).toBe(0)
    expect(irradiated.health - burst.health).toBeCloseTo(18 + 45 * 0.025)

    const waiting = tickStatuses({ ...irradiated, status: { ...irradiated.status, radiationStacks: 2, radiationIdleSeconds: 0 } }, 1.5)
    expect(waiting.status.radiationStacks).toBe(2)
    const decaying = tickStatuses(waiting, 1)
    expect(decaying.status.radiationStacks).toBeCloseTo(1.4)
  })

  it('enforces toxin ignition and thermal shock cooldowns', () => {
    const poisoned = target({ status: { ...EMPTY_STATUS, poisonSeconds: 3 } })
    const ignited = applyOpticalHit(poisoned, { r: 0, g: 50, b: 0 }, 0.1)
    expect(ignited.status.poisonSeconds).toBe(0)
    expect(ignited.status.toxinIgnitionCooldownS).toBe(1)
    const ignitionDamage = poisoned.health - ignited.health
    const blockedIgnition = applyOpticalHit({ ...ignited, health: 200, status: { ...ignited.status, poisonSeconds: 3 } }, { r: 0, g: 50, b: 0 }, 0.1)
    expect(200 - blockedIgnition.health).toBeLessThan(ignitionDamage)

    const frozen = target({ status: { ...EMPTY_STATUS, freezeSeconds: 1 } })
    const shocked = applyOpticalHit(frozen, { r: 0, g: 50, b: 0 }, 0.1)
    expect(shocked.status.freezeSeconds).toBe(0)
    expect(shocked.status.thermalShockCooldownS).toBe(1.2)
    expect(frozen.health - shocked.health).toBeGreaterThan(12)
    const broken = applyOpticalHit(target({ status: { ...EMPTY_STATUS, freezeSeconds: 1, thermalShockCooldownS: 0.5 } }), { r: 0, g: 50, b: 0 }, 0.1)
    expect(broken.status.freezeSeconds).toBeGreaterThan(0)
    expect(broken.status.armorBrokenSeconds).toBe(2)
  })

  it('keeps mixed spectra exclusive so they cannot repeatedly trigger their own reactions', () => {
    const runFor = (power: { r: number; g: number; b: number }, seconds = 12, resistance?: 'r' | 'g' | 'b') => {
      let enemy = target({ health: 1000, maxHealth: 1000, resistance })
      for (let step = 0; step < seconds * 30; step += 1) {
        enemy = tickStatuses(applyOpticalHit(enemy, power, 1 / 30), 1 / 30)
      }
      return (1000 - enemy.health) / seconds
    }

    const redDps = runFor({ r: 50, g: 0, b: 0 })
    const yellowDps = runFor({ r: 25, g: 25, b: 0 })
    const white = applyOpticalHit(target(), { r: 20, g: 20, b: 20 }, 1)
    expect(yellowDps).toBeLessThan(8)
    expect(yellowDps).toBeGreaterThan(3)
    expect(runFor({ r: 50, g: 0, b: 0 }, 12, 'r')).toBeLessThan(redDps * 0.5)
    expect(white.status.poisonSeconds).toBe(0)
    expect(white.status.burnSeconds).toBe(0)
    expect(white.status.freezeSeconds).toBe(0)
    expect(white.status.radiationStacks).toBe(0)
  })

  it('scales damage-over-time potency for raw beams and resisted channels', () => {
    const full = applyOpticalHit(target(), { r: 50, g: 0, b: 0 }, 0, { statusMultiplier: 1 })
    const raw = applyOpticalHit(target(), { r: 50, g: 0, b: 0 }, 0, { statusMultiplier: 0.25 })
    const resisted = applyOpticalHit(target({ resistance: 'r' }), { r: 50, g: 0, b: 0 }, 0)
    expect(full.status.poisonPotency).toBe(1)
    expect(raw.status.poisonPotency).toBe(0.25)
    expect(resisted.status.poisonPotency).toBe(0.6)
    expect(200 - tickStatuses(raw, 1).health).toBeCloseTo(OPTICAL_REACTIONS.poisonDps * 0.25)
  })

  it('uses white light to break shields and grants four seconds of vulnerability', () => {
    const shielded = target({ status: { ...EMPTY_STATUS, shield: 10 } })
    const partial = applyOpticalHit(shielded, { r: 20, g: 20, b: 20 }, 0.5)
    expect(partial.health).toBe(200)
    expect(partial.status.shield).toBeGreaterThan(0)
    const broken = applyOpticalHit(partial, { r: 100, g: 100, b: 100 }, 1)
    expect(broken.status.shield).toBe(0)
    expect(broken.status.vulnerableSeconds).toBe(4)
    const normal = applyOpticalHit(target(), { r: 50, g: 0, b: 0 }, 1)
    const vulnerable = applyOpticalHit(target({ status: { ...EMPTY_STATUS, vulnerableSeconds: 2 } }), { r: 50, g: 0, b: 0 }, 1)
    expect(200 - vulnerable.health).toBeCloseTo((200 - normal.health) * 1.25)
  })

  it('does not let armored health reduction weaken white-light shield damage', () => {
    const armored = target({ kind: 'armored', status: { ...EMPTY_STATUS, shield: 100 } })
    const hit = applyOpticalHit(armored, { r: 100, g: 100, b: 100 }, 1)
    expect(hit.health).toBe(200)
    expect(hit.status.shield).toBeCloseTo(100 - (100 * 0.06 + 100 * 0.018 + 100 * 0.025) * 2.5)
  })

  it('lets non-white damage leak through shields without consuming them', () => {
    const hit = applyOpticalHit(target({ status: { ...EMPTY_STATUS, shield: 25 } }), { r: 50, g: 0, b: 0 }, 1)
    expect(hit.status.shield).toBe(25)
    expect(200 - hit.health).toBeCloseTo(50 * 0.06 * 0.7)
  })

  it('reduces only the resisted color channel and slows matching status buildup', () => {
    const redResistant = target({ resistance: 'r' })
    const pureRed = applyOpticalHit(redResistant, { r: 50, g: 0, b: 0 }, 1)
    const pureBlue = applyOpticalHit(redResistant, { r: 0, g: 0, b: 50 }, 1)
    expect(200 - pureRed.health).toBeCloseTo(50 * 0.3 * 0.06)
    expect(200 - pureBlue.health).toBeCloseTo(50 * 0.025)
    const blueResistant = applyOpticalHit(target({ resistance: 'b' }), { r: 0, g: 0, b: 90 }, 1)
    expect(blueResistant.status.radiationStacks).toBeCloseTo(0.6)
  })
})
