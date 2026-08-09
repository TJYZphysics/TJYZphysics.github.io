export const BOARD_SIZE = 8
export const WIN_LENGTH = 5

export const EMPTY = 0 as const
export const BLACK = 1 as const
export const WHITE = 2 as const

export type Player = typeof BLACK | typeof WHITE
export type Cell = typeof EMPTY | Player

export interface Coordinate {
  x: number
  y: number
  z: number
}

export interface PlayedMove extends Coordinate {
  player: Player
}

export type Winner = Player | 'draw' | null

export interface GameState {
  board: Uint8Array
  currentPlayer: Player
  winner: Winner
  winningLine: Coordinate[]
  history: PlayedMove[]
}

export const DIRECTIONS: readonly Coordinate[] = [
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 1, y: 1, z: 0 },
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: 1 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: 1 },
  { x: 0, y: 1, z: -1 },
  { x: 1, y: 1, z: 1 },
  { x: 1, y: 1, z: -1 },
  { x: 1, y: -1, z: 1 },
  { x: 1, y: -1, z: -1 },
] as const

export function isInsideBoard({ x, y, z }: Coordinate) {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    Number.isInteger(z) &&
    x >= 0 &&
    x < BOARD_SIZE &&
    y >= 0 &&
    y < BOARD_SIZE &&
    z >= 0 &&
    z < BOARD_SIZE
  )
}

export function coordinateToIndex({ x, y, z }: Coordinate) {
  return x + y * BOARD_SIZE + z * BOARD_SIZE * BOARD_SIZE
}

export function indexToCoordinate(index: number): Coordinate {
  const z = Math.floor(index / (BOARD_SIZE * BOARD_SIZE))
  const remainder = index - z * BOARD_SIZE * BOARD_SIZE
  const y = Math.floor(remainder / BOARD_SIZE)
  return { x: remainder - y * BOARD_SIZE, y, z }
}

export function otherPlayer(player: Player): Player {
  return player === BLACK ? WHITE : BLACK
}

export function createEmptyBoard() {
  return new Uint8Array(BOARD_SIZE ** 3)
}

export function createGameState(): GameState {
  return {
    board: createEmptyBoard(),
    currentPlayer: BLACK,
    winner: null,
    winningLine: [],
    history: [],
  }
}

export function getCell(board: Uint8Array, coordinate: Coordinate): Cell {
  if (!isInsideBoard(coordinate)) return EMPTY
  return board[coordinateToIndex(coordinate)] as Cell
}

export function findWinningLine(
  board: Uint8Array,
  origin: Coordinate,
  player: Player,
): Coordinate[] {
  if (!isInsideBoard(origin) || getCell(board, origin) !== player) return []

  for (const direction of DIRECTIONS) {
    const negative: Coordinate[] = []
    const positive: Coordinate[] = []

    for (const sign of [-1, 1] as const) {
      const target = sign === -1 ? negative : positive
      for (let distance = 1; distance < BOARD_SIZE; distance += 1) {
        const coordinate = {
          x: origin.x + direction.x * distance * sign,
          y: origin.y + direction.y * distance * sign,
          z: origin.z + direction.z * distance * sign,
        }
        if (!isInsideBoard(coordinate) || getCell(board, coordinate) !== player) break
        target.push(coordinate)
      }
    }

    const line = [...negative.reverse(), origin, ...positive]
    if (line.length >= WIN_LENGTH) return line
  }

  return []
}

export function isLegalMove(state: GameState, coordinate: Coordinate) {
  return (
    state.winner === null &&
    isInsideBoard(coordinate) &&
    getCell(state.board, coordinate) === EMPTY
  )
}

export function playMove(state: GameState, coordinate: Coordinate): GameState {
  if (!isLegalMove(state, coordinate)) return state

  const player = state.currentPlayer
  const board = state.board.slice()
  board[coordinateToIndex(coordinate)] = player
  const move = { ...coordinate, player }
  const history = [...state.history, move]
  const winningLine = findWinningLine(board, coordinate, player)
  const winner: Winner = winningLine.length >= WIN_LENGTH
    ? player
    : history.length === board.length
      ? 'draw'
      : null

  return {
    board,
    currentPlayer: otherPlayer(player),
    winner,
    winningLine,
    history,
  }
}

export function undoMoves(state: GameState, count = 1): GameState {
  const keep = Math.max(0, state.history.length - Math.max(0, count))
  if (keep === state.history.length) return state

  const history = state.history.slice(0, keep)
  const board = createEmptyBoard()
  for (const move of history) board[coordinateToIndex(move)] = move.player

  const lastMove = history.at(-1)
  const winningLine = lastMove
    ? findWinningLine(board, lastMove, lastMove.player)
    : []
  const winner: Winner = winningLine.length >= WIN_LENGTH
    ? lastMove!.player
    : history.length === board.length
      ? 'draw'
      : null

  return {
    board,
    currentPlayer: history.length % 2 === 0 ? BLACK : WHITE,
    winner,
    winningLine,
    history,
  }
}

export function coordinatesEqual(a: Coordinate | null, b: Coordinate | null) {
  return Boolean(a && b && a.x === b.x && a.y === b.y && a.z === b.z)
}
