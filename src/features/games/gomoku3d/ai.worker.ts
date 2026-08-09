import { chooseAiMove, type AiDifficulty } from './ai'
import type { Coordinate, Player } from './rules'

export interface AiWorkerRequest {
  id: number
  board: Uint8Array
  player: Player
  difficulty: AiDifficulty
}

export interface AiWorkerResponse {
  id: number
  move: Coordinate | null
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<AiWorkerRequest>) => void) | null
  postMessage: (message: AiWorkerResponse) => void
}

workerScope.onmessage = ({ data }) => {
  const move = chooseAiMove(data.board, data.player, data.difficulty)
  workerScope.postMessage({ id: data.id, move })
}
