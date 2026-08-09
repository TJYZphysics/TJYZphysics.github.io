import { describe, expect, it } from 'vitest'
import { ANSWER_OPTIONS, DIMENSION_IDS, QUESTIONS, type AnswerValue } from './data'
import { classifyResult, scoreAssessment } from './scoring'

describe('Turing test question bank', () => {
  it('contains 24 balanced, non-technical personality questions with five answers', () => {
    expect(QUESTIONS).toHaveLength(24)
    expect(ANSWER_OPTIONS).toHaveLength(5)
    expect(new Set(QUESTIONS.map(({ id }) => id)).size).toBe(24)
    expect(QUESTIONS.filter(({ direction }) => direction === 1)).toHaveLength(12)
    expect(QUESTIONS.filter(({ direction }) => direction === -1)).toHaveLength(12)
    expect(QUESTIONS.map(({ dimension }) => dimension).sort()).toEqual(
      DIMENSION_IDS.flatMap((dimension) => Array.from({ length: 4 }, () => dimension)).sort(),
    )
    expect(QUESTIONS.map(({ prompt }) => prompt).join('')).not.toMatch(/编程语言|代码|算法|框架|数据库|操作系统/)
  })
})

describe('scoreAssessment', () => {
  it('maps answers toward the Turing pole and classifies a Turing result', () => {
    const answers = QUESTIONS.map(({ direction }) => (direction === 1 ? 4 : 0)) as AnswerValue[]
    const result = scoreAssessment(answers)
    expect(result.overall).toBe(100)
    expect(result.dimensions.every(({ value }) => value === 100)).toBe(true)
    expect(result.profile.kind).toBe('turing')
  })

  it('maps inverse answers toward the Von Neumann pole', () => {
    const answers = QUESTIONS.map(({ direction }) => (direction === 1 ? 0 : 4)) as AnswerValue[]
    const result = scoreAssessment(answers)
    expect(result.overall).toBe(0)
    expect(result.dimensions.every(({ value }) => value === 0)).toBe(true)
    expect(result.profile.kind).toBe('von-neumann')
  })

  it('keeps neutral answers balanced', () => {
    const result = scoreAssessment(Array.from({ length: 24 }, () => 2 as const))
    expect(result.overall).toBe(50)
    expect(result.profile.kind).toBe('balanced')
  })
})

describe('classifyResult', () => {
  it('uses stable inclusive boundaries for all three outcomes', () => {
    expect(classifyResult(57)).toBe('turing')
    expect(classifyResult(56)).toBe('balanced')
    expect(classifyResult(44)).toBe('balanced')
    expect(classifyResult(43)).toBe('von-neumann')
  })
})
