import {
  BLACK,
  BOARD_SIZE,
  DIRECTIONS,
  EMPTY,
  WHITE,
  coordinateToIndex,
  indexToCoordinate,
  isInsideBoard,
  otherPlayer,
  type Coordinate,
  type Player,
} from './rules'

export type AiDifficulty = 'easy' | 'medium' | 'hard'

const WIN_SCORE = 100_000_000
const WINDOW_WEIGHTS = [0, 2, 18, 180, 6_000, WIN_SCORE] as const

function coordinateKey({ x, y, z }: Coordinate) {
  return x + y * BOARD_SIZE + z * BOARD_SIZE * BOARD_SIZE
}

function boardIsEmpty(board: Uint8Array) {
  for (const cell of board) if (cell !== EMPTY) return false
  return true
}

function centralOpeningMoves() {
  const low = BOARD_SIZE / 2 - 1
  const high = BOARD_SIZE / 2
  const moves: Coordinate[] = []
  for (const x of [low, high]) {
    for (const y of [low, high]) {
      for (const z of [low, high]) moves.push({ x, y, z })
    }
  }
  return moves
}

export function getCandidateMoves(board: Uint8Array): Coordinate[] {
  if (boardIsEmpty(board)) return centralOpeningMoves()

  const candidateIndices = new Set<number>()
  for (let index = 0; index < board.length; index += 1) {
    if (board[index] === EMPTY) continue
    const origin = indexToCoordinate(index)
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          if (dx === 0 && dy === 0 && dz === 0) continue
          const candidate = { x: origin.x + dx, y: origin.y + dy, z: origin.z + dz }
          if (!isInsideBoard(candidate)) continue
          const candidateIndex = coordinateKey(candidate)
          if (board[candidateIndex] === EMPTY) candidateIndices.add(candidateIndex)
        }
      }
    }
  }

  return [...candidateIndices].map(indexToCoordinate)
}

function valueWithMove(
  board: Uint8Array,
  coordinate: Coordinate,
  moveIndex: number,
  player: Player,
) {
  const index = coordinateToIndex(coordinate)
  return index === moveIndex ? player : board[index]
}

export function wouldWin(board: Uint8Array, move: Coordinate, player: Player) {
  if (!isInsideBoard(move) || board[coordinateToIndex(move)] !== EMPTY) return false

  for (const direction of DIRECTIONS) {
    let count = 1
    for (const sign of [-1, 1] as const) {
      for (let distance = 1; distance < BOARD_SIZE; distance += 1) {
        const coordinate = {
          x: move.x + direction.x * distance * sign,
          y: move.y + direction.y * distance * sign,
          z: move.z + direction.z * distance * sign,
        }
        if (!isInsideBoard(coordinate)) break
        if (board[coordinateToIndex(coordinate)] !== player) break
        count += 1
      }
    }
    if (count >= 5) return true
  }

  return false
}

function centreBonus({ x, y, z }: Coordinate) {
  const centre = (BOARD_SIZE - 1) / 2
  const distance = Math.abs(x - centre) + Math.abs(y - centre) + Math.abs(z - centre)
  return (BOARD_SIZE * 1.5 - distance) * 1.6
}

export function evaluateMove(board: Uint8Array, move: Coordinate, player: Player) {
  const moveIndex = coordinateToIndex(move)
  if (!isInsideBoard(move) || board[moveIndex] !== EMPTY) return Number.NEGATIVE_INFINITY

  const opponent = otherPlayer(player)
  let score = centreBonus(move)

  for (const direction of DIRECTIONS) {
    for (let start = -4; start <= 0; start += 1) {
      let own = 0
      let opposing = 0
      let valid = true

      for (let step = 0; step < 5; step += 1) {
        const coordinate = {
          x: move.x + direction.x * (start + step),
          y: move.y + direction.y * (start + step),
          z: move.z + direction.z * (start + step),
        }
        if (!isInsideBoard(coordinate)) {
          valid = false
          break
        }
        const value = valueWithMove(board, coordinate, moveIndex, player)
        if (value === player) own += 1
        else if (value === opponent) opposing += 1
      }

      if (valid && opposing === 0) score += WINDOW_WEIGHTS[own]
    }
  }

  return score
}

function rankMoves(board: Uint8Array, moves: Coordinate[], player: Player) {
  const opponent = otherPlayer(player)
  return moves
    .map((move) => ({
      move,
      score: evaluateMove(board, move, player) + evaluateMove(board, move, opponent) * 0.9,
    }))
    .sort((a, b) => b.score - a.score || coordinateKey(a.move) - coordinateKey(b.move))
}

function chooseImmediateMove(board: Uint8Array, candidates: Coordinate[], player: Player) {
  return candidates.find((move) => wouldWin(board, move, player)) ?? null
}

function chooseHardMove(board: Uint8Array, candidates: Coordinate[], player: Player) {
  const opponent = otherPlayer(player)
  const ranked = rankMoves(board, candidates, player).slice(0, 16)
  let bestMove = ranked[0]?.move ?? null
  let bestScore = Number.NEGATIVE_INFINITY

  for (const candidate of ranked) {
    const index = coordinateToIndex(candidate.move)
    board[index] = player

    const responses = getCandidateMoves(board)
    const immediateLoss = responses.some((move) => wouldWin(board, move, opponent))
    const futureWins = responses.reduce(
      (count, move) => count + (wouldWin(board, move, player) ? 1 : 0),
      0,
    )

    let opponentReply = 0
    if (!immediateLoss) {
      const rankedReplies = rankMoves(board, responses, opponent).slice(0, 12)
      opponentReply = rankedReplies[0]?.score ?? 0
    }

    board[index] = EMPTY

    const score = candidate.score - (immediateLoss ? WIN_SCORE / 2 : opponentReply * 0.78) + futureWins * 24_000
    if (score > bestScore) {
      bestScore = score
      bestMove = candidate.move
    }
  }

  return bestMove
}

export function chooseAiMove(
  sourceBoard: Uint8Array,
  player: Player,
  difficulty: AiDifficulty,
  random: () => number = Math.random,
): Coordinate | null {
  const board = sourceBoard.slice()
  const candidates = getCandidateMoves(board)
  if (candidates.length === 0) return null

  if (difficulty === 'easy') {
    const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length))
    return candidates[index]
  }

  const winningMove = chooseImmediateMove(board, candidates, player)
  if (winningMove) return winningMove

  const blockingMove = chooseImmediateMove(board, candidates, otherPlayer(player))
  if (blockingMove) return blockingMove

  if (difficulty === 'medium') return rankMoves(board, candidates, player)[0]?.move ?? null
  return chooseHardMove(board, candidates, player)
}

export const AI_PLAYERS = { black: BLACK, white: WHITE } as const
