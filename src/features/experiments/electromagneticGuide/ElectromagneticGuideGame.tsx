import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Atom, ChevronLeft, ChevronRight, CircleMinus, CirclePlus, Eraser, FlipHorizontal2,
  Gauge, Grid3X3, Magnet, Pause, Play, RotateCw, Sparkles, Trash2, Undo2, Zap,
  ZoomIn, ZoomOut,
} from 'lucide-react'

import './electromagneticGuide.css'
import { ELECTROMAGNETIC_LEVELS } from './levels'
import { createSimulation, simulateLevel, stepSimulation } from './physics'

type ToolKind = 'positive-charge' | 'negative-charge' | 'electric-field' | 'magnetic-field' | 'velocity-selector'
type Point = { x: number; y: number }
type Placement = {
  id: string
  kind: ToolKind
  position: Point
  size?: Point
  rotation?: number
  strength?: number
  direction?: 1 | -1
  charge?: number
  selectorSpeed?: number
}

type PointerGesture = {
  mode: 'idle' | 'pending' | 'pan' | 'move'
  pointerId: number | null
  start: Point
  camera: Point
  itemId?: string
  itemPosition?: Point
  before?: Placement[]
  moved: boolean
  historySaved: boolean
}

const TOOLS: Array<{ kind: ToolKind; name: string; hint: string; icon: typeof Atom }> = [
  { kind: 'positive-charge', name: '正电荷', hint: '排斥正粒子，吸引负粒子', icon: CirclePlus },
  { kind: 'negative-charge', name: '负电荷', hint: '吸引正粒子，排斥负粒子', icon: CircleMinus },
  { kind: 'electric-field', name: '匀强电场', hint: '在区域内持续改变速度', icon: Zap },
  { kind: 'magnetic-field', name: '匀强磁场', hint: '洛伦兹力使轨迹弯曲', icon: Magnet },
  { kind: 'velocity-selector', name: '速度选择器', hint: '正交电磁场筛选速度', icon: Gauge },
]

const DIFFICULTY = { beginner: '初级', intermediate: '中级', advanced: '高级', expert: '专家', sandbox: '自由' } as Record<string, string>
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function toolLimit(level: any, kind: ToolKind) {
  const limits = level.placementLimits ?? {}
  const value = limits[kind]
  return typeof value === 'number' ? value : level.world?.kind === 'infinite' ? Infinity : 0
}

function newPlacement(level: any, kind: ToolKind, position: Point): Placement {
  const regional = kind === 'electric-field' || kind === 'magnetic-field' || kind === 'velocity-selector'
  const template = (level.referenceSolution ?? []).find((item: Placement) => item.kind === kind) as Placement | undefined
  const strength = Math.abs(template?.strength ?? 1)
  return {
    id: `placed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    position,
    ...(regional ? { size: { ...(template?.size ?? { x: 3.2, y: 2.2 }) }, rotation: 0, strength, direction: 1 as const } : {}),
    ...(kind === 'velocity-selector' ? { selectorSpeed: template?.selectorSpeed ?? 4 } : {}),
    ...(kind === 'positive-charge' ? { charge: strength, strength } : {}),
    ...(kind === 'negative-charge' ? { charge: -strength, strength } : {}),
  }
}

function snapPoint(point: Point): Point {
  return { x: Math.round(point.x * 2) / 2, y: Math.round(point.y * 2) / 2 }
}

function hitPlacement(point: Point, placements: readonly Placement[]): Placement | undefined {
  return [...placements].reverse().find((item) => {
    const dx = point.x - item.position.x
    const dy = point.y - item.position.y
    if (item.kind === 'positive-charge' || item.kind === 'negative-charge') return Math.hypot(dx, dy) <= .48
    const angle = -(item.rotation ?? 0)
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const local = { x: dx * c - dy * s, y: dx * s + dy * c }
    const size = item.size ?? { x: 3.2, y: 2.2 }
    return Math.abs(local.x) <= size.x / 2 && Math.abs(local.y) <= size.y / 2
  })
}

function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - 7 * Math.cos(angle - .45), to.y - 7 * Math.sin(angle - .45))
  ctx.lineTo(to.x - 7 * Math.cos(angle + .45), to.y - 7 * Math.sin(angle + .45)); ctx.closePath(); ctx.fill()
}

function drawElectricPattern(ctx: CanvasRenderingContext2D, w: number, h: number, grid: number, color: string, direction: 1 | -1, vertical = false) {
  const step = clamp(grid * .82, 20, 38)
  const arrow = clamp(grid * .42, 10, 19) * direction
  ctx.globalAlpha = .72
  for (let y = -h / 2 + step / 2; y < h / 2; y += step) {
    for (let x = -w / 2 + step / 2; x < w / 2; x += step) {
      if (vertical) drawArrow(ctx, { x, y: y - arrow / 2 }, { x, y: y + arrow / 2 }, color)
      else drawArrow(ctx, { x: x - arrow / 2, y }, { x: x + arrow / 2, y }, color)
    }
  }
  ctx.globalAlpha = 1
}

function drawMagneticPattern(ctx: CanvasRenderingContext2D, w: number, h: number, grid: number, color: string, direction: 1 | -1) {
  const step = clamp(grid * .74, 18, 34)
  const radius = clamp(grid * .1, 2.5, 5)
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.6; ctx.globalAlpha = .78
  for (let y = -h / 2 + step / 2; y < h / 2; y += step) {
    for (let x = -w / 2 + step / 2; x < w / 2; x += step) {
      if (direction === 1) {
        ctx.beginPath(); ctx.arc(x, y, radius * 1.65, 0, Math.PI * 2); ctx.stroke()
        ctx.beginPath(); ctx.arc(x, y, radius * .55, 0, Math.PI * 2); ctx.fill()
      } else {
        ctx.beginPath(); ctx.moveTo(x - radius, y - radius); ctx.lineTo(x + radius, y + radius); ctx.moveTo(x + radius, y - radius); ctx.lineTo(x - radius, y + radius); ctx.stroke()
      }
    }
  }
  ctx.globalAlpha = 1
}

function drawEmitter(ctx: CanvasRenderingContext2D, point: Point, velocity: Point, grid: number, color: string) {
  const angle = Math.atan2(velocity.y, velocity.x)
  ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(angle)
  const length = clamp(grid * .9, 25, 48); const height = clamp(grid * .42, 14, 24)
  const metal = ctx.createLinearGradient(-length, -height / 2, -length, height / 2)
  metal.addColorStop(0, '#d9edf5'); metal.addColorStop(.22, '#5f7887'); metal.addColorStop(.55, '#172b37'); metal.addColorStop(.82, '#6f8998'); metal.addColorStop(1, '#d4e6ed')
  ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.fillStyle = metal; ctx.strokeStyle = 'rgba(220,244,255,.72)'; ctx.lineWidth = 1
  ctx.fillRect(-length, -height / 2, length * .72, height); ctx.strokeRect(-length, -height / 2, length * .72, height)
  ctx.shadowBlur = 0; ctx.fillStyle = '#0b1720'; ctx.fillRect(-length * .28, -height * .34, length * .32, height * .68)
  ctx.strokeStyle = '#9cb8c5'; ctx.strokeRect(-length * .28, -height * .34, length * .32, height * .68)
  ctx.fillStyle = color; ctx.globalAlpha = .22; ctx.fillRect(-length * .22, -height * .2, length * .24, height * .4); ctx.globalAlpha = 1
  for (let x = -length * .88; x < -length * .34; x += length * .15) { ctx.strokeStyle = 'rgba(224,245,255,.35)'; ctx.beginPath(); ctx.moveTo(x, -height / 2); ctx.lineTo(x, height / 2); ctx.stroke() }
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(0, 0, clamp(grid * .09, 3, 6), 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

export function ElectromagneticGuideGame() {
  const [levelIndex, setLevelIndex] = useState(0)
  const [selectedTool, setSelectedTool] = useState<ToolKind>('positive-charge')
  const [placements, setPlacements] = useState<Placement[]>([])
  const [history, setHistory] = useState<Placement[][]>([])
  const [simulation, setSimulation] = useState<any>(null)
  const [progress, setProgress] = useState(1)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('选择一种场源，再点击画布完成布置。')
  const [zoom, setZoom] = useState(1)
  const [camera, setCamera] = useState<Point>({ x: 0, y: 0 })
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null)
  const [gestureMode, setGestureMode] = useState<PointerGesture['mode']>('idle')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<PointerGesture>({ mode: 'idle', pointerId: null, start: { x: 0, y: 0 }, camera: { x: 0, y: 0 }, moved: false, historySaved: false })
  const level = ELECTROMAGNETIC_LEVELS[levelIndex] as any
  const isSandbox = level.world?.kind === 'infinite' || levelIndex === ELECTROMAGNETIC_LEVELS.length - 1
  const world = level.world?.kind === 'finite' ? level.world : level.world?.initialViewport ?? { width: 20, height: 12 }
  const fixed = (level.fixedPlacements ?? []) as Placement[]
  const allPlacements = useMemo(() => [...fixed, ...placements], [fixed, placements])
  const selectedPlacement = useMemo(() => placements.find((item) => item.id === selectedPlacementId) ?? null, [placements, selectedPlacementId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !isSandbox) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      setZoom((value) => clamp(value * (event.deltaY > 0 ? .9 : 1.1), .35, 3.5))
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [isSandbox])

  const used = useMemo(() => placements.reduce((map, item) => {
    map[item.kind] = (map[item.kind] ?? 0) + 1
    return map
  }, {} as Partial<Record<ToolKind, number>>), [placements])

  const selectLevel = useCallback((index: number) => {
    if (index < 0 || index >= ELECTROMAGNETIC_LEVELS.length) return
    setLevelIndex(index); setPlacements([]); setHistory([]); setSimulation(null); setRunning(false)
    setProgress(1); setZoom(1); setCamera({ x: 0, y: 0 }); setSelectedPlacementId(null); setGestureMode('idle')
    const next = ELECTROMAGNETIC_LEVELS[index] as any
    const first = TOOLS.find(({ kind }) => (next.availableTools ?? []).includes(kind))?.kind ?? 'positive-charge'
    setSelectedTool(first)
    setMessage(index === ELECTROMAGNETIC_LEVELS.length - 1 ? '自由实验室已开启：拖动画布探索无限空间。' : '关卡已就绪。观察粒子参数与目标出口，然后开始布置。')
  }, [])

  useEffect(() => {
    if (!running) return
    let frame = 0
    let previous: number | null = null
    const tick = (now: number) => {
      if (previous === null) {
        previous = now
        frame = requestAnimationFrame(tick)
        return
      }
      const elapsed = now - previous; previous = now
      if (!Number.isFinite(elapsed) || elapsed <= 0) {
        frame = requestAnimationFrame(tick)
        return
      }
      const dt = Math.min(40, elapsed)
      if (isSandbox) {
        setSimulation((current: any) => stepSimulation(current ?? createSimulation(level), level, dt / 1000, placements as any))
        frame = requestAnimationFrame(tick)
        return
      }
      setProgress((value) => {
        const next = Math.min(1, value + dt / 3600)
        if (next >= 1) setRunning(false)
        return next
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isSandbox, level, placements, running])

  const run = () => {
    if (isSandbox) {
      if (simulation) setRunning((value) => !value)
      else {
        setSimulation(createSimulation(level)); setProgress(1); setRunning(true)
        setMessage('粒子正在持续运动；可随时暂停、拖动画布或调整观察范围。')
      }
      return
    }
    if (simulation && progress < 1) { setRunning((value) => !value); return }
    try {
      const result = simulateLevel(level, placements as any)
      setSimulation(result); setProgress(0); setRunning(true)
      const states = result?.particles ?? result?.particleStates ?? []
      const collected = states.filter((particle: any) => particle.status === 'collected').length
      const failureNames: Record<string, string> = { crashed: '撞到障碍或错误出口', escaped: '飞出实验边界', 'timed-out': '未在时限内抵达出口', active: '仍在运动' }
      const failure = states.find((particle: any) => particle.status !== 'collected')
      const failureText = failure
        ? `${failure.label ?? failure.id}：${failureNames[failure.status] ?? '未完成'}（x=${failure.position.x.toFixed(1)}, y=${failure.position.y.toFixed(1)}）`
        : '轨迹未完成。'
      setMessage(isSandbox ? '轨迹已生成。你可以继续添加场源，反复观察粒子运动。' : collected === states.length && states.length ? '全部粒子进入正确收集器，实验完成！' : failureText)
    } catch (error) {
      console.error(error)
      setMessage('当前布置无法发射，请检查场源是否与障碍重叠。')
    }
  }

  const commit = (next: Placement[], text: string) => {
    setHistory((items) => [...items, placements]); setPlacements(next); setSimulation(null); setRunning(false); setProgress(1); setMessage(text)
  }

  const loadReference = () => {
    const reference = (level.referenceSolution ?? []) as Placement[]
    if (!reference.length) { setMessage('本关不提供参考布置——尝试从受力方向开始推理。'); return }
    commit(reference.map((item, index) => ({ ...item, id: `reference-${index}` })), '已加载参考布置。点击“发射”观察它为什么有效。')
  }

  const dimensions = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr)
    }
    const baseScale = Math.min(rect.width / world.width, rect.height / world.height) * .9
    const scale = baseScale * zoom
    const origin = { x: rect.width / 2 - world.width * scale / 2 + camera.x, y: rect.height / 2 - world.height * scale / 2 + camera.y }
    return { rect, dpr, scale, origin }
  }, [camera, world.height, world.width, zoom])

  const toScreen = useCallback((point: Point, view: NonNullable<ReturnType<typeof dimensions>>) => ({ x: view.origin.x + point.x * view.scale, y: view.origin.y + point.y * view.scale }), [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const view = dimensions()
    if (!canvas || !ctx || !view) return
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); ctx.clearRect(0, 0, view.rect.width, view.rect.height)
    const grid = view.scale
    ctx.fillStyle = '#07101a'; ctx.fillRect(0, 0, view.rect.width, view.rect.height)
    ctx.strokeStyle = 'rgba(115, 204, 229, .10)'; ctx.lineWidth = 1
    const minX = isSandbox ? Math.floor((-view.origin.x) / grid) : 0
    const maxX = isSandbox ? Math.ceil((view.rect.width - view.origin.x) / grid) : world.width
    const minY = isSandbox ? Math.floor((-view.origin.y) / grid) : 0
    const maxY = isSandbox ? Math.ceil((view.rect.height - view.origin.y) / grid) : world.height
    ctx.beginPath()
    for (let x = minX; x <= maxX; x++) { const sx = view.origin.x + x * grid; ctx.moveTo(sx, 0); ctx.lineTo(sx, view.rect.height) }
    for (let y = minY; y <= maxY; y++) { const sy = view.origin.y + y * grid; ctx.moveTo(0, sy); ctx.lineTo(view.rect.width, sy) }
    ctx.stroke()
    if (!isSandbox) { ctx.strokeStyle = 'rgba(115,204,229,.35)'; ctx.strokeRect(view.origin.x, view.origin.y, world.width * grid, world.height * grid) }

    for (const obstacle of level.obstacles ?? []) {
      const p = toScreen(obstacle.position, view); ctx.save(); ctx.strokeStyle = 'rgba(255, 145, 145, .86)'; ctx.lineWidth = 1.5; ctx.shadowColor = 'rgba(225,72,80,.55)'; ctx.shadowBlur = 12
      const hazard = ctx.createLinearGradient(p.x - grid, p.y - grid, p.x + grid, p.y + grid); hazard.addColorStop(0, '#712e38'); hazard.addColorStop(.48, '#2a1a23'); hazard.addColorStop(1, '#8d3940'); ctx.fillStyle = hazard
      if (obstacle.shape === 'circle') {
        const radius = obstacle.radius * grid; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0
        ctx.strokeStyle = 'rgba(255,205,165,.38)'; ctx.beginPath(); ctx.arc(p.x - radius * .14, p.y - radius * .14, radius * .68, Math.PI * 1.05, Math.PI * 1.72); ctx.stroke()
        ctx.fillStyle = '#130d12'; ctx.beginPath(); ctx.arc(p.x, p.y, radius * .24, 0, Math.PI * 2); ctx.fill()
      } else {
        const size = obstacle.size; const x = p.x - size.x * grid / 2; const y = p.y - size.y * grid / 2; const w = size.x * grid; const h = size.y * grid
        ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); ctx.shadowBlur = 0; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.strokeStyle = 'rgba(255,190,125,.28)'; ctx.lineWidth = clamp(grid * .12, 4, 8)
        for (let stripe = x - h; stripe < x + w + h; stripe += clamp(grid * .45, 14, 24)) { ctx.beginPath(); ctx.moveTo(stripe, y + h); ctx.lineTo(stripe + h, y); ctx.stroke() }
        ctx.restore(); ctx.fillStyle = '#c76c6f'; for (const bx of [x + 5, x + w - 5]) for (const by of [y + 5, y + h - 5]) { ctx.beginPath(); ctx.arc(bx, by, 1.8, 0, Math.PI * 2); ctx.fill() }
      }
      ctx.restore()
    }
    for (const particle of level.particles ?? []) {
      const start = toScreen(particle.startPosition, view)
      drawEmitter(ctx, start, particle.startVelocity, grid, particle.color ?? '#70e7ff')
    }
    for (const collector of level.collectors ?? []) {
      const p = toScreen(collector.position, view); const radius = collector.radius * grid
      ctx.save(); ctx.shadowColor = '#68f0b0'; ctx.shadowBlur = 18; const glass = ctx.createRadialGradient(p.x - radius * .25, p.y - radius * .3, radius * .08, p.x, p.y, radius)
      glass.addColorStop(0, 'rgba(190,255,222,.28)'); glass.addColorStop(.48, 'rgba(47,203,139,.12)'); glass.addColorStop(1, 'rgba(3,33,31,.72)'); ctx.fillStyle = glass; ctx.strokeStyle = '#68f0b0'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgba(190,255,222,.42)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, radius * .72, 0, Math.PI * 2); ctx.stroke()
      for (let tick = 0; tick < 12; tick++) { const angle = tick * Math.PI / 6; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(angle) * radius * .82, p.y + Math.sin(angle) * radius * .82); ctx.lineTo(p.x + Math.cos(angle) * radius, p.y + Math.sin(angle) * radius); ctx.stroke() }
      ctx.fillStyle = '#b9ffda'; ctx.font = '600 11px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText(collector.label ?? '收集器', p.x, p.y + 4); ctx.restore()
    }
    for (const item of allPlacements) {
      const p = toScreen(item.position, view); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(item.rotation ?? 0)
      if (item.kind === 'positive-charge' || item.kind === 'negative-charge') {
        const positive = item.kind === 'positive-charge'; ctx.shadowColor = positive ? '#ffb25b' : '#62c8ff'; ctx.shadowBlur = 14
        ctx.fillStyle = positive ? '#ef8d35' : '#258ac2'; ctx.beginPath(); ctx.arc(0, 0, clamp(grid * .25, 8, 15), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
        ctx.fillStyle = '#fff'; ctx.font = `700 ${clamp(grid * .3, 11, 17)}px Segoe UI`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(positive ? '+' : '−', 0, -1)
      } else {
        const size = item.size ?? { x: 3.2, y: 2.2 }; const w = size.x * grid; const h = size.y * grid
        const color = item.kind === 'electric-field' ? '#ffc866' : item.kind === 'magnetic-field' ? '#75a7ff' : '#d58cff'
        const fieldFill = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); fieldFill.addColorStop(0, `${color}2b`); fieldFill.addColorStop(.5, `${color}12`); fieldFill.addColorStop(1, `${color}28`)
        ctx.fillStyle = fieldFill; ctx.strokeStyle = color; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.setLineDash([])
        if (item.kind === 'magnetic-field') {
          drawMagneticPattern(ctx, w, h, grid, color, item.direction ?? 1)
        } else if (item.kind === 'velocity-selector') {
          drawMagneticPattern(ctx, w, h, grid, color, item.direction ?? 1)
          drawElectricPattern(ctx, w, h, grid, '#ffc866', item.direction ?? 1, true)
        } else drawElectricPattern(ctx, w, h, grid, color, item.direction ?? 1)
      }
      if (item.id === selectedPlacementId) {
        ctx.shadowBlur = 0; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3])
        if (item.kind === 'positive-charge' || item.kind === 'negative-charge') {
          ctx.beginPath(); ctx.arc(0, 0, clamp(grid * .36, 13, 21), 0, Math.PI * 2); ctx.stroke()
        } else {
          const size = item.size ?? { x: 3.2, y: 2.2 }
          ctx.strokeRect(-size.x * grid / 2 - 4, -size.y * grid / 2 - 4, size.x * grid + 8, size.y * grid + 8)
        }
        ctx.setLineDash([])
      }
      ctx.restore()
    }
    const states = simulation?.particles ?? simulation?.particleStates ?? []
    for (const particle of states.length ? states : level.particles ?? []) {
      const path: Point[] = particle.path ?? [particle.startPosition ?? particle.position]
      const visible = Math.max(1, Math.ceil(path.length * (isSandbox ? 1 : progress))); const segment = path.slice(0, visible)
      if (segment.length > 1) { ctx.beginPath(); segment.forEach((point, index) => { const p = toScreen(point, view); index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y) }); ctx.strokeStyle = particle.color ?? '#fff'; ctx.lineWidth = 2.2; ctx.shadowColor = particle.color ?? '#fff'; ctx.shadowBlur = 7; ctx.stroke(); ctx.shadowBlur = 0 }
      const current = segment.at(-1) ?? particle.startPosition ?? particle.position
      if (!current) continue
      const p = toScreen(current, view); ctx.fillStyle = particle.color ?? '#fff'; ctx.shadowColor = particle.color ?? '#fff'; ctx.shadowBlur = 13; ctx.beginPath(); ctx.arc(p.x, p.y, clamp((particle.radius ?? .14) * grid, 4, 9), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
      ctx.fillStyle = '#fff'; ctx.font = '700 9px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText(particle.charge > 0 ? '+' : particle.charge < 0 ? '−' : '0', p.x, p.y + 3)
    }
  }, [allPlacements, dimensions, isSandbox, level, progress, selectedPlacementId, simulation, toScreen, world.height, world.width])

  const pointerToWorld = (event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const view = dimensions(); if (!view) return null
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left - view.origin.x) / view.scale, y: (event.clientY - rect.top - view.origin.y) / view.scale }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (isSandbox && (event.button === 1 || event.button === 2 || event.shiftKey)) {
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { mode: 'pan', pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, camera, moved: false, historySaved: false }
      setGestureMode('pan'); return
    }
    if (event.button !== 0) return
    const point = pointerToWorld(event); if (!point) return
    const hit = hitPlacement(point, placements)
    event.currentTarget.setPointerCapture(event.pointerId)
    if (hit) {
      setSelectedPlacementId(hit.id)
      dragRef.current = { mode: 'move', pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, camera, itemId: hit.id, itemPosition: hit.position, before: placements, moved: false, historySaved: false }
      setGestureMode('move'); return
    }
    setSelectedPlacementId(null)
    dragRef.current = { mode: 'pending', pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, camera, moved: false, historySaved: false }
    setGestureMode('pending')
  }
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (drag.mode === 'idle') return
    const dx = event.clientX - drag.start.x
    const dy = event.clientY - drag.start.y
    const crossedThreshold = Math.hypot(dx, dy) > 4
    if (drag.mode === 'pending' && isSandbox && crossedThreshold) {
      drag.mode = 'pan'; drag.moved = true; setGestureMode('pan')
    }
    if (drag.mode === 'pan') {
      if (crossedThreshold) drag.moved = true
      setCamera({ x: drag.camera.x + dx, y: drag.camera.y + dy })
      return
    }
    if (drag.mode !== 'move' || !drag.itemId || !drag.itemPosition) return
    const view = dimensions(); if (!view) return
    let next = snapPoint({ x: drag.itemPosition.x + dx / view.scale, y: drag.itemPosition.y + dy / view.scale })
    if (!isSandbox) next = { x: clamp(next.x, 0, world.width), y: clamp(next.y, 0, world.height) }
    const current = placements.find((item) => item.id === drag.itemId)?.position
    if (current && next.x === current.x && next.y === current.y) return
    if (!drag.historySaved && drag.before) {
      setHistory((items) => [...items, drag.before!]); drag.historySaved = true
    }
    drag.moved = true
    setPlacements((items) => items.map((item) => item.id === drag.itemId ? { ...item, position: next } : item))
    setSimulation(null); setRunning(false); setProgress(1)
  }
  const stopDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (drag.mode === 'pending' && !drag.moved) {
      const point = pointerToWorld(event)
      if (point) {
        if (!isSandbox && (point.x < 0 || point.y < 0 || point.x > world.width || point.y > world.height)) setMessage('请在实验边界内放置场源。')
        else {
          const limit = toolLimit(level, selectedTool)
          if ((used[selectedTool] ?? 0) >= limit) setMessage(`${TOOLS.find((item) => item.kind === selectedTool)?.name} 已达到本关上限。`)
          else {
            const next = newPlacement(level, selectedTool, snapPoint(point))
            commit([...placements, next], `已放置${TOOLS.find((item) => item.kind === selectedTool)?.name}。`)
            setSelectedPlacementId(next.id)
          }
        }
      }
    } else if (drag.mode === 'move' && drag.moved) setMessage('元素已移动并吸附到网格。')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = { mode: 'idle', pointerId: null, start: { x: 0, y: 0 }, camera, moved: false, historySaved: false }
    setGestureMode('idle')
  }
  const cancelDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = { mode: 'idle', pointerId: null, start: { x: 0, y: 0 }, camera, moved: false, historySaved: false }
    setGestureMode('idle')
  }
  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const point = pointerToWorld(event); if (!point) return
    const hit = hitPlacement(point, placements); if (!hit) return
    commit(placements.filter((item) => item.id !== hit.id), '已删除双击的元素。')
    setSelectedPlacementId(null)
  }
  const updateSelectedPlacement = (patch: Partial<Placement>, text = '参数已更新，重新发射即可观察变化。') => {
    if (!selectedPlacement) return
    setHistory((items) => [...items, placements])
    setPlacements((items) => items.map((item) => item.id === selectedPlacement.id ? { ...item, ...patch } : item))
    setSimulation(null); setRunning(false); setProgress(1); setMessage(text)
  }

  return (
    <section className="em-guide" aria-labelledby="em-guide-title">
      <header className="em-guide__header">
        <div><span className="em-guide__eyebrow">ELECTROMAGNETIC LAB · 04</span><h2 id="em-guide-title">电磁指南</h2><p>布置电荷与场，让粒子沿你设计的轨道抵达收集器。</p></div>
        <div className="em-guide__level-badge"><span>LEVEL</span><strong>{String(levelIndex + 1).padStart(2, '0')}</strong><small>{String(level.difficulty).toUpperCase()}</small></div>
      </header>

      <nav className="em-guide__levels" aria-label="选择电磁指南关卡">
        <button className="em-guide__level-arrow" onClick={() => selectLevel(levelIndex - 1)} disabled={!levelIndex} aria-label="上一关"><ChevronLeft /></button>
        <div className="em-guide__level-strip">{ELECTROMAGNETIC_LEVELS.map((item: any, index: number) => <button key={item.id} className={index === levelIndex ? 'is-active' : ''} onClick={() => selectLevel(index)} title={`${item.title} · ${item.difficulty}`} aria-pressed={index === levelIndex}>{index + 1}</button>)}</div>
        <button className="em-guide__level-arrow" onClick={() => selectLevel(levelIndex + 1)} disabled={levelIndex === ELECTROMAGNETIC_LEVELS.length - 1} aria-label="下一关"><ChevronRight /></button>
      </nav>

      <div className="em-guide__mission"><div><span>{DIFFICULTY[level.difficulty] ?? level.difficulty} · {isSandbox ? '无限画布' : `${world.width} × ${world.height} 网格`}</span><h3>{level.title}</h3></div><p>{level.briefing ?? level.subtitle}</p></div>

      <div className="em-guide__workspace">
        <aside className="em-guide__panel em-guide__toolbox" aria-label="场源工具箱">
          <div className="em-guide__panel-title"><span>场源工具箱</span><small>{placements.length} 个已布置</small></div>
          <div className="em-guide__tools">{TOOLS.map(({ kind, name, hint, icon: Icon }) => {
            const available = (level.availableTools ?? []).includes(kind) || isSandbox
            const limit = toolLimit(level, kind); const remaining = limit === Infinity ? '∞' : Math.max(0, limit - (used[kind] ?? 0))
            return <button key={kind} className={selectedTool === kind ? 'is-active' : ''} disabled={!available} onClick={() => { setSelectedTool(kind); setSelectedPlacementId(null) }} aria-pressed={selectedTool === kind}><span className={`em-guide__tool-icon em-guide__tool-icon--${kind}`}><Icon /></span><span><strong>{name}</strong><small>{available ? hint : '后续关卡解锁'}</small></span><b>{available ? remaining : '—'}</b></button>
          })}</div>
          <div className="em-guide__transform"><button disabled={!selectedPlacement?.size} onClick={() => selectedPlacement && updateSelectedPlacement({ rotation: (selectedPlacement.rotation ?? 0) + Math.PI / 4 }, '所选元素已旋转 45°。')} title="旋转所选场源"><RotateCw /><span>旋转所选</span></button><button disabled={!selectedPlacement?.size} onClick={() => selectedPlacement && updateSelectedPlacement({ direction: selectedPlacement.direction === -1 ? 1 : -1 }, '所选元素的场方向已翻转。')} title="翻转所选元素方向"><FlipHorizontal2 /><span>翻转所选</span></button></div>
          {selectedPlacement ? <div className="em-guide__inspector" aria-label="所选元素参数">
            <div className="em-guide__inspector-title"><span>元素参数</span><b>{TOOLS.find((item) => item.kind === selectedPlacement.kind)?.name}</b></div>
            {(selectedPlacement.kind === 'positive-charge' || selectedPlacement.kind === 'negative-charge') && isSandbox ? <label><span>电性</span><select value={selectedPlacement.kind} onChange={(event) => {
              const positive = event.target.value === 'positive-charge'
              const amount = Math.abs(selectedPlacement.strength ?? selectedPlacement.charge ?? 1)
              updateSelectedPlacement({ kind: positive ? 'positive-charge' : 'negative-charge', strength: amount, charge: positive ? amount : -amount })
            }}><option value="positive-charge">正电荷</option><option value="negative-charge">负电荷</option></select></label> : null}
            <label><span>{selectedPlacement.kind === 'positive-charge' || selectedPlacement.kind === 'negative-charge' ? '电荷量' : '场强'} <output>{Math.abs(selectedPlacement.strength ?? 1).toFixed(1)}</output></span><input type="range" min="0.1" max="6" step="0.1" value={Math.abs(selectedPlacement.strength ?? 1)} onChange={(event) => {
              const amount = Number(event.target.value)
              const sign = selectedPlacement.kind === 'negative-charge' ? -1 : 1
              updateSelectedPlacement(selectedPlacement.kind === 'positive-charge' || selectedPlacement.kind === 'negative-charge' ? { strength: amount, charge: sign * amount } : { strength: amount })
            }} /></label>
            {selectedPlacement.size ? <div className="em-guide__inspector-grid"><label><span>宽度</span><input type="number" min="0.5" max="30" step="0.5" value={selectedPlacement.size.x} onChange={(event) => updateSelectedPlacement({ size: { ...selectedPlacement.size!, x: clamp(Number(event.target.value), .5, 30) } })} /></label><label><span>高度</span><input type="number" min="0.5" max="30" step="0.5" value={selectedPlacement.size.y} onChange={(event) => updateSelectedPlacement({ size: { ...selectedPlacement.size!, y: clamp(Number(event.target.value), .5, 30) } })} /></label></div> : null}
            {selectedPlacement.size ? <label><span>旋转角度 <output>{Math.round((selectedPlacement.rotation ?? 0) * 180 / Math.PI)}°</output></span><input type="range" min="-180" max="180" step="5" value={Math.round((selectedPlacement.rotation ?? 0) * 180 / Math.PI)} onChange={(event) => updateSelectedPlacement({ rotation: Number(event.target.value) * Math.PI / 180 })} /></label> : null}
            {selectedPlacement.size ? <label><span>{selectedPlacement.kind === 'electric-field' ? '电场方向' : '磁场方向'}</span><select value={selectedPlacement.direction ?? 1} onChange={(event) => updateSelectedPlacement({ direction: Number(event.target.value) as 1 | -1 })}>{selectedPlacement.kind === 'electric-field' ? <><option value="1">箭头正向</option><option value="-1">箭头反向</option></> : <><option value="1">垂直向外 ·</option><option value="-1">垂直向里 ×</option></>}</select></label> : null}
            {selectedPlacement.kind === 'velocity-selector' ? <label><span>选择速度 v₀ <output>{(selectedPlacement.selectorSpeed ?? 4).toFixed(1)}</output></span><input type="range" min="0.5" max="12" step="0.5" value={selectedPlacement.selectorSpeed ?? 4} onChange={(event) => updateSelectedPlacement({ selectorSpeed: Number(event.target.value) })} /></label> : null}
            <small>拖动元素可重新定位；双击元素可删除。</small>
          </div> : <div className="em-guide__inspector em-guide__inspector--empty"><span>选择画布中的元素</span><small>单击元素后可旋转、翻转或调整参数。</small></div>}
          <div className="em-guide__edit-actions"><button onClick={() => { const previous = history.at(-1); if (!previous) return; setPlacements(previous); setHistory((items) => items.slice(0, -1)); setSimulation(null); setRunning(false); setProgress(1) }} disabled={!history.length}><Undo2 />撤销</button><button onClick={() => commit([], '已清空所有自定义场源。')} disabled={!placements.length}><Trash2 />清空</button><button onClick={loadReference} disabled={isSandbox || !(level.referenceSolution ?? []).length}><Sparkles />参考</button></div>
        </aside>

        <div className="em-guide__stage" ref={stageRef}>
          <canvas className={`${isSandbox ? 'is-sandbox' : ''} ${gestureMode === 'pan' ? 'is-panning' : gestureMode === 'move' ? 'is-moving' : ''}`} ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopDrag} onPointerCancel={cancelDrag} onDoubleClick={onDoubleClick} onContextMenu={(event) => event.preventDefault()} aria-label="电磁粒子轨迹画布" />
          <div className="em-guide__canvas-label"><Grid3X3 /><span>{isSandbox ? '拖动空白平移 · 拖动元素吸附网格 · 双击删除' : '点击放置 · 拖动元素 · 双击删除'}</span></div>
          {isSandbox ? <div className="em-guide__zoom"><button onClick={() => setZoom((z) => clamp(z / 1.2, .35, 3.5))} aria-label="缩小"><ZoomOut /></button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((z) => clamp(z * 1.2, .35, 3.5))} aria-label="放大"><ZoomIn /></button></div> : null}
          <div className="em-guide__launch"><button onClick={run}>{running ? <Pause /> : <Play />}<span>{running ? '暂停' : simulation && (isSandbox || progress < 1) ? '继续' : '发射粒子'}</span></button><div className={`em-guide__timeline${isSandbox && running ? ' is-live' : ''}`}><i style={{ width: `${progress * 100}%` }} /></div></div>
        </div>

        <aside className="em-guide__panel em-guide__readout" aria-label="粒子与目标参数">
          <div className="em-guide__panel-title"><span>粒子读数</span><small>实时参数</small></div>
          <div className="em-guide__particles">{(level.particles ?? []).map((particle: any) => <article key={particle.id}><i style={{ background: particle.color }} /><div><strong>{particle.label}</strong><small>{particle.charge > 0 ? '正电' : particle.charge < 0 ? '负电' : '中性'}粒子</small></div><dl><div><dt>q</dt><dd>{particle.charge > 0 ? '+' : ''}{particle.charge}</dd></div><div><dt>m</dt><dd>{particle.mass}</dd></div><div><dt>v₀</dt><dd>{Math.hypot(particle.startVelocity.x, particle.startVelocity.y).toFixed(1)}</dd></div></dl></article>)}</div>
          <div className="em-guide__goal"><span>本关目标</span><p>{level.goal?.description ?? (isSandbox ? '没有目标限制，自由研究电磁场中的粒子运动。' : '让所有粒子进入正确的收集器，并避开红色障碍。')}</p></div>
          <div className="em-guide__legend"><span><i className="is-particle" />粒子</span><span><i className="is-collector" />收集器</span><span><i className="is-obstacle" />障碍</span></div>
        </aside>
      </div>

      <footer className="em-guide__status" role="status" aria-live="polite"><div><Eraser /><span>{message}</span></div>{!isSandbox && levelIndex < ELECTROMAGNETIC_LEVELS.length - 1 ? <button onClick={() => selectLevel(levelIndex + 1)}>下一关 <ChevronRight /></button> : null}</footer>
    </section>
  )
}

export default ElectromagneticGuideGame
