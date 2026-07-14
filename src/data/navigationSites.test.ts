import { describe, expect, it } from 'vitest'
import { navigationCategories } from './navigationSites'

describe('navigation directory data', () => {
  it('meets the requested minimum site counts', () => {
    const counts = Object.fromEntries(navigationCategories.map((category) => [category.id, category.sites.length]))
    expect(counts.common).toBeGreaterThanOrEqual(10)
    expect(counts.ai).toBeGreaterThanOrEqual(20)
    expect(counts.software).toBeGreaterThanOrEqual(40)
    expect(counts.papers).toBeGreaterThanOrEqual(10)
    expect(counts.tools).toBeGreaterThanOrEqual(15)
    expect(counts.tutorials).toBe(0)
  })

  it('keeps every description concise and every link absolute', () => {
    navigationCategories.flatMap((category) => category.sites).forEach((entry) => {
      expect(Array.from(entry.description).length).toBeLessThanOrEqual(30)
      expect(() => new URL(entry.url)).not.toThrow()
    })
  })
})
