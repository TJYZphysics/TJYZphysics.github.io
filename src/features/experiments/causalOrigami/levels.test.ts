import { describe, expect, it } from 'vitest'

import { eventKey, placeTool, runLevel } from './model'
import { LIGHT_PATH_LEVELS, replaySolution } from './levels'

describe('light path levels', () => {
  it('ships exactly twenty uniquely numbered, directly available levels', () => {
    expect(LIGHT_PATH_LEVELS).toHaveLength(20)
    expect(new Set(LIGHT_PATH_LEVELS.map((level) => level.id)).size).toBe(20)
    expect(LIGHT_PATH_LEVELS.map((level) => level.order)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1))
  })

  it('contains twenty structurally unique level configurations', () => {
    const fingerprints = LIGHT_PATH_LEVELS.map(({ starts, target, forbidden, inventory, solution }) => JSON.stringify({ starts, target, forbidden, inventory, solution }))
    expect(new Set(fingerprints).size).toBe(20)
  })

  it.each(LIGHT_PATH_LEVELS)('$id has valid geometry, inventory, and solution placements', (level) => {
    expect([level.width, level.duration]).toEqual([9, 8])
    expect(level.target.t).toBe(level.duration)
    const allPoints = [...level.starts.map(({ point }) => point), level.target, ...level.forbidden]
    for (const point of allPoints) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThan(level.width)
      expect(point.t).toBeGreaterThanOrEqual(0)
      expect(point.t).toBeLessThanOrEqual(level.duration)
    }
    expect(new Set(level.forbidden.map(eventKey)).size).toBe(level.forbidden.length)
    expect(level.forbidden.every((point) => !level.starts.some(({ point: start }) => eventKey(start) === eventKey(point)) && eventKey(point) !== eventKey(level.target))).toBe(true)
    expect(Object.values(level.inventory).every((count) => Number.isInteger(count) && count >= 0)).toBe(true)
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

  it('uses tools according to the intended progression', () => {
    expect(LIGHT_PATH_LEVELS.slice(0, 8).every((level) => level.solution.every(({ tool }) => tool !== 'splitter'))).toBe(true)
    expect(LIGHT_PATH_LEVELS.slice(8, 12).every((level) => level.solution.some(({ tool }) => tool === 'splitter'))).toBe(true)
    expect(LIGHT_PATH_LEVELS.slice(12, 16).every((level) => {
      const tools = new Set(level.solution.map(({ tool }) => tool))
      return tools.has('splitter') && (tools.has('turn-left') || tools.has('turn-right'))
    })).toBe(true)
    expect(LIGHT_PATH_LEVELS.slice(16).every((level) => {
      const forbidden = new Set(level.forbidden.map(eventKey))
      return level.forbidden.some(({ x, t }) => !forbidden.has(eventKey({ x: level.width - 1 - x, t })))
        && Object.entries(level.inventory).every(([tool, count]) => count === level.solution.filter((placement) => placement.tool === tool).length)
    })).toBe(true)
  })

  it('starts with genuinely short solutions and increases complexity by stage', () => {
    const solutionSizes = LIGHT_PATH_LEVELS.map((level) => level.solution.length)
    const stages = [
      { sizes: solutionSizes.slice(0, 4), min: 1, max: 4 },
      { sizes: solutionSizes.slice(4, 8), min: 4, max: 6 },
      { sizes: solutionSizes.slice(8, 12), min: 5, max: 7 },
      { sizes: solutionSizes.slice(12, 16), min: 6, max: 9 },
      { sizes: solutionSizes.slice(16, 20), min: 7, max: 12 },
    ]

    for (const { sizes, min, max } of stages) {
      expect(sizes.every((size) => size >= min && size <= max)).toBe(true)
      expect(sizes).toEqual([...sizes].sort((left, right) => left - right))
    }
  })

  it.each(LIGHT_PATH_LEVELS)('$id standard solution is playable and succeeds', (level) => {
    const placements = replaySolution(level)
    expect(runLevel(level, placements)).toMatchObject({ legal: true, success: true })
  })
})
