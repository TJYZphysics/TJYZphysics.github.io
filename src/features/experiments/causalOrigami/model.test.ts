import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LEVEL,
  placeFold,
  propagateSignal,
  runLevel,
  type EventPoint,
} from './model'

describe('causal origami model', () => {
  it('propagates one grid cell sideways and one tick forward inside the light cone', () => {
    expect(propagateSignal({ x: 1, t: 0 }, 1, new Map(), 3)).toEqual([
      { x: 1, t: 0 },
      { x: 2, t: 1 },
      { x: 3, t: 2 },
      { x: 4, t: 3 },
    ])
  })

  it('changes a signal direction at a fold event', () => {
    const folds = new Map<string, -1 | 1>([['2,1', -1]])
    expect(propagateSignal({ x: 1, t: 0 }, 1, folds, 3)).toEqual([
      { x: 1, t: 0 },
      { x: 2, t: 1 },
      { x: 1, t: 2 },
      { x: 0, t: 3 },
    ])
  })

  it('rejects folds in forbidden events', () => {
    const forbidden: EventPoint = DEFAULT_LEVEL.forbidden[0]
    const result = placeFold(new Map(), forbidden, 1, DEFAULT_LEVEL)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('forbidden')
  })

  it('reports success only when both signals meet at the target event', () => {
    const folds = new Map<string, -1 | 1>([
      ['2,2', -1],
      ['6,2', 1],
      ['0,4', 1],
      ['8,4', -1],
    ])
    const result = runLevel(DEFAULT_LEVEL, folds)
    expect(result.success).toBe(true)
    expect(result.meeting).toEqual(DEFAULT_LEVEL.target)
  })

  it('enforces the finite fold budget', () => {
    let folds = new Map<string, -1 | 1>()
    for (const point of DEFAULT_LEVEL.allowedSolutionPoints) {
      const placed = placeFold(folds, point, point.x < 4 ? -1 : 1, DEFAULT_LEVEL)
      expect(placed.ok).toBe(true)
      folds = placed.folds
    }
    const overBudget = placeFold(folds, { x: 4, t: 1 }, 1, DEFAULT_LEVEL)
    expect(overBudget.ok).toBe(false)
    if (!overBudget.ok) expect(overBudget.reason).toBe('budget')
  })

  it('rejects an apparent meeting when either signal crosses a forbidden event', () => {
    const folds = new Map<string, -1 | 1>([
      ['6,6', -1],
      ['2,6', 1],
    ])
    const result = runLevel(DEFAULT_LEVEL, folds)
    expect(result.success).toBe(false)
    expect(result.legal).toBe(false)
    expect(result.reason).toBe('forbidden')
    expect(result.violation).toEqual({ x: 4, t: 4 })
  })

  it('reports an out-of-bounds path as illegal instead of continuing off-grid', () => {
    const edgeLevel = {
      ...DEFAULT_LEVEL,
      starts: [
        { point: { x: 8, t: 0 }, direction: 1 as const },
        DEFAULT_LEVEL.starts[1],
      ] as typeof DEFAULT_LEVEL.starts,
    }
    const result = runLevel(edgeLevel, new Map())
    expect(result.success).toBe(false)
    expect(result.legal).toBe(false)
    expect(result.reason).toBe('outside')
    expect(result.violation).toEqual({ x: 9, t: 1 })
  })
})
