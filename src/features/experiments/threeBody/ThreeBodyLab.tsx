import {
  Activity,
  Pause,
  Play,
  RotateCcw,
  StepForward,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import {
  THREE_BODY_PRESETS,
  centerOfMass,
  createPreset,
  isFiniteSystem,
  stepSystem,
  type Body,
  type ThreeBodyPresetKey,
  type Vector,
} from './physics'
import './threeBody.css'

type Trail = Vector[]

const DEFAULT_PRESET: ThreeBodyPresetKey = 'figure-eight'
const FIXED_STEP = 0.004
const GRAVITY = 1
const SOFTENING = 0.025

function presetLabel(key: ThreeBodyPresetKey): string {
  return THREE_BODY_PRESETS.find((preset) => preset.key === key)?.label ?? key
}

function makeEmptyTrails(): Trail[] {
  return [[], [], []]
}

function drawScene(
  canvas: HTMLCanvasElement,
  bodies: readonly Body[],
  trails: readonly Trail[],
  running: boolean,
) {
  const context = canvas.getContext('2d')
  if (!context) return

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const width = canvas.width / pixelRatio
  const height = canvas.height / pixelRatio
  if (width <= 0 || height <= 0) return

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.clearRect(0, 0, width, height)

  const background = context.createRadialGradient(
    width * 0.54,
    height * 0.44,
    12,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.7,
  )
  background.addColorStop(0, 'rgba(30, 53, 102, 0.48)')
  background.addColorStop(0.46, 'rgba(10, 17, 43, 0.2)')
  background.addColorStop(1, 'rgba(4, 7, 20, 0.72)')
  context.fillStyle = background
  context.fillRect(0, 0, width, height)

  context.save()
  for (let index = 0; index < 58; index += 1) {
    const x = ((index * 83) % 997) / 997
    const y = ((index * 47 + 19) % 613) / 613
    const radius = index % 7 === 0 ? 1.15 : 0.55
    context.globalAlpha = 0.2 + (index % 5) * 0.07
    context.fillStyle = index % 9 === 0 ? '#7ce9ff' : '#dbe8ff'
    context.beginPath()
    context.arc(x * width, y * height, radius, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()

  const center = centerOfMass(bodies)
  let extent = 1.2
  bodies.forEach((body) => {
    extent = Math.max(
      extent,
      Math.abs(body.position.x - center.x),
      Math.abs(body.position.y - center.y),
    )
  })
  trails.forEach((trail) => {
    const tail = trail.slice(-80)
    tail.forEach((point) => {
      extent = Math.max(
        extent,
        Math.abs(point.x - center.x),
        Math.abs(point.y - center.y),
      )
    })
  })
  const scale = Math.min(width, height) * 0.36 / extent
  const origin = { x: width / 2, y: height / 2 }
  const project = (point: Vector) => ({
    x: origin.x + (point.x - center.x) * scale,
    y: origin.y + (point.y - center.y) * scale,
  })

  context.save()
  context.strokeStyle = 'rgba(117, 169, 255, 0.105)'
  context.lineWidth = 1
  const gridSize = Math.max(44, Math.min(72, width / 10))
  for (let x = origin.x % gridSize; x < width; x += gridSize) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, height)
    context.stroke()
  }
  for (let y = origin.y % gridSize; y < height; y += gridSize) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(width, y)
    context.stroke()
  }
  context.restore()

  trails.forEach((trail, bodyIndex) => {
    if (trail.length < 2) return
    context.save()
    context.strokeStyle = bodies[bodyIndex]?.color ?? '#7ce9ff'
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = 1.45
    context.globalAlpha = 0.48
    context.beginPath()
    trail.forEach((point, pointIndex) => {
      const projected = project(point)
      if (pointIndex === 0) context.moveTo(projected.x, projected.y)
      else context.lineTo(projected.x, projected.y)
    })
    context.stroke()
    context.restore()
  })

  const projectedCenter = project(center)
  context.save()
  context.strokeStyle = 'rgba(243, 245, 248, 0.72)'
  context.fillStyle = 'rgba(243, 245, 248, 0.72)'
  context.lineWidth = 1
  context.beginPath()
  context.arc(projectedCenter.x, projectedCenter.y, 5, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.moveTo(projectedCenter.x - 10, projectedCenter.y)
  context.lineTo(projectedCenter.x + 10, projectedCenter.y)
  context.moveTo(projectedCenter.x, projectedCenter.y - 10)
  context.lineTo(projectedCenter.x, projectedCenter.y + 10)
  context.stroke()
  context.font = '500 11px Inter, "Noto Sans SC", sans-serif'
  context.fillText('质心', projectedCenter.x + 11, projectedCenter.y - 10)
  context.restore()

  bodies.forEach((body) => {
    const point = project(body.position)
    const radius = 7.5 + Math.sqrt(body.mass) * 4.4
    const halo = context.createRadialGradient(
      point.x,
      point.y,
      radius * 0.25,
      point.x,
      point.y,
      radius * 2.7,
    )
    halo.addColorStop(0, body.color)
    halo.addColorStop(0.35, `${body.color}7d`)
    halo.addColorStop(1, `${body.color}00`)
    context.fillStyle = halo
    context.beginPath()
    context.arc(point.x, point.y, radius * 2.7, 0, Math.PI * 2)
    context.fill()

    const sphere = context.createRadialGradient(
      point.x - radius * 0.34,
      point.y - radius * 0.38,
      radius * 0.08,
      point.x,
      point.y,
      radius,
    )
    sphere.addColorStop(0, '#ffffff')
    sphere.addColorStop(0.18, body.color)
    sphere.addColorStop(1, '#172345')
    context.fillStyle = sphere
    context.beginPath()
    context.arc(point.x, point.y, radius, 0, Math.PI * 2)
    context.fill()
  })

  context.save()
  context.font = '600 11px Inter, "Noto Sans SC", sans-serif'
  context.fillStyle = running ? '#7ce9ff' : 'rgba(225, 234, 255, 0.7)'
  context.textAlign = 'right'
  context.fillText(running ? 'LIVE · 数值积分中' : 'HOLD · 等待指令', width - 18, 25)
  context.restore()
}

export function ThreeBodyLab() {
  const [presetKey, setPresetKey] =
    useState<ThreeBodyPresetKey>(DEFAULT_PRESET)
  const [bodies, setBodies] = useState<Body[]>(() => createPreset(DEFAULT_PRESET))
  const [isRunning, setIsRunning] = useState(false)
  const [timeScale, setTimeScale] = useState(1)
  const [trailLength, setTrailLength] = useState(260)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [status, setStatus] = useState('已暂停，可调整参数或开始模拟。')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bodiesRef = useRef(bodies)
  const trailsRef = useRef<Trail[]>(makeEmptyTrails())
  const runningRef = useRef(false)
  const timeScaleRef = useRef(timeScale)
  const trailLengthRef = useRef(trailLength)
  const frameRef = useRef<number | null>(null)
  const previousTimeRef = useRef<number | null>(null)
  const accumulatorRef = useRef(0)
  const elapsedRef = useRef(0)

  const selectedPreset = useMemo(
    () => THREE_BODY_PRESETS.find((preset) => preset.key === presetKey),
    [presetKey],
  )
  const massCenter = centerOfMass(bodies)

  const replaceBodies = (next: Body[]) => {
    bodiesRef.current = next
    setBodies(next)
  }

  const setRunningState = (next: boolean) => {
    runningRef.current = next
    setIsRunning(next)
    previousTimeRef.current = null
    accumulatorRef.current = 0
  }

  const recordTrails = (nextBodies: readonly Body[]) => {
    const limit = trailLengthRef.current
    trailsRef.current = nextBodies.map((body, index) => {
      const trail = trailsRef.current[index] ?? []
      const nextTrail = [...trail, { ...body.position }]
      return nextTrail.slice(Math.max(0, nextTrail.length - limit))
    })
  }

  const recoverFromInstability = () => {
    const restored = createPreset(presetKey)
    replaceBodies(restored)
    trailsRef.current = makeEmptyTrails()
    elapsedRef.current = 0
    setElapsedTime(0)
    setRunningState(false)
    setStatus('检测到数值异常，已自动恢复当前预设。')
  }

  const integrateOnce = (duration = FIXED_STEP) => {
    try {
      const next = stepSystem(
        bodiesRef.current,
        duration,
        GRAVITY,
        SOFTENING,
      )
      if (!isFiniteSystem(next)) {
        recoverFromInstability()
        return false
      }
      replaceBodies(next)
      return true
    } catch {
      recoverFromInstability()
      return false
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const width = Math.max(1, Math.round(bounds.width || 760))
      const height = Math.max(1, Math.round(bounds.height || 470))
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      drawScene(canvas, bodiesRef.current, trailsRef.current, runningRef.current)
    }

    resize()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', resize)
      return () => window.removeEventListener('resize', resize)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) drawScene(canvas, bodies, trailsRef.current, isRunning)
  }, [bodies, isRunning])

  useEffect(() => {
    if (!isRunning) return

    const animate = (time: number) => {
      if (!runningRef.current) return
      if (previousTimeRef.current === null) previousTimeRef.current = time
      const realDelta = Math.min((time - previousTimeRef.current) / 1000, 0.05)
      previousTimeRef.current = time
      const maxCatchUp = FIXED_STEP * 16
      accumulatorRef.current = Math.min(
        accumulatorRef.current + realDelta * timeScaleRef.current,
        maxCatchUp,
      )

      let iterations = 0
      let advanced = false
      while (accumulatorRef.current >= FIXED_STEP && iterations < 16) {
        if (!integrateOnce(FIXED_STEP)) return
        accumulatorRef.current -= FIXED_STEP
        elapsedRef.current += FIXED_STEP
        advanced = true
        iterations += 1
      }

      if (advanced) {
        recordTrails(bodiesRef.current)
        setElapsedTime(elapsedRef.current)
      }
      frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [isRunning])

  const handlePresetChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextKey = event.target.value as ThreeBodyPresetKey
    const nextBodies = createPreset(nextKey)
    setPresetKey(nextKey)
    replaceBodies(nextBodies)
    trailsRef.current = makeEmptyTrails()
    elapsedRef.current = 0
    setElapsedTime(0)
    setRunningState(false)
    setStatus(`已载入 ${presetLabel(nextKey)}，等待开始。`)
  }

  const handleMassChange = (index: number, value: number) => {
    const next = bodiesRef.current.map((body, bodyIndex) =>
      bodyIndex === index ? { ...body, mass: value } : body,
    )
    replaceBodies(next)
    setRunningState(false)
    setStatus(`${next[index].name}质量已更新，模拟已暂停。`)
  }

  const handleTimeScaleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    timeScaleRef.current = value
    setTimeScale(value)
    setStatus(`时间尺度已设为 ${value.toFixed(1)}×。`)
  }

  const handleTrailLengthChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    trailLengthRef.current = value
    setTrailLength(value)
    trailsRef.current = trailsRef.current.map((trail) => trail.slice(-value))
    setStatus(`轨迹保留长度已设为 ${value} 点。`)
  }

  const handleToggle = () => {
    const next = !runningRef.current
    setRunningState(next)
    setStatus(next ? '运行中：正在计算天体轨道。' : '已暂停，可继续或单步演算。')
  }

  const handleSingleStep = () => {
    setRunningState(false)
    let advanced = true
    for (let index = 0; index < 3; index += 1) {
      advanced = integrateOnce(FIXED_STEP * timeScaleRef.current)
      if (!advanced) break
      elapsedRef.current += FIXED_STEP * timeScaleRef.current
    }
    if (advanced) {
      recordTrails(bodiesRef.current)
      setElapsedTime(elapsedRef.current)
      setStatus('已完成单步演算，可继续观察。')
    }
  }

  const handleReset = () => {
    replaceBodies(createPreset(presetKey))
    trailsRef.current = makeEmptyTrails()
    elapsedRef.current = 0
    setElapsedTime(0)
    setRunningState(false)
    setStatus(`已恢复 ${presetLabel(presetKey)}初始状态。`)
  }

  return (
    <section className="three-body-lab" aria-labelledby="three-body-title">
      <div className="three-body-console">
        <header className="three-body-heading">
          <div className="three-body-heading__icon" aria-hidden="true">
            <Activity size={19} strokeWidth={1.7} />
          </div>
          <div>
            <h2 id="three-body-title">三体轨道台</h2>
            <p>改变初始系统，观察引力如何把确定性折叠成复杂轨迹。</p>
          </div>
        </header>

        <div className="three-body-field">
          <label htmlFor="three-body-preset">轨道预设</label>
          <select
            id="three-body-preset"
            value={presetKey}
            onChange={handlePresetChange}
          >
            {THREE_BODY_PRESETS.map((preset) => (
              <option key={preset.key} value={preset.key}>
                {preset.label}
              </option>
            ))}
          </select>
          <p>{selectedPreset?.description}</p>
        </div>

        <fieldset className="three-body-masses">
          <legend>天体质量</legend>
          {bodies.map((body, index) => (
            <div className="three-body-range" key={body.id}>
              <label htmlFor={`three-body-mass-${body.id}`}>
                <span
                  className="three-body-color-dot"
                  style={{ backgroundColor: body.color }}
                  aria-hidden="true"
                />
                {body.name} 质量
              </label>
              <span className="three-body-range__value" aria-hidden="true">
                {body.mass.toFixed(1)}
              </span>
              <input
                id={`three-body-mass-${body.id}`}
                type="range"
                min="0.4"
                max="3"
                step="0.1"
                value={body.mass}
                onChange={(event) =>
                  handleMassChange(index, Number(event.target.value))
                }
              />
            </div>
          ))}
        </fieldset>

        <div className="three-body-control-stack">
          <div className="three-body-range">
            <label htmlFor="three-body-time-scale">时间尺度</label>
            <span className="three-body-range__value" aria-hidden="true">
              {timeScale.toFixed(1)}×
            </span>
            <input
              id="three-body-time-scale"
              type="range"
              min="0.2"
              max="2.5"
              step="0.1"
              value={timeScale}
              onChange={handleTimeScaleChange}
            />
          </div>
          <div className="three-body-range">
            <label htmlFor="three-body-trail-length">轨迹长度</label>
            <span className="three-body-range__value" aria-hidden="true">
              {trailLength} 点
            </span>
            <input
              id="three-body-trail-length"
              type="range"
              min="60"
              max="600"
              step="20"
              value={trailLength}
              onChange={handleTrailLengthChange}
            />
          </div>
        </div>

        <div className="three-body-actions">
          <button className="three-body-primary" type="button" onClick={handleToggle}>
            {isRunning ? (
              <Pause size={17} aria-hidden="true" />
            ) : (
              <Play size={17} aria-hidden="true" />
            )}
            {isRunning ? '暂停模拟' : '开始模拟'}
          </button>
          <button
            type="button"
            onClick={handleSingleStep}
            disabled={isRunning}
          >
            <StepForward size={17} aria-hidden="true" />
            单步演算
          </button>
          <button type="button" onClick={handleReset}>
            <RotateCcw size={17} aria-hidden="true" />
            重置模拟
          </button>
        </div>

        <div
          className="three-body-status"
          role="status"
          aria-label="模拟状态"
          aria-live="polite"
        >
          <span
            className={`three-body-status__light${isRunning ? ' is-running' : ''}`}
            aria-hidden="true"
          />
          <span>{status}</span>
        </div>
      </div>

      <div className="three-body-viewport">
        <div className="three-body-canvas-frame">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="三体二维牛顿引力模拟画布，显示三颗天体、运动尾迹与质心。"
          >
            三体模拟器画布：通过旁边的控制台选择预设、调整质量并运行模拟。
          </canvas>
          <div className="three-body-readout" aria-hidden="true">
            <span>t = {elapsedTime.toFixed(2)}</span>
            <span>G = {GRAVITY.toFixed(2)}</span>
            <span>ε = {SOFTENING.toFixed(3)}</span>
          </div>
        </div>

        <div className="three-body-metrics">
          <div>
            <span>系统质心 X</span>
            <strong>{massCenter.x.toFixed(3)}</strong>
          </div>
          <div>
            <span>系统质心 Y</span>
            <strong>{massCenter.y.toFixed(3)}</strong>
          </div>
          <div>
            <span>积分方法</span>
            <strong>Velocity Verlet</strong>
          </div>
        </div>
      </div>
    </section>
  )
}

export default ThreeBodyLab
