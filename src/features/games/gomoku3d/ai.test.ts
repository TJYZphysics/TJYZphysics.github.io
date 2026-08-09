import { describe, expect, it } from 'vitest'
import { chooseAiMove, getCandidateMoves, wouldWin } from './ai'
import {
  BLACK,
  EMPTY,
  WHITE,
  coordinateToIndex,
  createEmptyBoard,
  getCell,
  type Coordinate,
  type Player,
} from './rules'

function place(board: Uint8Array, player: Player, points: Coordinate[]) {
  for (const point of points) board[coordinateToIndex(point)] = player
}

describe('3D gomoku AI', () => {
  it('takes an immediate win on a body diagonal', () => {
    const board = createEmptyBoard()
    place(board, WHITE, [0, 1, 2, 3].map((value) => ({ x: value, y: value, z: value })))

    expect(chooseAiMove(board, WHITE, 'medium')).toEqual({ x: 4, y: 4, z: 4 })
  })

  it('blocks an opponent immediate win before applying heuristics', () => {
    const board = createEmptyBoard()
    place(board, BLACK, [1, 2, 3, 4].map((x) => ({ x, y: 3, z: 5 })))
    place(board, WHITE, [{ x: 3, y: 4, z: 5 }])

    const move = chooseAiMove(board, WHITE, 'hard')
    expect(move).not.toBeNull()
    expect(wouldWin(board, move!, BLACK)).toBe(true)
  })

  it('returns only empty nearby cells once play has started', () => {
    const board = createEmptyBoard()
    const origin = { x: 3, y: 3, z: 3 }
    board[coordinateToIndex(origin)] = BLACK
    const candidates = getCandidateMoves(board)

    expect(candidates).toHaveLength(26)
    expect(candidates).not.toContainEqual(origin)
    expect(candidates.every((move) => getCell(board, move) === EMPTY)).toBe(true)
  })

  it('uses the seeded random source in easy mode', () => {
    const board = createEmptyBoard()
    expect(chooseAiMove(board, BLACK, 'easy', () => 0)).toEqual({ x: 3, y: 3, z: 3 })
    expect(chooseAiMove(board, BLACK, 'easy', () => 0.999)).toEqual({ x: 4, y: 4, z: 4 })
  })

  it('does not mutate the supplied board while searching', () => {
    const board = createEmptyBoard()
    place(board, BLACK, [
      { x: 3, y: 3, z: 3 },
      { x: 4, y: 3, z: 3 },
    ])
    place(board, WHITE, [{ x: 4, y: 4, z: 4 }])
    const snapshot = board.slice()

    const move = chooseAiMove(board, WHITE, 'hard')
    expect(move).not.toBeNull()
    expect(getCell(board, move!)).toBe(EMPTY)
    expect(board).toEqual(snapshot)
  })
})
