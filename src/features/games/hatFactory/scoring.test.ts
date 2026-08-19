import { describe, expect, it } from 'vitest'

import { HATS, HATS_BY_SIZE, HAT_SIZE_IDS, QUESTIONS_BY_SIZE, type HatSize } from './data'
import { scoreHatFactory } from './scoring'

describe('Hat Factory catalog', () => {
  it('keeps the historical 27-name catalog split into 9 hats per size', () => {
    expect(Object.keys(HATS)).toHaveLength(27)
    HAT_SIZE_IDS.forEach((size) => expect(HATS_BY_SIZE[size]).toHaveLength(9))
    expect(HATS_BY_SIZE.large.map(({ name }) => name)).toEqual(['叛徒', '特务', '大军阀', '反党分子', '野心家', '走资派', '投降派', '修正主义', '大恶霸'])
    expect(HATS_BY_SIZE.medium.map(({ name }) => name)).toEqual(['黑线人物', '不革命', '黑秀才', '黑手', '黑帮凶', '经验主义', '民主派', '中庸之道', '变色龙'])
    expect(HATS_BY_SIZE.small.map(({ name }) => name)).toEqual(['绊脚石', '墙头草', '老好人', '小修苗', '造谣公司', '传话筒', '逆流', '邪风', '小爬虫'])
  })

  it('provides a fixed 20-question, four-option production line per size', () => {
    HAT_SIZE_IDS.forEach((size) => {
      expect(QUESTIONS_BY_SIZE[size]).toHaveLength(20)
      expect(new Set(QUESTIONS_BY_SIZE[size].map(({ id }) => id)).size).toBe(20)
      QUESTIONS_BY_SIZE[size].forEach((question) => expect(question.options).toHaveLength(4))
    })
  })
})

describe('scoreHatFactory', () => {
  it('always returns a hat from the selected size', () => {
    HAT_SIZE_IDS.forEach((size) => {
      const optionIds = QUESTIONS_BY_SIZE[size].map(({ options }) => options[0].id)
      const result = scoreHatFactory(size, optionIds)
      expect(result.size).toBe(size)
      expect(HATS_BY_SIZE[size].some(({ name }) => name === result.hat.name)).toBe(true)
      expect(result.answeredCount).toBe(20)
    })
  })

  it('is deterministic and keeps missing answers out of the tally', () => {
    const size: HatSize = 'medium'
    const optionIds = QUESTIONS_BY_SIZE[size].map(({ options }) => options[2].id)
    expect(scoreHatFactory(size, optionIds)).toEqual(scoreHatFactory(size, optionIds))
    expect(() => scoreHatFactory(size, [])).toThrow(/Expected 20 answers/)
  })
})
