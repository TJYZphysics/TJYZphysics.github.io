import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  BrainCircuit,
  Check,
  Circle,
  Crosshair,
  Eye,
  Focus,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Trophy,
  Undo2,
  UsersRound,
  X,
} from 'lucide-react'
import { chooseAiMove, type AiDifficulty } from './ai'
import type { PieceDisplayMode } from './boardScene'
import { GomokuBoard3D, type GomokuBoard3DHandle } from './GomokuBoard3D'
import {
  BLACK,
  BOARD_SIZE,
  EMPTY,
  WHITE,
  coordinatesEqual,
  createGameState,
  getCell,
  otherPlayer,
  playMove,
  undoMoves,
  type Coordinate,
  type GameState,
  type Player,
} from './rules'
import './gomoku3d.css'

type GameMode = 'local' | 'ai'

interface AiResponse {
  id: number
  move: Coordinate | null
}

function useAiEngine() {
  const workerRef = useRef<Worker | null>(null)
  const nextRequestId = useRef(1)
  const pending = useRef(new Map<number, (move: Coordinate | null) => void>())

  useEffect(() => {
    if (typeof Worker === 'undefined') return

    const worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
    const handleMessage = ({ data }: MessageEvent<AiResponse>) => {
      const resolve = pending.current.get(data.id)
      if (!resolve) return
      pending.current.delete(data.id)
      resolve(data.move)
    }
    worker.addEventListener('message', handleMessage)
    workerRef.current = worker

    return () => {
      worker.removeEventListener('message', handleMessage)
      worker.terminate()
      workerRef.current = null
      for (const resolve of pending.current.values()) resolve(null)
      pending.current.clear()
    }
  }, [])

  return useCallback((board: Uint8Array, player: Player, difficulty: AiDifficulty) => {
    const id = nextRequestId.current
    nextRequestId.current += 1

    return new Promise<Coordinate | null>((resolve) => {
      const worker = workerRef.current
      if (worker) {
        pending.current.set(id, resolve)
        worker.postMessage({ id, board: board.slice(), player, difficulty })
        return
      }

      window.setTimeout(() => resolve(chooseAiMove(board, player, difficulty)), 20)
    })
  }, [])
}

function playerName(player: Player, mode: GameMode, humanColor: Player) {
  if (mode === 'ai') return player === humanColor ? '你' : '电脑'
  return player === BLACK ? '黑方' : '白方'
}

function statusFor(game: GameState, mode: GameMode, humanColor: Player, thinking: boolean) {
  if (game.winner === 'draw') return '棋盘已满 · 平局'
  if (game.winner) return `${playerName(game.winner, mode, humanColor)}完成五连`
  if (thinking) return '电脑正在推演空间落点'
  return `${playerName(game.currentPlayer, mode, humanColor)}落子`
}

const DIFFICULTY_LABELS: Array<{ id: AiDifficulty; label: string }> = [
  { id: 'easy', label: '简单' },
  { id: 'medium', label: '中等' },
  { id: 'hard', label: '困难' },
]

const DISPLAY_LABELS: Array<{ id: PieceDisplayMode; label: string }> = [
  { id: 'both', label: '双方' },
  { id: 'black', label: '只看黑色' },
  { id: 'white', label: '只看白色' },
]

const BOARD_AXIS = Array.from({ length: BOARD_SIZE }, (_, index) => index)

export function Gomoku3DGame() {
  const [game, setGame] = useState(createGameState)
  const [mode, setMode] = useState<GameMode>('ai')
  const [humanColor, setHumanColor] = useState<Player>(BLACK)
  const [difficulty, setDifficulty] = useState<AiDifficulty>('medium')
  const [displayMode, setDisplayMode] = useState<PieceDisplayMode>('both')
  const [suggestion, setSuggestion] = useState<Coordinate | null>(null)
  const [assistMode, setAssistMode] = useState(false)
  const [assistLayer, setAssistLayer] = useState(Math.floor(BOARD_SIZE / 2) - 1)
  const [assistTarget, setAssistTarget] = useState<Coordinate | null>(null)
  const [thinking, setThinking] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const boardRef = useRef<GomokuBoard3DHandle>(null)
  const requestAiMove = useAiEngine()
  const actionVersionRef = useRef(0)

  const lastMove = game.history.at(-1) ?? null
  const blackCount = useMemo(
    () => game.history.reduce((count, move) => count + (move.player === BLACK ? 1 : 0), 0),
    [game.history],
  )
  const whiteCount = game.history.length - blackCount
  const aiPlayer = otherPlayer(humanColor)
  const humanCanMove = game.winner === null && (mode !== 'ai' || game.currentPlayer === humanColor)
  const defaultStatus = statusFor(game, mode, humanColor, thinking)
  const status = assistMode && humanCanMove
    ? assistTarget
      ? `待确认 · X${assistTarget.x + 1} Y${assistTarget.y + 1} Z${assistTarget.z + 1}`
      : `辅助落子 · Y${assistLayer + 1}`
    : defaultStatus

  const invalidatePendingActions = useCallback(() => {
    actionVersionRef.current += 1
    setThinking(false)
    setSuggesting(false)
  }, [])

  useEffect(() => {
    if (mode !== 'ai' || game.currentPlayer !== aiPlayer || game.winner !== null) return

    const version = actionVersionRef.current + 1
    actionVersionRef.current = version
    let cancelled = false
    setThinking(true)
    setSuggestion(null)

    requestAiMove(game.board, aiPlayer, difficulty).then((move) => {
      if (cancelled || version !== actionVersionRef.current) return
      if (move) {
        setGame((current) => {
          if (current.currentPlayer !== aiPlayer || current.winner !== null) return current
          return playMove(current, move)
        })
      }
      setThinking(false)
    })

    return () => {
      cancelled = true
    }
  }, [aiPlayer, difficulty, game.board, game.currentPlayer, game.winner, mode, requestAiMove])

  const handleMove = useCallback((coordinate: Coordinate) => {
    if (!humanCanMove) return
    invalidatePendingActions()
    setSuggestion(null)
    setAssistTarget(null)
    setGame((current) => playMove(current, coordinate))
  }, [humanCanMove, invalidatePendingActions])

  const handleReset = useCallback(() => {
    invalidatePendingActions()
    setSuggestion(null)
    setAssistTarget(null)
    setGame(createGameState())
  }, [invalidatePendingActions])

  const handleModeChange = (nextMode: GameMode) => {
    if (mode === nextMode) return
    invalidatePendingActions()
    setMode(nextMode)
    setSuggestion(null)
    setAssistTarget(null)
    setGame(createGameState())
  }

  const handleHumanColorChange = (nextColor: Player) => {
    if (humanColor === nextColor) return
    invalidatePendingActions()
    setHumanColor(nextColor)
    setSuggestion(null)
    setAssistTarget(null)
    setGame(createGameState())
  }

  const handleUndo = () => {
    if (game.history.length === 0) return
    invalidatePendingActions()
    setSuggestion(null)
    setAssistTarget(null)
    const lastPlayer = game.history.at(-1)?.player
    const count = mode === 'ai' && lastPlayer === aiPlayer ? 2 : 1
    setGame((current) => undoMoves(current, count))
  }

  const handleSuggestion = async () => {
    if (game.winner !== null || thinking || suggesting) return
    const version = actionVersionRef.current + 1
    actionVersionRef.current = version
    setSuggesting(true)
    setAssistTarget(null)
    const move = await requestAiMove(game.board, game.currentPlayer, 'hard')
    if (version !== actionVersionRef.current) return
    setSuggestion(move)
    setSuggesting(false)
  }

  const handleAssistToggle = () => {
    setAssistMode((current) => !current)
    setAssistTarget(null)
    setSuggestion(null)
  }

  const handleAssistLayerChange = (layer: number) => {
    setAssistLayer(layer)
    setAssistTarget(null)
  }

  const handleAssistTargetChange = (coordinate: Coordinate) => {
    if (!humanCanMove || getCell(game.board, coordinate) !== EMPTY) return
    setSuggestion(null)
    setAssistTarget(coordinate)
  }

  const handleAssistConfirm = () => {
    if (!assistMode || !assistTarget || !humanCanMove) return
    handleMove(assistTarget)
  }

  const winnerLabel = game.winner && game.winner !== 'draw'
    ? `${playerName(game.winner, mode, humanColor)}获胜`
    : '势均力敌'

  return (
    <section className="gomoku3d" aria-labelledby="gomoku3d-title">
      <header className="gomoku3d__header">
        <div className="gomoku3d__title">
          <span aria-hidden="true"><Sparkles /></span>
          <div>
            <small>SPATIAL GOMOKU · 8³</small>
            <h2 id="gomoku3d-title">三维五子</h2>
            <p>在空间的十三类连线方向中，率先完成五连。</p>
          </div>
        </div>
        <div className="gomoku3d__turn" data-player={game.currentPlayer === BLACK ? 'black' : 'white'}>
          <i aria-hidden="true" />
          <div>
            <span>当前状态</span>
            <strong>{status}</strong>
          </div>
        </div>
      </header>

      <div className="gomoku3d__workspace">
        <div className="gomoku3d__playfield">
          <GomokuBoard3D
            ref={boardRef}
            board={game.board}
            winningLine={game.winningLine}
            lastMove={lastMove}
            suggestion={assistTarget ?? suggestion}
            displayMode={displayMode}
            disabled={!humanCanMove || assistMode}
            assistMode={assistMode}
            status={status}
            moveCount={game.history.length}
            onMove={handleMove}
          />
          {game.winner !== null ? (
            <div className="gomoku3d__result" role="dialog" aria-modal="true" aria-label="对局结果">
              <Trophy aria-hidden="true" />
              <span>{game.winner === 'draw' ? 'DRAW' : 'FIVE IN SPACE'}</span>
              <strong>{winnerLabel}</strong>
              <button type="button" onClick={handleReset}>
                <RotateCcw aria-hidden="true" />
                再来一局
              </button>
            </div>
          ) : null}
        </div>

        <aside className="gomoku3d__console" aria-label="三维五子控制台">
          <fieldset className="gomoku3d__control-group">
            <legend>对战模式</legend>
            <div className="gomoku3d__segments gomoku3d__segments--two">
              <button
                type="button"
                className={mode === 'local' ? 'is-active' : ''}
                aria-pressed={mode === 'local'}
                onClick={() => handleModeChange('local')}
              >
                <UsersRound aria-hidden="true" />
                双人
              </button>
              <button
                type="button"
                className={mode === 'ai' ? 'is-active' : ''}
                aria-pressed={mode === 'ai'}
                onClick={() => handleModeChange('ai')}
              >
                <Bot aria-hidden="true" />
                人机
              </button>
            </div>
          </fieldset>

          <fieldset className="gomoku3d__control-group" disabled={mode !== 'ai'}>
            <legend><Circle aria-hidden="true" />执棋方</legend>
            <div className="gomoku3d__segments gomoku3d__segments--two">
              <button
                type="button"
                className={humanColor === BLACK ? 'is-active' : ''}
                aria-pressed={humanColor === BLACK}
                onClick={() => handleHumanColorChange(BLACK)}
              >
                <i className="gomoku3d__side-swatch gomoku3d__side-swatch--black" aria-hidden="true" />
                执黑
              </button>
              <button
                type="button"
                className={humanColor === WHITE ? 'is-active' : ''}
                aria-pressed={humanColor === WHITE}
                onClick={() => handleHumanColorChange(WHITE)}
              >
                <i className="gomoku3d__side-swatch gomoku3d__side-swatch--white" aria-hidden="true" />
                执白
              </button>
            </div>
          </fieldset>

          <fieldset className="gomoku3d__control-group" disabled={mode !== 'ai'}>
            <legend><BrainCircuit aria-hidden="true" />电脑强度</legend>
            <div className="gomoku3d__segments gomoku3d__segments--three">
              {DIFFICULTY_LABELS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={difficulty === option.id ? 'is-active' : ''}
                  aria-pressed={difficulty === option.id}
                  onClick={() => setDifficulty(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="gomoku3d__control-group">
            <legend><Eye aria-hidden="true" />棋子显示</legend>
            <div className="gomoku3d__segments gomoku3d__segments--display">
              {DISPLAY_LABELS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={displayMode === option.id ? 'is-active' : ''}
                  aria-pressed={displayMode === option.id}
                  onClick={() => setDisplayMode(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="gomoku3d__actions" aria-label="对局操作">
            <button type="button" onClick={handleUndo} disabled={game.history.length === 0}>
              <Undo2 aria-hidden="true" />
              悔棋
            </button>
            <button type="button" onClick={handleSuggestion} disabled={game.winner !== null || thinking || suggesting}>
              <Lightbulb aria-hidden="true" />
              {suggesting ? '推演中' : '建议'}
            </button>
            <button type="button" onClick={handleReset} disabled={game.history.length === 0}>
              <RotateCcw aria-hidden="true" />
              重置
            </button>
            <button type="button" onClick={() => boardRef.current?.resetCamera()} title="重置三维视角">
              <Focus aria-hidden="true" />
              视角
            </button>
            <button
              type="button"
              className="gomoku3d__assist-action"
              aria-pressed={assistMode}
              onClick={handleAssistToggle}
            >
              <Crosshair aria-hidden="true" />
              辅助落子
              <span>{assistMode ? '开启' : '关闭'}</span>
            </button>
          </div>

          {assistMode ? (
            <section className="gomoku3d__assist" aria-label="辅助落子器">
              <div className="gomoku3d__assist-heading">
                <span>Y 轴分层</span>
                <strong>Y {assistLayer + 1}</strong>
              </div>
              <div className="gomoku3d__assist-layers" role="group" aria-label="选择 Y 轴分层">
                {BOARD_AXIS.map((layer) => (
                  <button
                    key={layer}
                    type="button"
                    className={assistLayer === layer ? 'is-active' : ''}
                    aria-label={`Y 轴第 ${layer + 1} 层`}
                    aria-pressed={assistLayer === layer}
                    onClick={() => handleAssistLayerChange(layer)}
                  >
                    {layer + 1}
                  </button>
                ))}
              </div>

              <div className="gomoku3d__assist-grid" role="grid" aria-label={`Y 等于 ${assistLayer + 1} 的 X Z 平面网格`}>
                <span className="gomoku3d__assist-corner" aria-hidden="true">Z/X</span>
                {BOARD_AXIS.map((x) => (
                  <span key={`x-${x}`} className="gomoku3d__assist-axis" aria-hidden="true">{x + 1}</span>
                ))}
                {BOARD_AXIS.flatMap((z) => [
                  <span key={`z-${z}`} className="gomoku3d__assist-axis" aria-hidden="true">{z + 1}</span>,
                  ...BOARD_AXIS.map((x) => {
                    const coordinate = { x, y: assistLayer, z }
                    const cell = getCell(game.board, coordinate)
                    const selected = coordinatesEqual(assistTarget, coordinate)
                    const cellState = cell === BLACK ? '黑子' : cell === WHITE ? '白子' : '空位'
                    return (
                      <button
                        key={`${x}-${assistLayer}-${z}`}
                        type="button"
                        role="gridcell"
                        className={`gomoku3d__assist-cell${selected ? ' is-selected' : ''}`}
                        aria-label={`X ${x + 1}，Y ${assistLayer + 1}，Z ${z + 1}，${cellState}`}
                        aria-selected={selected}
                        disabled={!humanCanMove || cell !== EMPTY}
                        onClick={() => handleAssistTargetChange(coordinate)}
                      >
                        {cell !== EMPTY ? (
                          <i className={`gomoku3d__assist-stone gomoku3d__assist-stone--${cell === BLACK ? 'black' : 'white'}`} aria-hidden="true" />
                        ) : selected ? <Crosshair aria-hidden="true" /> : null}
                      </button>
                    )
                  }),
                ])}
              </div>

              <div className="gomoku3d__assist-selection" aria-live="polite">
                <span>{assistTarget ? '待确认落点' : '尚未选择落点'}</span>
                <strong>
                  {assistTarget
                    ? `X${assistTarget.x + 1} · Y${assistTarget.y + 1} · Z${assistTarget.z + 1}`
                    : '— · — · —'}
                </strong>
              </div>
              <div className="gomoku3d__assist-confirm">
                <button type="button" onClick={() => setAssistTarget(null)} disabled={!assistTarget}>
                  <X aria-hidden="true" />
                  取消
                </button>
                <button type="button" className="is-primary" onClick={handleAssistConfirm} disabled={!assistTarget || !humanCanMove}>
                  <Check aria-hidden="true" />
                  确认落子
                </button>
              </div>
            </section>
          ) : null}

          <div className="gomoku3d__readout" aria-label="棋局统计">
            <div>
              <span><Circle className="gomoku3d__stone-icon gomoku3d__stone-icon--black" />黑子</span>
              <strong>{String(blackCount).padStart(2, '0')}</strong>
            </div>
            <div>
              <span><Circle className="gomoku3d__stone-icon gomoku3d__stone-icon--white" />白子</span>
              <strong>{String(whiteCount).padStart(2, '0')}</strong>
            </div>
          </div>

          <p className="gomoku3d__note">
            旋转棋盘寻找被遮挡的交叉点；聚焦单色时，另一方会半透明显示。
          </p>
        </aside>
      </div>
    </section>
  )
}

export default Gomoku3DGame
