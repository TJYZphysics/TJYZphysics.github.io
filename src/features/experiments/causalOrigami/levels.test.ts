import { describe, expect, it } from 'vitest'

import { eventKey, placeTool, runLevel } from './model'
import { LIGHT_PATH_LEVELS, replaySolution } from './levels'

describe('light path levels', () => {
  it('ships exactly twenty uniquely numbered, directly available levels', () => {
    expect(LIGHT_PATH_LEVELS).toHaveLength(20)
    expect(new Set(LIGHT_PATH_LEVELS.map((level) => level.id)).size).toBe(20)
    expect(LIGHT_PATH_LEVELS.map((level) => level.order)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1))
  })

  it.each(LIGHT_PATH_LEVELS)('$id has valid geometry, inventory, and solution placements', (level) => {
    expect([level.width, level.duration]).toEqual([9, 8])
    expect(level.target.t).toBe(level.duration)
    const occupied = new Set([...level.starts.map(({ point }) => eventKey(point)), eventKey(level.target), ...level.forbidden.map(eventKey)])
    const counts = { 'turn-left': 0, 'turn-right': 0, splitter: 0 }
    let placements = new Map()

    for (const placement of level.solution) {
      expect(placement.point.x).toBeGreaterThanOrEqual(0)
      expect(placement.point.x).toBeLessThan(level.width)
      expect(placement.point.t).toBeGreaterThanOrEqual(0)
      expect(placement.point.t).toBeLessThanOrEqual(level.duration)
      expect(occupied.has(eventKey(placement.point))).toBe(false)
      counts[placement.tool] += 1
      const result = placeTool(placements, placement, level)
      expect(result.ok).toBe(true)
      if (result.ok) placements = result.placements
    }

    expect(level.solution).toHaveLength(level.budget)
    expect(counts['turn-left']).toBeLessThanOrEqual(level.inventory['turn-left'])
    expect(counts['turn-right']).toBeLessThanOrEqual(level.inventory['turn-right'])
    expect(counts.splitter).toBeLessThanOrEqual(level.inventory.splitter)
  })

  it.each(LIGHT_PATH_LEVELS)('$id standard solution is playable and succeeds', (level) => {
    const placements = replaySolution(level)
    expect(runLevel(level, placements)).toMatchObject({ legal: true, success: true })
  })
})
