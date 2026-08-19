import { describe, expect, it } from 'vitest'

import { HAT_NAMES_BY_SIZE, HATS, HATS_BY_SIZE, HAT_SIZE_IDS, QUESTIONS_BY_SIZE } from './data'
import { scoreHatFactory } from './scoring'

describe('hat factory question bank', () => {
  it('contains exactly the three documented lines and 27 documented hats', () => {
    expect(HAT_SIZE_IDS).toEqual(['large', 'medium', 'small'])
    expect(HATS).toHaveLength(27)
    expect(new Set(HATS.map(({ name }) => name)).size).toBe(27)
    HAT_SIZE_IDS.forEach((size) => {
      expect(HATS_BY_SIZE[size]).toHaveLength(9)
      expect(HATS_BY_SIZE[size].map(({ name }) => name)).toEqual([...HAT_NAMES_BY_SIZE[size]])
    })
  })

  it('has 20 four-option questions per production line with local weights only', () => {
    HAT_SIZE_IDS.forEach((size) => {
      const names = new Set(HAT_NAMES_BY_SIZE[size])
      expect(QUESTIONS_BY_SIZE[size]).toHaveLength(20)
      expect(new Set(QUESTIONS_BY_SIZE[size].map(({ id }) => id)).size).toBe(20)
      QUESTIONS_BY_SIZE[size].forEach((question) => {
        expect(question.options).toHaveLength(4)
        question.options.forEach((option) => option.weights.forEach(([name, weight]) => {
          expect(names.has(name)).toBe(true)
          expect(weight).toBeGreaterThan(0)
        }))
      })
    })
  })
})

describe('scoreHatFactory', () => {
  it('returns a deterministic result within the selected line', () => {
    HAT_SIZE_IDS.forEach((size) => {
      const questions = QUESTIONS_BY_SIZE[size]
      const answers = questions.map((question) => question.options[0].id)
      const first = scoreHatFactory(size, answers)
      const second = scoreHatFactory(size, answers)
      expect(first.hat.name).toBe(second.hat.name)
      expect(HAT_NAMES_BY_SIZE[size]).toContain(first.hat.name)
      expect(first.size).toBe(size)
      expect(first.verdict).toBe(first.hat.verdict)
    })
  })

  it('rejects incomplete or invalid answer sequences', () => {
    expect(() => scoreHatFactory('small', [])).toThrow(/Expected 20 answers/)
    expect(() => scoreHatFactory('large', Array.from({ length: 20 }, () => 'missing'))).toThrow(/Invalid answer/)
  })
})
