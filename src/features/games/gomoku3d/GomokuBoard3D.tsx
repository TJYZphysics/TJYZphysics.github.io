import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { AlertTriangle, MousePointer2, Orbit, ScanSearch } from 'lucide-react'
import {
  createBoardScene,
  type BoardSceneHandle,
  type PieceDisplayMode,
} from './boardScene'
import type { Coordinate } from './rules'

export interface GomokuBoard3DHandle {
  resetCamera(): void
}

interface GomokuBoard3DProps {
  board: Uint8Array
  winningLine: readonly Coordinate[]
  lastMove: Coordinate | null
  suggestion: Coordinate | null
  displayMode: PieceDisplayMode
  disabled?: boolean
  assistMode?: boolean
  status: string
  moveCount: number
  onMove: (coordinate: Coordinate) => void
}

interface PointerStart {
  x: number
  y: number
  time: number
  pointerId: number
}

export const GomokuBoard3D = forwardRef<GomokuBoard3DHandle, GomokuBoard3DProps>(
  function GomokuBoard3D(
    {
      board,
      winningLine,
      lastMove,
      suggestion,
      displayMode,
      disabled = false,
      assistMode = false,
      status,
      moveCount,
      onMove,
    },
    forwardedRef,
  ) {
    const containerRef = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<BoardSceneHandle | null>(null)
    const pointerStartRef = useRef<PointerStart | null>(null)
    const [webglAvailable, setWebglAvailable] = useState(true)

    useImperativeHandle(forwardedRef, () => ({
      resetCamera() {
        sceneRef.current?.resetCamera()
      },
    }), [])

    useEffect(() => {
      const container = containerRef.current
      if (!container) return
      const scene = createBoardScene(container, { onContextStatus: setWebglAvailable })
      sceneRef.current = scene
      setWebglAvailable(Boolean(scene))
      return () => {
        scene?.dispose()
        sceneRef.current = null
      }
    }, [])

    useEffect(() => {
      sceneRef.current?.setPosition({
        board,
        winningLine,
        lastMove,
        suggestion,
        displayMode,
        showOrientationGizmo: assistMode,
      })
    }, [assistMode, board, displayMode, lastMove, suggestion, winningLine])

    const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary) return
      pointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        pointerId: event.pointerId,
      }
      sceneRef.current?.setHover(null)
    }

    const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary || event.pointerType === 'touch') return
      if (disabled) {
        sceneRef.current?.setHover(null)
        return
      }
      const start = pointerStartRef.current
      if (start) {
        const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y)
        if (moved > 5) sceneRef.current?.setHover(null)
        return
      }
      sceneRef.current?.setHover(sceneRef.current.pick(event.clientX, event.clientY))
    }

    const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = pointerStartRef.current
      pointerStartRef.current = null
      if (!start || start.pointerId !== event.pointerId || disabled) return
      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
      const duration = performance.now() - start.time
      if (distance > 6 || duration > 650) return
      const coordinate = sceneRef.current?.pick(event.clientX, event.clientY)
      if (coordinate) onMove(coordinate)
    }

    const handlePointerCancel = () => {
      pointerStartRef.current = null
      sceneRef.current?.setHover(null)
    }

    return (
      <div
        className="gomoku3d-board"
        ref={containerRef}
        role="application"
        aria-label={`三维五子棋棋盘。左下角坐标轴随视角旋转；拖动旋转，滚轮缩放，${assistMode ? '使用辅助落子器落子。' : '点击交叉点落子。'}`}
        aria-disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={() => sceneRef.current?.setHover(null)}
      >
        <div className="gomoku3d-board__status" aria-live="polite">
          <ScanSearch aria-hidden="true" />
          <span>{status}</span>
        </div>
        <div className="gomoku3d-board__counter" aria-label={`已落 ${moveCount} 手`}>
          {String(moveCount).padStart(3, '0')} / 512
        </div>
        <div className="gomoku3d-board__hint" aria-hidden="true">
          <span><Orbit />拖动旋转</span>
          <span><MousePointer2 />{assistMode ? '辅助器落子' : '点击落子'}</span>
        </div>
        {!webglAvailable ? (
          <div className="gomoku3d-board__fallback" role="alert">
            <AlertTriangle aria-hidden="true" />
            <strong>三维棋盘暂时不可用</strong>
            <span>请启用浏览器硬件加速后刷新页面。</span>
          </div>
        ) : null}
      </div>
    )
  },
)
