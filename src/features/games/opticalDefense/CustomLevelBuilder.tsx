import { useEffect, useMemo, useRef, useState } from 'react'
import { Brush, Check, Eraser, Flag, Hexagon, Play, RotateCcw, Target, Triangle } from './PixelControls'
import { CORE_SPRITE, PIXEL_INK, pixelRuns } from './pixelArt'

import {
  BOARD_HEIGHT, BOARD_WIDTH, cellCenter, cellFromPoint, cellKey, computeGrid, CUSTOM_GRID_LIMITS,
  edgePointFor, isEdgeCell, validateCustomLevel,
} from './customLevel'
import type { CustomLevelConfig, CustomGrid, GridCell } from './customLevel'
import type { OpticalColorMode } from './colorMode'

type Tool = 'brush' | 'erase' | 'entrance' | 'core'

const TOOL_META: Array<{ tool: Tool; label: string; hint: string; icon: typeof Brush }> = [
  { tool: 'brush', label: '画笔', hint: '拖拽 / 滑动连续铺设道路', icon: Brush },
  { tool: 'erase', label: '橡皮', hint: '点击移除道路格', icon: Eraser },
  { tool: 'entrance', label: '设入口', hint: '点击地图边缘设定敌人入口', icon: Flag },
  { tool: 'core', label: '设核心', hint: '点击地图边缘设定核心位置', icon: Target },
]

/** 与 customLevel.buildPath 一致的绘制顺序：入口在首、核心在尾，中间保留绘制（含自交）顺序。 */
function orderedPathCells(config: CustomLevelConfig): GridCell[] {
  const entrance = config.entranceCell
  const core = config.coreCell
  const ordered: GridCell[] = []
  if (entrance) ordered.push(entrance)
  config.pathCells.forEach((cell) => {
    if (entrance && cellKey(cell) === cellKey(entrance)) return
    if (core && cellKey(cell) === cellKey(core)) return
    ordered.push(cell)
  })
  if (core && (!ordered.length || cellKey(ordered.at(-1)!) !== cellKey(core))) ordered.push(core)
  return ordered
}

function appendBrushCell(config: CustomLevelConfig, cell: GridCell): CustomLevelConfig {
  const last = config.pathCells.at(-1)
  const cells = [...config.pathCells]
  if (!last) {
    cells.push(cell)
  } else if (cellKey(last) !== cellKey(cell)) {
    const [startColumn, startRow] = last
    const [targetColumn, targetRow] = cell
    let column = startColumn
    let row = startRow
    while (column !== targetColumn) {
      column += Math.sign(targetColumn - column)
      cells.push([column, row])
    }
    while (row !== targetRow) {
      row += Math.sign(targetRow - row)
      cells.push([column, row])
    }
  }
  return { ...config, pathCells: cells }
}

function removeCell(config: CustomLevelConfig, cell: GridCell): CustomLevelConfig {
  const key = cellKey(cell)
  const same = (candidate?: GridCell) => candidate !== undefined && cellKey(candidate) === key
  return {
    ...config,
    pathCells: config.pathCells.filter((candidate) => cellKey(candidate) !== key),
    entranceCell: same(config.entranceCell) ? undefined : config.entranceCell,
    coreCell: same(config.coreCell) ? undefined : config.coreCell,
  }
}

function drawBuilderCanvas(canvas: HTMLCanvasElement | null, config: CustomLevelConfig, grid: CustomGrid) {
  const ctx = canvas?.getContext('2d')
  if (!ctx) return
  const { cellSize: cs, columns, rows, originX, originY } = grid
  const half = cs / 2
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
  ctx.fillStyle = '#0b0b0b'
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
  ctx.fillStyle = '#141414'
  ctx.fillRect(originX, originY, columns * cs, rows * cs)
  ctx.fillStyle = '#333333'
  for (let column = 0; column <= columns; column++) for (let row = 0; row <= rows; row++) {
    ctx.fillRect(Math.round(originX + column * cs), Math.round(originY + row * cs), 2, 2)
  }

  const routeSet = new Set(config.pathCells.map(cellKey))
  ctx.fillStyle = '#292929'
  routeSet.forEach((key) => {
    const point = cellCenter(grid, key.split(':').map(Number) as unknown as GridCell)
    ctx.fillRect(point.x - half, point.y - half, cs, cs)
  })
  const fillEdgeStrip = (cell: GridCell) => {
    const point = cellCenter(grid, cell)
    ctx.fillStyle = '#292929'
    if (cell[0] === 0) ctx.fillRect(0, point.y - half, originX, cs)
    else if (cell[0] === columns - 1) ctx.fillRect(originX + columns * cs, point.y - half, BOARD_WIDTH - originX - columns * cs, cs)
    else if (cell[1] === 0) ctx.fillRect(point.x - half, 0, cs, originY)
    else ctx.fillRect(point.x - half, originY + rows * cs, cs, BOARD_HEIGHT - originY - rows * cs)
  }
  if (config.entranceCell) fillEdgeStrip(config.entranceCell)
  if (config.coreCell) fillEdgeStrip(config.coreCell)

  const polyline = orderedPathCells(config)
  if (polyline.length >= 2) {
    ctx.strokeStyle = '#777777'
    ctx.lineWidth = 2
    ctx.lineJoin = 'miter'
    ctx.setLineDash([3, 14])
    ctx.beginPath()
    polyline.forEach((cell, index) => {
      const point = cellCenter(grid, cell)
      if (index === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
    ctx.stroke()
    ctx.setLineDash([])
  }

  const bracket = (x: number, y: number, radius: number, color: string) => {
    ctx.fillStyle = color
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const px = Math.round(x + sx * radius)
      const py = Math.round(y + sy * radius)
      ctx.fillRect(px - (sx > 0 ? 3 : 0), py, 5, 2)
      ctx.fillRect(px, py - (sy > 0 ? 3 : 0), 2, 5)
    }
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const cell: GridCell = [column, row]
    if (routeSet.has(cellKey(cell))) continue
    const point = cellCenter(grid, cell)
    bracket(point.x, point.y, Math.min(25, cs * 0.3), '#3b3b3b')
    ctx.fillStyle = '#444444'
    ctx.fillRect(Math.round(point.x) - 2, Math.round(point.y) - 2, 4, 4)
  }
  if (config.entranceCell) {
    const point = cellCenter(grid, config.entranceCell)
    const edge = edgePointFor(grid, config.entranceCell)
    bracket(point.x, point.y, Math.min(25, half - 5), '#eeeeee')
    const dx = Math.sign(point.x - edge.x)
    const dy = Math.sign(point.y - edge.y)
    ctx.fillStyle = '#eeeeee'
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) {
      const x = edge.x + dx * (10 + i * 10 + k * 3)
      const y = edge.y + dy * (10 + i * 10 + k * 3)
      ctx.fillRect(Math.round(x - dy * (k - 1) * 3), Math.round(y + dx * (k - 1) * 3), 3, 3)
      ctx.fillRect(Math.round(x + dy * (k - 1) * 3), Math.round(y - dx * (k - 1) * 3), 3, 3)
    }
    ctx.font = '10px Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('IN', point.x, point.y + Math.min(half - 4, 28))
  }
  if (config.coreCell) {
    const point = cellCenter(grid, config.coreCell)
    const unit = cs >= 65 ? 3 : cs > 38 ? 2 : 1
    pixelRuns(CORE_SPRITE).forEach(({ x, y, width, ink }) => {
      ctx.fillStyle = ink === 'c' ? '#ffffff' : PIXEL_INK[ink as keyof typeof PIXEL_INK]
      ctx.fillRect(Math.round(point.x) + (x - 8) * unit, Math.round(point.y) + (y - 8) * unit, width * unit, unit)
    })
  }
}
export function CustomLevelBuilder({ config, colorMode, onChange, onStart }: {
  config: CustomLevelConfig
  colorMode: OpticalColorMode
  onChange: (next: CustomLevelConfig) => void
  onStart: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const latestConfigRef = useRef(config)
  const [tool, setTool] = useState<Tool>('brush')
  const grid = useMemo(() => computeGrid(config.columns, config.rows), [config.columns, config.rows])
  const error = validateCustomLevel(config)

  // 拖拽过程中保持每次指针事件都基于最新配置，避免快速划过时丢失中间格。
  useEffect(() => { latestConfigRef.current = config }, [config])

  useEffect(() => {
    drawBuilderCanvas(canvasRef.current, config, grid)
  }, [colorMode, config, grid])

  const toCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) * BOARD_WIDTH / rect.width
    const y = (event.clientY - rect.top) * BOARD_HEIGHT / rect.height
    return { x, y }
  }

  const applyCell = (cell: GridCell | null, isPointerUp: boolean) => {
    if (!cell) return
    const latest = latestConfigRef.current
    if (tool === 'brush') {
      const next = appendBrushCell(latest, cell)
      let entrance = next.entranceCell
      let core = next.coreCell
      if (!entrance && isEdgeCell(next.pathCells[0], grid.columns, grid.rows)) entrance = next.pathCells[0]
      if (isPointerUp && !core && next.pathCells.length > 1) {
        const last = next.pathCells.at(-1)
        if (last && isEdgeCell(last, grid.columns, grid.rows) && (!entrance || cellKey(last) !== cellKey(entrance))) core = last
      }
      const result = entrance !== next.entranceCell || core !== next.coreCell
        ? { ...next, entranceCell: entrance, coreCell: core }
        : next
      latestConfigRef.current = result
      onChange(result)
      return
    }
    if (tool === 'erase') {
      const result = removeCell(latest, cell)
      latestConfigRef.current = result
      onChange(result)
      return
    }
    if (tool === 'entrance') {
      if (!isEdgeCell(cell, grid.columns, grid.rows)) return
      const result = { ...latest, entranceCell: cell }
      latestConfigRef.current = result
      onChange(result)
      return
    }
    if (tool === 'core') {
      if (!isEdgeCell(cell, grid.columns, grid.rows)) return
      const result = { ...latest, coreCell: cell }
      latestConfigRef.current = result
      onChange(result)
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    drawingRef.current = true
    const point = toCanvasPoint(event)
    applyCell(point ? cellFromPoint(grid, point.x, point.y) : null, false)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || tool !== 'brush') return
    event.preventDefault()
    const point = toCanvasPoint(event)
    applyCell(point ? cellFromPoint(grid, point.x, point.y) : null, false)
  }

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const point = toCanvasPoint(event)
    applyCell(point ? cellFromPoint(grid, point.x, point.y) : null, true)
  }

  const setMapSize = (partial: { columns?: number; rows?: number }) => {
    const columns = Math.max(CUSTOM_GRID_LIMITS.columns.min, Math.min(CUSTOM_GRID_LIMITS.columns.max, partial.columns ?? config.columns))
    const rows = Math.max(CUSTOM_GRID_LIMITS.rows.min, Math.min(CUSTOM_GRID_LIMITS.rows.max, partial.rows ?? config.rows))
    if (columns === config.columns && rows === config.rows) return
    onChange({ ...config, columns, rows, pathCells: [], entranceCell: undefined, coreCell: undefined })
  }

  const routeCellCount = new Set(config.pathCells.map(cellKey)).size

  return (
    <section className="optical-defense__builder" aria-label="第二十关关卡构建">
      <div className="optical-defense__builder-head">
        <div className="optical-defense__builder-title">
          <Hexagon aria-hidden="true" /><span><strong>第二十关 · 自由实验</strong><small>绘制路径并指定出入口，全部参数可在控制台调整</small></span>
        </div>
        <div className="optical-defense__builder-size">
          <label><span>宽</span>
            <button type="button" aria-label="减小地图宽度" onClick={() => setMapSize({ columns: config.columns - 1 })}><span aria-hidden="true">−</span></button>
            <input type="number" min={CUSTOM_GRID_LIMITS.columns.min} max={CUSTOM_GRID_LIMITS.columns.max} value={config.columns}
              aria-label="地图宽度（列数）" onChange={(event) => setMapSize({ columns: Number(event.target.value) })} />
            <button type="button" aria-label="增大地图宽度" onClick={() => setMapSize({ columns: config.columns + 1 })}><span aria-hidden="true">+</span></button>
          </label>
          <label><span>高</span>
            <button type="button" aria-label="减小地图高度" onClick={() => setMapSize({ rows: config.rows - 1 })}><span aria-hidden="true">−</span></button>
            <input type="number" min={CUSTOM_GRID_LIMITS.rows.min} max={CUSTOM_GRID_LIMITS.rows.max} value={config.rows}
              aria-label="地图高度（行数）" onChange={(event) => setMapSize({ rows: Number(event.target.value) })} />
            <button type="button" aria-label="增大地图高度" onClick={() => setMapSize({ rows: config.rows + 1 })}><span aria-hidden="true">+</span></button>
          </label>
        </div>
      </div>

      <div className="optical-defense__builder-body">
        <div className="optical-defense__builder-canvas-shell">
          <canvas
            ref={canvasRef}
            width={BOARD_WIDTH}
            height={BOARD_HEIGHT}
            data-testid="custom-level-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => { drawingRef.current = false }}
          />
          <div className="optical-defense__builder-hint">
            <span className="is-road"><i />道路</span>
            <span className="is-entrance"><i />入口</span>
            <span className="is-core"><i />核心</span>
            <span className="is-hole"><i />安装孔</span>
          </div>
        </div>

        <aside className="optical-defense__builder-panel">
          <h3>工具</h3>
          <div className="optical-defense__builder-tools">
            {TOOL_META.map(({ tool: item, label, hint, icon: Icon }) => (
              <button key={item} type="button" className={tool === item ? 'is-active' : ''} aria-pressed={tool === item}
                onClick={() => setTool(item)} title={hint} data-testid={`builder-tool-${item}`}>
                <Icon aria-hidden="true" /><span>{label}</span><small>{hint}</small>
              </button>
            ))}
            <button type="button" className="is-clear" onClick={() => onChange({ ...config, pathCells: [], entranceCell: undefined, coreCell: undefined })}>
              <RotateCcw aria-hidden="true" /><span>清空路径</span><small>删除全部道路格</small>
            </button>
          </div>

          <dl className="optical-defense__builder-stats">
            <div><dt>地图尺寸</dt><dd>{config.columns}×{config.rows}</dd></div>
            <div><dt>路径格子</dt><dd>{routeCellCount} 格</dd></div>
            <div><dt>入口</dt><dd>{config.entranceCell ? `${config.entranceCell[0]},${config.entranceCell[1]}` : '未指定'}</dd></div>
            <div><dt>核心</dt><dd>{config.coreCell ? `${config.coreCell[0]},${config.coreCell[1]}` : '未指定'}</dd></div>
            <div><dt>波次</dt><dd>{config.waves.length} 波</dd></div>
          </dl>

          <output className={`optical-defense__builder-error${error ? '' : ' is-valid'}`} role="status">
            {error ? <><Triangle aria-hidden="true" />{error}</> : <><Check aria-hidden="true" />构建就绪，可进入实验台</>}
          </output>

          <button className="optical-defense__builder-start" type="button" disabled={Boolean(error)} onClick={onStart} data-testid="custom-level-start">
            <Play aria-hidden="true" />进入实验台
          </button>
        </aside>
      </div>
    </section>
  )
}
