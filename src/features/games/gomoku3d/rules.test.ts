import { describe, expect, it } from 'vitest'
import {
  BLACK,
  BOARD_SIZE,
  DIRECTIONS,
  EMPTY,
  WHITE,
  coordinateToIndex,
  createEmptyBoard,
  createGameState,
  findWinningLine,
  getCell,
  playMove,
  undoMoves,
  type Coordinate,
} from './rules'

describe('3D gomoku rules', () => {
  it('detects five stones along every unique spatial direction', () => {
    expect(DIRECTIONS).toHaveLength(13)

    for (const direction of DIRECTIONS) {
      const board = createEmptyBoard()
      const start = {
        x: direction.x < 0 ? 4 : direction.x > 0 ? 0 : 1,
        y: direction.y < 0 ? 4 : direction.y > 0 ? 0 : 1,
        z: direction.z < 0 ? 4 : direction.z > 0 ? 0 : 1,
      }
      const points: Coordinate[] = []

      for (let step = 0; step < 5; step += 1) {
        const point = {
          x: start.x + direction.x * step,
          y: start.y + direction.y * step,
          z: start.z + direction.z * step,
        }
        board[coordinateToIndex(point)] = BLACK
        points.push(point)
      }

      expect(findWinningLine(board, points[2], BLACK)).toHaveLength(5)
    }
  })

  it('plays alternating turns and locks the board after a win', () => {
    const sequence: Coordinate[] = [
      { x: 0, y: 0, z: 0 },
      { x: 7, y: 7, z: 7 },
      { x: 1, y: 0, z: 0 },
      { x: 7, y: 6, z: 7 },
      { x: 2, y: 0, z: 0 },
      { x: 7, y: 5, z: 7 },
      { x: 3, y: 0, z: 0 },
      { x: 6, y: 7, z: 7 },
      { x: 4, y: 0, z: 0 },
    ]
    const final = sequence.reduce(playMove, createGameState())

    expect(final.winner).toBe(BLACK)
    expect(final.winningLine).toHaveLength(5)
    expect(playMove(final, { x: 5, y: 0, z: 0 })).toBe(final)
  })

  it('rejects occupied and out-of-bounds cells without mutating state', () => {
    const initial = createGameState()
    const played = playMove(initial, { x: 3, y: 3, z: 3 })

    expect(getCell(initial.board, { x: 3, y: 3, z: 3 })).toBe(EMPTY)
    expect(getCell(played.board, { x: 3, y: 3, z: 3 })).toBe(BLACK)
    expect(playMove(played, { x: 3, y: 3, z: 3 })).toBe(played)
    expect(playMove(played, { x: BOARD_SIZE, y: 0, z: 0 })).toBe(played)
  })

  it('rewinds one or two plies and restores the correct turn', () => {
    let state = createGameState()
    state = playMove(state, { x: 3, y: 3, z: 3 })
    state = playMove(state, { x: 4, y: 4, z: 4 })
    state = playMove(state, { x: 3, y: 4, z: 3 })

    const onePly = undoMoves(state, 1)
    expect(onePly.history).toHaveLength(2)
    expect(onePly.currentPlayer).toBe(BLACK)
    expect(getCell(onePly.board, { x: 3, y: 4, z: 3 })).toBe(EMPTY)

    const twoPlies = undoMoves(state, 2)
    expect(twoPlies.history).toHaveLength(1)
    expect(twoPlies.currentPlayer).toBe(WHITE)
    expect(getCell(twoPlies.board, { x: 4, y: 4, z: 4 })).toBe(EMPTY)
  })
})
