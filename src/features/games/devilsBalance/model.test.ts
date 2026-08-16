import { describe, expect, it } from 'vitest'

import { DEVILS_BALANCE_LEVELS } from './levels'
import {
  COLOR_IDS, addTrays, countTrays, enumerateAssignments, evaluateTrays,
  filterCandidates, validatePlayerTrays, type Trays,
} from './model'

describe('devils balance model', () => {
  it('enumerates the distinct 1-10 candidate space around a known reference', () => {
    const candidates = enumerateAssignments({ color: 'red', weight: 5 })

    expect(candidates).toHaveLength(3024)
    expect(candidates.every((candidate) => candidate.red === 5)).toBe(true)
    expect(candidates.every((candidate) => new Set(Object.values(candidate)).size === 5)).toBe(true)
  })

  it.each(DEVILS_BALANCE_LEVELS.map((level) => [level.order, level] as const))(
    'keeps the designed solution for level %s inside every measurement record',
    (_order, level) => {
      let candidates = enumerateAssignments(level.reference)
      const used = COLOR_IDS.reduce<Record<string, number>>((counts, color) => {
        counts[color] = 0
        return counts
      }, {})

      expect(level.solutionPlan).toHaveLength(level.npcPhases.length)
      level.solutionPlan.forEach((player, index) => {
        expect(validatePlayerTrays(player, COLOR_IDS.reduce<Record<string, number>>((inventory, color) => {
          inventory[color] = level.inventoryPerColor - used[color]
          return inventory
        }, {}), level.playerLimit)).toEqual({ ok: true })

        COLOR_IDS.forEach((color) => {
          used[color] += player.reduce((total, pan) => total + pan[color], 0)
        })

        const combined = addTrays(level.npcPhases[index], player)
        const result = evaluateTrays(combined, level.target)
        candidates = filterCandidates(candidates, combined, result)

        expect(candidates).toContainEqual(level.target)
        expect(candidates.length).toBeGreaterThan(0)
      })

      expect(candidates).toHaveLength(1)
      expect(candidates[0]).toEqual(level.target)
      expect(Object.values(used).every((count) => count <= level.inventoryPerColor)).toBe(true)
    },
  )

  it('counts both scales independently and preserves empty-pan equality', () => {
    const trays: Trays = [
      { red: 1, yellow: 0, green: 0, blue: 0, purple: 0 },
      { red: 0, yellow: 0, green: 0, blue: 0, purple: 0 },
      { red: 0, yellow: 0, green: 0, blue: 0, purple: 0 },
      { red: 0, yellow: 0, green: 0, blue: 0, purple: 0 },
    ]

    expect(countTrays(trays)).toBe(1)
    expect(evaluateTrays(trays, { red: 5, yellow: 2, green: 7, blue: 4, purple: 9 })).toEqual(['>', '='])
  })
})
