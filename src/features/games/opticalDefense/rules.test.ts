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
  reflectDirection,
  splitPower,
  visibleColor,
} from './rules'
import type { EnemyState, Point } from './types'
import { EMPTY_STATUS } from './types'

const target = (patch: Partial<EnemyState> = {}): EnemyState => ({
  id: 'target', kind: 'normal', health: 200, maxHealth: 200, speed: 1, progress: 0,
  rewardCoins: 1, rewardPowerW: 1, status: { ...EMPTY_STATUS }, ...patch,
})

describe('optical defense rules', () => {
  it('keeps level one at 100W and enforces source capacity', () => {
    expect(canPlaceSource(0, 'source-red', 100)).toBe(true)
    expect(canPlaceSource(50, 'source-red', 100)).toBe(true)
    expect(canPlaceSource(100, 'source-red', 100)).toBe(false)
  })

  it('allows two 50W red sources but rejects the third at the level-one capacity', () => {
    expect(canPlaceSource(0, 'source-red', 100)).toBe(true)
    expect(canPlaceSource(50, 'source-red', 100)).toBe(true)
    expect(canPlaceSource(100, 'source-red', 100)).toBe(false)
    expect(canPlaceSource(100, 'source-red', 101)).toBe(false)
    expect(101 - 100).toBe(1)
  })

  it('adds a dropped 1W directly to the current level capacity', () => {
    expect(applyPowerDrop(100, 1)).toBe(101)
  })

  it('caps splitter output at input power and mixes RGB channels', () => {
    expect(splitPower({ r: 50, g: 0, b: 0 }, [0.25, 0.75]).map((item) => item.r)).toEqual([12.5, 37.5])
    expect(() => splitPower({ r: 50, g: 0, b: 0 }, [0.8, 0.4])).toThrow()
    expect(mixRgb([{ r: 50, g: 0, b: 0 }, { r: 0, g: 75, b: 0 }, { r: 0, g: 0, b: 100 }])).toEqual({ r: 50, g: 75, b: 100 })
    expect(visibleColor({ r: 50, g: 50, b: 0 })).toBe('yellow')
    expect(filterPower({ r: 50, g: 75, b: 100 }, 'g')).toEqual({ r: 0, g: 75, b: 0 })
  })

  it('reflects a horizontal ray off a 45 degree mirror', () => {
    const reflected = reflectDirection({ x: 1, y: 0 }, 45)
    expect(reflected.x).toBeCloseTo(0, 5)
    expect(reflected.y).toBeCloseTo(1, 5)
  })

  it('calculates a free-angle mirror snap toward any selected target', () => {
    const angle = mirrorAngleForTarget({ x: 1, y: 0 }, { x: 0.32, y: 0.95 })
    const reflected = reflectDirection({ x: 1, y: 0 }, angle)
    expect(reflected.x).toBeCloseTo(0.32, 2)
    expect(reflected.y).toBeCloseTo(0.95, 2)
  })

  it('only lets the front enemy block a beam and restores the path after it dies', () => {
    const enemies: Array<EnemyState & { position: Point }> = [
      { id: 'near', kind: 'normal' as const, health: 10, maxHealth: 10, speed: 1, progress: 0.3, rewardCoins: 1, rewardPowerW: 1, status: { poisonSeconds: 0, burnSeconds: 0, freezeSeconds: 0, radiationStacks: 0, armorBrokenSeconds: 0, shield: 0 }, position: { x: 30, y: 0 } },
      { id: 'far', kind: 'normal' as const, health: 10, maxHealth: 10, speed: 1, progress: 0.7, rewardCoins: 1, rewardPowerW: 1, status: { poisonSeconds: 0, burnSeconds: 0, freezeSeconds: 0, radiationStacks: 0, armorBrokenSeconds: 0, shield: 0 }, position: { x: 70, y: 0 } },
    ]
    expect(frontmostBlockingEnemy({ x: 0, y: 0 }, { x: 100, y: 0 }, enemies)?.id).toBe('near')
    enemies[0].dead = true
    expect(frontmostBlockingEnemy({ x: 0, y: 0 }, { x: 100, y: 0 }, enemies)?.id).toBe('far')
  })

  it('charges a capacitor with input power times time and detonates once', () => {
    const charged = chargeCapacitor({ chargeJ: 0, maxChargeJ: 100, destroyed: false }, 50, 2)
    expect(charged.chargeJ).toBe(100)
    const explosion = detonateCapacitor(charged, Math.hypot(900, 520))
    expect(explosion?.radius).toBeGreaterThanOrEqual(Math.hypot(900, 520))
    expect(explosion?.destroyed).toBe(true)
    expect(detonateCapacitor({ ...charged, destroyed: true }, 1000)).toBeNull()
  })

  it('builds radiation from pure blue light and bursts at the threshold', () => {
    const first = applyOpticalHit(target(), { r: 0, g: 0, b: 90 }, 1)
    expect(first.status.radiationStacks).toBeGreaterThan(0)
    const burst = applyOpticalHit({ ...first, status: { ...first.status, radiationStacks: 2.9 } }, { r: 0, g: 0, b: 90 }, 1)
    expect(burst.status.radiationStacks).toBe(0)
    expect(first.health - burst.health).toBeGreaterThan(14)
    expect(first.health - burst.health).toBeLessThan(25)
  })

  it('ignites and consumes poison for fast settlement damage', () => {
    const poisoned = target({ status: { ...EMPTY_STATUS, poisonSeconds: 3 } })
    const ignited = applyOpticalHit(poisoned, { r: 50, g: 0, b: 0 }, 0.1)
    expect(ignited.status.poisonSeconds).toBe(0)
    expect(ignited.status.burnSeconds).toBeGreaterThanOrEqual(3)
    expect(poisoned.health - ignited.health).toBeGreaterThan(10)
    expect(poisoned.health - ignited.health).toBeLessThan(18)
  })

  it('resolves a one-time thermal shock and applies frozen armor break', () => {
    const frozen = target({ status: { ...EMPTY_STATUS, freezeSeconds: 1 } })
    const shocked = applyOpticalHit(frozen, { r: 50, g: 0, b: 0 }, 0.1)
    expect(shocked.status.freezeSeconds).toBe(0)
    expect(frozen.health - shocked.health).toBeGreaterThan(9)
    expect(frozen.health - shocked.health).toBeLessThan(14)
    const broken = applyOpticalHit(target(), { r: 0, g: 40, b: 60 }, 0.1)
    expect(broken.status.armorBrokenSeconds).toBeGreaterThan(1)
  })

  it('uses white light on shields before applying health damage', () => {
    const shielded = target({ status: { ...EMPTY_STATUS, shield: 25 } })
    const hit = applyOpticalHit(shielded, { r: 50, g: 50, b: 50 }, 0.2)
    expect(hit.status.shield).toBeLessThan(25)
    expect(hit.health).toBe(200)
  })

  it('adds focused bonus only when the target already has a status', () => {
    const plain = target()
    const poisoned = target({ status: { ...EMPTY_STATUS, poisonSeconds: 2 } })
    const normalHit = applyOpticalHit(poisoned, { r: 0, g: 0, b: 50 }, 0.2)
    const focusedHit = applyOpticalHit(poisoned, { r: 0, g: 0, b: 50 }, 0.2, { focused: true, focusedStrength: 1 })
    const focusedPlain = applyOpticalHit(plain, { r: 0, g: 0, b: 50 }, 0.2, { focused: true, focusedStrength: 1 })
    expect(focusedHit.health).toBeLessThan(normalHit.health)
    expect(focusedPlain.health).toBeCloseTo(applyOpticalHit(plain, { r: 0, g: 0, b: 50 }, 0.2).health)
  })

  it('reduces only the resisted color channel and slows matching status buildup', () => {
    const redResistant = target({ resistance: 'r' })
    const pureRed = applyOpticalHit(redResistant, { r: 50, g: 0, b: 0 }, 1)
    const pureBlue = applyOpticalHit(redResistant, { r: 0, g: 0, b: 50 }, 1)
    const mixed = applyOpticalHit(redResistant, { r: 1, g: 0, b: 49 }, 1)
    expect(200 - pureRed.health).toBeCloseTo(50 * 0.2 * 0.085)
    expect(200 - pureBlue.health).toBeCloseTo(50 * 0.04)
    expect(200 - mixed.health).toBeGreaterThan(1.9)
    const blueResistant = applyOpticalHit(target({ resistance: 'b' }), { r: 0, g: 0, b: 90 }, 1)
    expect(blueResistant.status.radiationStacks).toBeCloseTo(0.4)
  })
})
