import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import { Crosshair, Eraser, Hand, Layers, Mountain, Plus, RotateCcw, Trash2, Zap } from 'lucide-react'
import {
  CHARGE_LIMIT,
  FIELD_PRESETS,
  HEIGHT_SCALE_DEFAULT,
  HEIGHT_SCALE_MAX,
  HEIGHT_SCALE_MIN,
  MAX_CHARGES,
  PLACEMENT_LIMIT,
  clampCharge,
  clampCoordinate,
  createCharge,
  formatSigned,
  instantiatePreset,
  summarizeField,
  type FieldMode,
  type FieldPreset,
  type PointCharge,
} from './field'
import { rampFor, toCssGradient } from './palette'
import type { PotentialSceneHandle, ResolutionKey, SurfaceStyle } from './scene'
import { useColorMode } from './useColorMode'
import './potentialField.css'

type Gesture = 'none' | 'orbit' | 'pan' | 'drag' | 'pinch'

const MODE_LABELS: Record<FieldMode, string> = { potential: '电势 Φ', magnitude: '场强 |E|' }
const MODE_NOTES: Record<FieldMode, string> = {
  potential: 'Z 轴为电势 Φ = Σ q/r。正电荷把曲面顶起成山峰，负电荷把它拽成谷底。',
  magnitude: 'Z 轴为场强大小 |E| = |Σ q·r̂/r²|。它恒为正，因此每个电荷都表现为一座尖峰。',
}
const STYLE_OPTIONS: Array<{ id: SurfaceStyle; label: string }> = [
  { id: 'both', label: '叠加' },
  { id: 'solid', label: '曲面' },
  { id: 'mesh', label: '网格' },
]
const RESOLUTION_OPTIONS: Array<{ id: ResolutionKey; label: string }> = [
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
]

/** Local slider, matching the pattern each instrument in this directory keeps to itself. */
function RangeControl({
  id,
  label,
  symbol,
  value,
  minimum,
  maximum,
  step,
  onChange,
}: {
  id: string
  label: string
  symbol: string
  value: number
  minimum: number
  maximum: number
  step: number
  onChange: (value: number) => void
}) {
  const progress = ((value - minimum) / (maximum - minimum)) * 100
  return (
    <label className="potential-lab__range" htmlFor={id}>
      <span>
        {label}
        <i>{symbol}</i>
      </span>
      <output htmlFor={id}>{value.toFixed(2)}×</output>
      <input
        id={id}
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        style={{ '--potential-range-progress': `${progress}%` } as CSSProperties}
        onChange={(event) => onChange(Number.parseFloat(event.target.value))}
      />
    </label>
  )
}

export function PotentialFieldLab() {
  const theme = useColorMode()

  const [charges, setCharges] = useState<PointCharge[]>(() => instantiatePreset(FIELD_PRESETS[0]))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<FieldMode>('potential')
  const [heightScale, setHeightScale] = useState(HEIGHT_SCALE_DEFAULT)
  const [surfaceStyle, setSurfaceStyle] = useState<SurfaceStyle>('both')
  const [resolution, setResolution] = useState<ResolutionKey>('medium')
  const [unsupported, setUnsupported] = useState(() => typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom'))
  const [draft, setDraft] = useState({ x: '-3.0', y: '0.0', q: '2.0' })
  const [editDraft, setEditDraft] = useState({ x: '', y: '', q: '' })
  const [notice, setNotice] = useState('拖动视图中的电荷，曲面会实时跟着变形。')

  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<HTMLFieldSetElement | null>(null)
  const sceneRef = useRef<PotentialSceneHandle | null>(null)
  const chargesRef = useRef<PointCharge[]>(charges)
  const selectedRef = useRef<string | null>(null)
  const gestureRef = useRef<Gesture>('none')
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const lastPointRef = useRef({ x: 0, y: 0 })
  const travelRef = useRef(0)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const dragIdRef = useRef<string | null>(null)
  const pinchRef = useRef({ distance: 0, x: 0, y: 0 })
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 })
  const commitAtRef = useRef(0)

  const selected = useMemo(
    () => charges.find((charge) => charge.id === selectedId) ?? null,
    [charges, selectedId],
  )
  const summary = useMemo(() => summarizeField(charges, mode), [charges, mode])
  const legendGradient = useMemo(() => toCssGradient(rampFor(theme, mode)), [theme, mode])

  useEffect(() => {
    chargesRef.current = charges
  }, [charges])

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  // The canvas is created inside the effect rather than in JSX: React 19's
  // StrictMode mounts twice in development, and a fresh element each time is the
  // only reliable way to hand three.js an unused WebGL context.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let handle: PotentialSceneHandle | null = null
    import('./scene').then(({ createPotentialScene }) => {
      if (disposed) return
      handle = createPotentialScene(container)
      if (!handle) {
        setUnsupported(true)
        return
      }
      sceneRef.current = handle
      handle.setCharges(chargesRef.current, selectedRef.current)
    }).catch(() => {
      if (!disposed) setUnsupported(true)
    })

    return () => {
      disposed = true
      handle?.dispose()
      sceneRef.current = null
      // The dynamically imported scene may still be resolving on unmount.
      // Its promise observes `disposed` and will avoid creating a WebGL context.
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.setCharges(charges, selectedId)
  }, [charges, selectedId])

  useEffect(() => {
    sceneRef.current?.setMode(mode)
  }, [mode])

  useEffect(() => {
    sceneRef.current?.setHeightScale(heightScale)
  }, [heightScale])

  useEffect(() => {
    sceneRef.current?.setSurfaceStyle(surfaceStyle)
  }, [surfaceStyle])

  useEffect(() => {
    sceneRef.current?.setResolution(resolution)
  }, [resolution])

  useEffect(() => {
    sceneRef.current?.setTheme(theme)
  }, [theme])

  // Keep the coordinate editor in step with dragging, but never fight the user
  // while they are typing into it.
  useEffect(() => {
    if (!selected) {
      setEditDraft({ x: '', y: '', q: '' })
      return
    }
    const active = document.activeElement
    if (active instanceof HTMLElement && editorRef.current?.contains(active)) return
    setEditDraft({ x: selected.x.toFixed(2), y: selected.y.toFixed(2), q: selected.q.toFixed(2) })
  }, [selected])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const pointers = pointersRef.current

    const beginPinch = () => {
      const [first, second] = [...pointers.values()]
      pinchRef.current = {
        distance: Math.hypot(first.x - second.x, first.y - second.y),
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      }
      gestureRef.current = 'pinch'
      dragIdRef.current = null
    }

    const handlePointerDown = (event: PointerEvent) => {
      const scene = sceneRef.current
      if (!scene) return
      container.setPointerCapture(event.pointerId)
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (pointers.size === 2) {
        beginPinch()
        return
      }
      if (pointers.size > 2) return

      lastPointRef.current = { x: event.clientX, y: event.clientY }
      travelRef.current = 0

      const hitId = scene.pickCharge(event.clientX, event.clientY)
      if (hitId) {
        const plane = scene.projectToPlane(event.clientX, event.clientY)
        const charge = chargesRef.current.find((item) => item.id === hitId)
        dragOffsetRef.current =
          plane && charge ? { x: plane.x - charge.x, y: plane.y - charge.y } : { x: 0, y: 0 }
        dragIdRef.current = hitId
        gestureRef.current = 'drag'
        selectedRef.current = hitId
        setSelectedId(hitId)
        container.classList.add('is-dragging')
        return
      }

      gestureRef.current = event.button === 2 || event.shiftKey ? 'pan' : 'orbit'
      container.classList.add('is-dragging')
    }

    const handlePointerMove = (event: PointerEvent) => {
      const scene = sceneRef.current
      if (!scene || !pointers.has(event.pointerId)) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (gestureRef.current === 'pinch') {
        if (pointers.size < 2) return
        const [first, second] = [...pointers.values()]
        const distance = Math.hypot(first.x - second.x, first.y - second.y)
        const midX = (first.x + second.x) / 2
        const midY = (first.y + second.y) / 2
        const previous = pinchRef.current
        if (previous.distance > 0 && distance > 0) scene.dolly(previous.distance / distance)
        scene.pan(midX - previous.x, midY - previous.y)
        pinchRef.current = { distance, x: midX, y: midY }
        return
      }

      const last = lastPointRef.current
      const deltaX = event.clientX - last.x
      const deltaY = event.clientY - last.y
      lastPointRef.current = { x: event.clientX, y: event.clientY }
      travelRef.current += Math.abs(deltaX) + Math.abs(deltaY)

      if (gestureRef.current === 'drag') {
        const id = dragIdRef.current
        const plane = scene.projectToPlane(event.clientX, event.clientY)
        if (!id || !plane) return
        const offset = dragOffsetRef.current
        const next = chargesRef.current.map((charge) =>
          charge.id === id
            ? {
                ...charge,
                x: clampCoordinate(plane.x - offset.x),
                y: clampCoordinate(plane.y - offset.y),
              }
            : charge,
        )
        chargesRef.current = next
        // Push to the GPU every frame, but only wake React a few times a second.
        scene.setCharges(next, selectedRef.current)
        const now = performance.now()
        if (now - commitAtRef.current > 60) {
          commitAtRef.current = now
          setCharges(next)
        }
        return
      }

      if (gestureRef.current === 'orbit') {
        scene.orbit(-deltaX * 0.0058, deltaY * 0.0052)
        return
      }
      if (gestureRef.current === 'pan') scene.pan(deltaX, deltaY)
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      pointers.delete(event.pointerId)
      if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId)

      const gesture = gestureRef.current
      const tapped = travelRef.current < 6

      if (gesture === 'drag') {
        setCharges(chargesRef.current)
      } else if (gesture === 'orbit' && tapped) {
        selectedRef.current = null
        setSelectedId(null)
      }

      if (pointers.size >= 2) {
        beginPinch()
        return
      }

      if (pointers.size === 1) {
        // A finger came off a two-finger gesture; carry on orbiting with the rest.
        const [remaining] = [...pointers.values()]
        lastPointRef.current = { x: remaining.x, y: remaining.y }
        gestureRef.current = 'orbit'
        travelRef.current = Number.MAX_SAFE_INTEGER
        return
      }

      gestureRef.current = 'none'
      dragIdRef.current = null
      container.classList.remove('is-dragging')

      // Touch gets no dblclick event once touch-action is disabled, so pair up taps here.
      if (event.pointerType === 'touch' && tapped) {
        const now = performance.now()
        const previous = lastTapRef.current
        const near = Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 26
        if (now - previous.time < 320 && near) {
          sceneRef.current?.resetCamera()
          lastTapRef.current = { time: 0, x: 0, y: 0 }
        } else {
          lastTapRef.current = { time: now, x: event.clientX, y: event.clientY }
        }
      }
    }

    const handleWheel = (event: WheelEvent) => {
      if (!sceneRef.current) return
      event.preventDefault()
      sceneRef.current.dolly(Math.exp(event.deltaY * 0.0011))
    }

    const handleDoubleClick = () => sceneRef.current?.resetCamera()
    const handleContextMenu = (event: MouseEvent) => event.preventDefault()

    container.addEventListener('pointerdown', handlePointerDown)
    container.addEventListener('pointermove', handlePointerMove)
    container.addEventListener('pointerup', handlePointerUp)
    container.addEventListener('pointercancel', handlePointerUp)
    container.addEventListener('wheel', handleWheel, { passive: false })
    container.addEventListener('dblclick', handleDoubleClick)
    container.addEventListener('contextmenu', handleContextMenu)

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown)
      container.removeEventListener('pointermove', handlePointerMove)
      container.removeEventListener('pointerup', handlePointerUp)
      container.removeEventListener('pointercancel', handlePointerUp)
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('dblclick', handleDoubleClick)
      container.removeEventListener('contextmenu', handleContextMenu)
      pointers.clear()
    }
  }, [])

  const handlePlace = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (charges.length >= MAX_CHARGES) {
        setNotice(`最多同时放置 ${MAX_CHARGES} 个点电荷，请先删除一些。`)
        return
      }
      const x = Number.parseFloat(draft.x)
      const y = Number.parseFloat(draft.y)
      const q = Number.parseFloat(draft.q)
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(q)) {
        setNotice('坐标与电量都需要填写有效数值。')
        return
      }
      if (Math.abs(q) < 0.05) {
        setNotice('电量不能为零：正数表示正电荷，负数表示负电荷。')
        return
      }
      const charge = createCharge(x, y, q)
      setCharges((previous) => [...previous, charge])
      setSelectedId(charge.id)
      setNotice(`已在 (${charge.x.toFixed(2)}, ${charge.y.toFixed(2)}) 放置 q = ${formatSigned(charge.q)}。`)
    },
    [charges.length, draft],
  )

  const handleClear = useCallback(() => {
    setCharges([])
    setSelectedId(null)
    setNotice('已清空所有点电荷，曲面回到零势平面。')
  }, [])

  const handleDelete = useCallback(() => {
    if (!selectedId) return
    setCharges((previous) => previous.filter((charge) => charge.id !== selectedId))
    setSelectedId(null)
    setNotice('已删除选中的点电荷。')
  }, [selectedId])

  const handlePreset = useCallback((preset: FieldPreset) => {
    setCharges(instantiatePreset(preset))
    setSelectedId(null)
    setNotice(`已载入「${preset.label}」构型。`)
  }, [])

  const handleEdit = useCallback(
    (key: 'x' | 'y' | 'q', raw: string) => {
      setEditDraft((previous) => ({ ...previous, [key]: raw }))
      const parsed = Number.parseFloat(raw)
      if (!Number.isFinite(parsed) || !selectedId) return
      const value = key === 'q' ? clampCharge(parsed) : clampCoordinate(parsed)
      setCharges((previous) =>
        previous.map((charge) => (charge.id === selectedId ? { ...charge, [key]: value } : charge)),
      )
    },
    [selectedId],
  )

  const handleResetCamera = useCallback(() => {
    sceneRef.current?.resetCamera()
    setNotice('视角已复位到 +x 轴方向。')
  }, [])

  const peakLabel = mode === 'potential' ? 'Φ 峰值' : '|E| 峰值'
  const valleyLabel = mode === 'potential' ? 'Φ 谷值' : '|E| 最小'

  return (
    <article className="potential-lab">
      <aside className="potential-lab__console">
        <header className="potential-lab__heading">
          <span>
            <Mountain />
          </span>
          <div>
            <small>POTENTIAL SURFACE</small>
            <h2>电势曲面</h2>
            <p>点电荷把平面撑成地形：正电荷隆起为暖色山峰，负电荷塌陷为冷色谷底。</p>
          </div>
        </header>

        <div className="potential-lab__mode" role="group" aria-label="选择映射到高度的物理量">
          {(Object.keys(MODE_LABELS) as FieldMode[]).map((id) => (
            <button
              key={id}
              type="button"
              className={mode === id ? 'is-active' : ''}
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
            >
              {MODE_LABELS[id]}
            </button>
          ))}
        </div>
        <p className="potential-lab__mode-note">{MODE_NOTES[mode]}</p>

        <form onSubmit={handlePlace}>
          <fieldset className="potential-lab__group">
            <legend>放置新电荷</legend>
            <div className="potential-lab__inputs">
              <label>
                <span>X 坐标</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={-PLACEMENT_LIMIT}
                  max={PLACEMENT_LIMIT}
                  value={draft.x}
                  onChange={(event) => setDraft((previous) => ({ ...previous, x: event.target.value }))}
                />
              </label>
              <label>
                <span>Y 坐标</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={-PLACEMENT_LIMIT}
                  max={PLACEMENT_LIMIT}
                  value={draft.y}
                  onChange={(event) => setDraft((previous) => ({ ...previous, y: event.target.value }))}
                />
              </label>
              <label>
                <span>电量 q</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={-CHARGE_LIMIT}
                  max={CHARGE_LIMIT}
                  value={draft.q}
                  onChange={(event) => setDraft((previous) => ({ ...previous, q: event.target.value }))}
                />
              </label>
            </div>
            <div className="potential-lab__actions">
              <button type="submit" className="potential-lab__primary">
                <Plus />
                放置
              </button>
              <button type="button" onClick={handleClear}>
                <Eraser />
                清空
              </button>
            </div>
          </fieldset>
        </form>

        <fieldset className="potential-lab__group" ref={editorRef}>
          <legend>选中电荷</legend>
          {selected ? (
            <>
              <div className="potential-lab__inputs">
                <label>
                  <span>X 坐标</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={editDraft.x}
                    onChange={(event) => handleEdit('x', event.target.value)}
                  />
                </label>
                <label>
                  <span>Y 坐标</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={editDraft.y}
                    onChange={(event) => handleEdit('y', event.target.value)}
                  />
                </label>
                <label>
                  <span>电量 q</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={editDraft.q}
                    onChange={(event) => handleEdit('q', event.target.value)}
                  />
                </label>
              </div>
              <div className="potential-lab__actions">
                <button type="button" onClick={handleDelete}>
                  <Trash2 />
                  删除该电荷
                </button>
              </div>
            </>
          ) : (
            <p className="potential-lab__empty">在视图中点击任意电荷即可选中，然后拖动或手动输入坐标。</p>
          )}
        </fieldset>

        <fieldset className="potential-lab__group">
          <legend>预设构型</legend>
          <div className="potential-lab__presets">
            {FIELD_PRESETS.map((preset) => (
              <button key={preset.id} type="button" onClick={() => handlePreset(preset)}>
                {preset.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="potential-lab__group">
          <legend>高度映射</legend>
          <RangeControl
            id="potential-height-scale"
            label="高度缩放"
            symbol="k"
            value={heightScale}
            minimum={HEIGHT_SCALE_MIN}
            maximum={HEIGHT_SCALE_MAX}
            step={0.05}
            onChange={setHeightScale}
          />
          <div className="potential-lab__derived">
            <span>色阶</span>
            <i className="potential-lab__swatch" style={{ background: legendGradient }} />
          </div>
        </fieldset>

        <p className="potential-lab__notice" role="status">
          {notice}
        </p>
      </aside>

      <div className="potential-lab__workspace">
        <div className="potential-lab__toolbar">
          <div role="group" aria-label="曲面样式">
            <span className="potential-lab__toolbar-label">
              <Layers />
              样式
            </span>
            {STYLE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={surfaceStyle === option.id ? 'is-active' : ''}
                aria-pressed={surfaceStyle === option.id}
                onClick={() => setSurfaceStyle(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="网格密度">
            <span className="potential-lab__toolbar-label">
              <Crosshair />
              密度
            </span>
            {RESOLUTION_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={resolution === option.id ? 'is-active' : ''}
                aria-pressed={resolution === option.id}
                onClick={() => setResolution(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="potential-lab__reset" onClick={handleResetCamera}>
            <RotateCcw />
            重置视角
          </button>
        </div>

        <div className="potential-lab__viewport" ref={containerRef}>
          {unsupported ? (
            <div className="potential-lab__fallback">
              <Zap />
              <strong>无法启动 3D 视图</strong>
              <p>当前浏览器或设备未提供 WebGL 支持。控制面板依然可用，但无法绘制曲面。</p>
            </div>
          ) : (
            <>
              <div className="potential-lab__tag">
                <Mountain />
                {mode === 'potential' ? 'Φ(x, y) 电势地形' : '|E|(x, y) 场强地形'}
              </div>
              <div className="potential-lab__legend">
                <span>{summary.valley.toFixed(1)}</span>
                <i style={{ background: legendGradient }} />
                <span>{summary.peak.toFixed(1)}</span>
              </div>
              <div className="potential-lab__hint">
                <Hand />
                左键旋转 · 右键平移 · 滚轮缩放 · 双击复位
              </div>
              {selected ? (
                <div className="potential-lab__selection">
                  已选中 q = {formatSigned(selected.q)} @ ({selected.x.toFixed(2)}, {selected.y.toFixed(2)})
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="potential-lab__readouts">
          <div>
            <span>点电荷</span>
            <strong>
              {charges.length} / {MAX_CHARGES}
            </strong>
          </div>
          <div>
            <span>净电荷</span>
            <strong>{formatSigned(summary.netCharge)}</strong>
          </div>
          <div>
            <span>{peakLabel}</span>
            <strong>{summary.peak.toFixed(2)}</strong>
          </div>
          <div>
            <span>{valleyLabel}</span>
            <strong>{summary.valley.toFixed(2)}</strong>
          </div>
        </div>

        <p className="potential-lab__footnote">
          取库仑常量 k = 1，并对 1/r 做软化处理（r → √(r²+0.16)），因此电荷处的无穷尖峰被压成有限的圆顶；
          高度经 tanh 饱和后有界，色阶与高度一一对应。
        </p>
      </div>
    </article>
  )
}

export default PotentialFieldLab
