import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LEVEL,
  placeFold,
  placeTool,
  runLevel,
  type Level,
  type ToolInventory,
} from './model'

const emptyInventory = (): ToolInventory => ({
  'turn-left': 0,
  'turn-right': 0,
  splitter: 0,
})

const makeLevel = (overrides: Partial<Level> = {}): Level => ({
  width: 7,
  duration: 4,
  starts: [
    { point: { x: 1, t: 0 }, direction: 1 },
    { point: { x: 5, t: 0 }, direction: -1 },
  ],
  target: { x: 3, t: 4 },
  forbidden: [],
  inventory: emptyInventory(),
  budget: 4,
  ...overrides,
})

describe('causal origami optical model', () => {
  it.each([
    ['turn-left', -1],
    ['turn-right', 1],
  ] as const)('changes an incoming branch direction with a %s tool', (tool, direction) => {
    const incomingDirection = direction === -1 ? 1 : -1
    const level = makeLevel({
      starts: [
        { point: { x: 2 - incomingDirection, t: 0 }, direction: incomingDirection },
        { point: { x: 5, t: 0 }, direction: -1 },
      ],
      inventory: { ...emptyInventory(), [tool]: 1 },
    })
    const placed = placeTool(new Map(), { point: { x: 2, t: 1 }, tool }, level)

    expect(placed.ok).toBe(true)
    if (!placed.ok) return

    const result = runLevel(level, placed.placements)
    expect(result.branchesForSource[0].some((branch) => branch.direction === direction)).toBe(true)
  })

  it('splits one incoming branch into both directions', () => {
    const level = makeLevel({ inventory: { ...emptyInventory(), splitter: 1 } })
    const placed = placeTool(new Map(), { point: { x: 2, t: 1 }, tool: 'splitter' }, level)

    expect(placed.ok).toBe(true)
    if (!placed.ok) return

    const result = runLevel(level, placed.placements)
    expect(result.branchesForSource[0].some((branch) => branch.direction === -1)).toBe(true)
    expect(result.branchesForSource[0].some((branch) => branch.direction === 1)).toBe(true)
  })

  it('rejects placement when that tool inventory is exhausted', () => {
    const level = makeLevel({ inventory: { ...emptyInventory(), splitter: 1 } })
    const first = placeTool(new Map(), { point: { x: 2, t: 1 }, tool: 'splitter' }, level)

    expect(first.ok).toBe(true)
    if (!first.ok) return

    const result = placeTool(first.placements, { point: { x: 3, t: 1 }, tool: 'splitter' }, level)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('inventory')
  })

  it.each([
    ['start', { x: 1, t: 0 }],
    ['target', { x: 3, t: 4 }],
    ['forbidden', { x: 2, t: 2 }],
  ] as const)('rejects placement on a %s event', (kind, point) => {
    const level = makeLevel({
      forbidden: [{ x: 2, t: 2 }],
      inventory: { ...emptyInventory(), splitter: 1 },
    })
    const result = placeTool(new Map(), { point, tool: 'splitter' }, level)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(kind)
  })

  it('deduplicates repeated branches with the same source, event, and direction', () => {
    const level = makeLevel({
      duration: 3,
      target: { x: 6, t: 3 },
      inventory: { 'turn-left': 1, 'turn-right': 1, splitter: 2 },
    })
    const placements = new Map([
      ['2,1', 'splitter'],
      ['1,2', 'turn-right'],
      ['3,2', 'turn-left'],
      ['2,3', 'splitter'],
    ] as const)

    const result = runLevel(level, placements)

    expect(result.branchesForSource[0]).toHaveLength(2)
    expect(result.branchesForSource[0].map((branch) => branch.direction).sort()).toEqual([-1, 1])
  })

  it('succeeds when every source has at least one legal branch reaching the target', () => {
    const level = makeLevel({
      target: { x: 3, t: 2 },
      forbidden: [{ x: 0, t: 2 }],
      inventory: { ...emptyInventory(), splitter: 2 },
    })
    const placements = new Map([
      ['2,1', 'splitter'],
      ['4,1', 'splitter'],
    ] as const)

    const result = runLevel(level, placements)

    expect(result.success).toBe(true)
  })

  it('does not succeed when only one source reaches the target', () => {
    const level = makeLevel({
      target: { x: 3, t: 2 },
      starts: [
        { point: { x: 1, t: 0 }, direction: 1 },
        { point: { x: 6, t: 0 }, direction: 1 },
      ],
    })

    expect(runLevel(level, new Map()).success).toBe(false)
  })

  it('keeps the legacy fold API and trace fields available until the UI migrates', () => {
    const placed = placeFold(new Map(), { x: 2, t: 2 }, -1, DEFAULT_LEVEL)

    expect(placed.ok).toBe(true)
    if (!placed.ok) return

    const result = runLevel(DEFAULT_LEVEL, placed.folds)
    expect(result.paths).toHaveLength(2)
    expect(result.legal).toBeTypeOf('boolean')
    expect(DEFAULT_LEVEL.budget).toBe(4)
  })
})
