import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  equalTimeSamples,
  flightTime,
  horizontalRange,
  projectileStateAtTime,
} from './model'
import './projectile.css'

type MotionStatus = 'idle' | 'running' | 'paused' | 'landed'

const PLOT = { left: 82, right: 958, top: 58, ground: 426 }
const SPEED_OPTIONS = [0.5, 1, 2] as const

function format(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.00'
}

function statusLabel(status: MotionStatus) {
  if (status === 'running') return '运行中'
  if (status === 'paused') return '已暂停'
  if (status === 'landed') return '已落地'
  return '等待发射'
}

export function ProjectileLab() {
  const [initialSpeed, setInitialSpeed] = useState(14)
  const [gravity, setGravity] = useState(9.8)
  const [initialHeight, setInitialHeight] = useState(20)
  const [axisRatio, setAxisRatio] = useState(1)
  const [time, setTime] = useState(0)
  const [speed, setSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1)
  const [status, setStatus] = useState<MotionStatus>('idle')
  const [showHorizontal, setShowHorizontal] = useState(true)
  const [showVertical, setShowVertical] = useState(true)
  const [selectedTrailIndex, setSelectedTrailIndex] = useState<number | null>(null)
  const timeRef = useRef(0)
  const speedRef = useRef(speed)
  const clockRef = useRef<HTMLElement | null>(null)
  const progressRef = useRef<HTMLElement | null>(null)
  const ballRef = useRef<SVGGElement | null>(null)
  const horizontalLineRef = useRef<SVGLineElement | null>(null)
  const horizontalPointRef = useRef<SVGCircleElement | null>(null)
  const horizontalLabelRef = useRef<SVGTextElement | null>(null)
  const verticalLineRef = useRef<SVGLineElement | null>(null)
  const verticalPointRef = useRef<SVGCircleElement | null>(null)
  const verticalLabelRef = useRef<SVGTextElement | null>(null)

  const parameters = useMemo(() => ({
    initialSpeed,
    gravity,
    height: initialHeight,
  }), [gravity, initialHeight, initialSpeed])
  const duration = useMemo(() => flightTime(gravity, initialHeight), [gravity, initialHeight])
  const range = useMemo(() => horizontalRange(initialSpeed, gravity, initialHeight), [gravity, initialHeight, initialSpeed])
  const current = useMemo(() => projectileStateAtTime(time, parameters), [parameters, time])
  const samples = useMemo(() => equalTimeSamples(parameters, 15), [parameters])
  const trajectory = useMemo(() => equalTimeSamples(parameters, 81), [parameters])
  const axisModel = useMemo(() => {
    const plotWidth = PLOT.right - PLOT.left
    const plotHeight = PLOT.ground - PLOT.top
    const scale = Math.min(plotWidth / Math.max(range * axisRatio, 0.001), plotHeight / Math.max(initialHeight, 0.001))
    const usedWidth = range * axisRatio * scale
    const xOrigin = PLOT.left + (plotWidth - usedWidth) / 2
    return {
      scale,
      xToSvg: (x: number) => xOrigin + x * axisRatio * scale,
      yToSvg: (y: number) => PLOT.ground - y * scale,
    }
  }, [axisRatio, initialHeight, range])
  const { xToSvg, yToSvg } = axisModel
  const launchX = xToSvg(0)
  const launchY = yToSvg(initialHeight)
  const trajectoryPath = trajectory.map((point, index) => (
    `${index === 0 ? 'M' : 'L'} ${xToSvg(point.x).toFixed(2)} ${yToSvg(point.y).toFixed(2)}`
  )).join(' ')

  const paintMotionFrame = useCallback((simulationTime: number) => {
    const state = projectileStateAtTime(simulationTime, parameters)
    const nextX = xToSvg(state.x)
    const nextY = yToSvg(state.y)
    ballRef.current?.setAttribute('transform', `translate(${nextX} ${nextY})`)
    if (clockRef.current) clockRef.current.textContent = `${format(state.time)} s`
    if (progressRef.current) progressRef.current.style.width = `${duration > 0 ? (state.time / duration) * 100 : 0}%`

    horizontalLineRef.current?.setAttribute('x1', String(nextX))
    horizontalLineRef.current?.setAttribute('x2', String(nextX))
    horizontalLineRef.current?.setAttribute('y2', String(nextY))
    horizontalPointRef.current?.setAttribute('cx', String(nextX))
    horizontalLabelRef.current?.setAttribute('x', String(Math.min(nextX + 15, 880)))

    verticalLineRef.current?.setAttribute('x2', String(nextX))
    verticalLineRef.current?.setAttribute('y1', String(nextY))
    verticalLineRef.current?.setAttribute('y2', String(nextY))
    verticalPointRef.current?.setAttribute('cy', String(nextY))
    verticalLabelRef.current?.setAttribute('y', String(Math.max(nextY - 14, 88)))
  }, [duration, parameters, xToSvg, yToSvg])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    paintMotionFrame(timeRef.current)
  }, [paintMotionFrame, showHorizontal, showVertical])

  useEffect(() => {
    if (status !== 'running') return undefined

    let frameId = 0
    let previousTime = performance.now()
    let lastReactCommit = previousTime

    const tick = (timestamp: number) => {
      const elapsed = Math.min((timestamp - previousTime) / 1000, 0.05)
      previousTime = timestamp
      const nextTime = Math.min(timeRef.current + elapsed * speedRef.current, duration)

      timeRef.current = nextTime
      paintMotionFrame(nextTime)
      if (nextTime >= duration) {
        setTime(duration)
        setStatus('landed')
        return
      }
      if (timestamp - lastReactCommit >= 1000 / 15) {
        setTime(nextTime)
        lastReactCommit = timestamp
      }
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [duration, paintMotionFrame, status])

  const resetMotion = (nextStatus: MotionStatus = 'idle') => {
    timeRef.current = 0
    paintMotionFrame(0)
    setTime(0)
    setStatus(nextStatus)
    setSelectedTrailIndex(null)
  }

  const changeInitialSpeed = (value: number) => {
    setInitialSpeed(value)
    resetMotion()
  }

  const changeGravity = (value: number) => {
    setGravity(value)
    resetMotion()
  }

  const changeHeight = (value: number) => {
    setInitialHeight(value)
    resetMotion()
  }

  const toggleMotion = () => {
    if (status === 'running') {
      setTime(timeRef.current)
      setStatus('paused')
      return
    }
    if (status === 'landed') {
      timeRef.current = 0
      paintMotionFrame(0)
      setTime(0)
      setSelectedTrailIndex(null)
    }
    setStatus('running')
  }

  return (
    <article className="projectile-lab">
      <header className="projectile-lab__header">
        <div>
            <p className="projectile-lab__eyebrow">PROJECTILE MOTION · h = {format(initialHeight, 1)} m</p>
          <h2>平抛运动分解台</h2>
          <p>同一时刻，对照水平匀速运动与竖直自由落体，观察两个独立分运动如何合成抛物线。</p>
        </div>
        <div className="projectile-lab__formula" aria-label="平抛运动解析式">
          <span>解析模型</span>
          <strong>x = v₀t</strong>
          <strong>y = h − ½gt²</strong>
        </div>
      </header>

      <div className="projectile-lab__workspace">
        <section className="projectile-stage" aria-label="平抛运动演示区">
          <div className="projectile-stage__topline">
            <div role="status" aria-label="运动状态" className={`projectile-status projectile-status--${status}`}>
              <i aria-hidden="true" />
              <span>{statusLabel(status)}</span>
            </div>
            <div className="projectile-stage__clock">
              <span>t</span>
              <strong ref={clockRef}>{format(current.time)} s</strong>
            </div>
          </div>

          <div className="projectile-stage__viewport">
            <svg
              viewBox="0 0 1000 500"
              role="img"
              data-axis-ratio={axisRatio.toFixed(2)}
              aria-label={`小球在 ${format(current.time)} 秒时位于水平 ${format(current.x)} 米、竖直 ${format(current.y)} 米处`}
            >
              <defs>
                <linearGradient id="projectile-sky" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#06101f" />
                  <stop offset="0.58" stopColor="#09162c" />
                  <stop offset="1" stopColor="#08111e" />
                </linearGradient>
                <radialGradient id="projectile-ball" cx="35%" cy="28%" r="72%">
                  <stop offset="0" stopColor="#fff9d9" />
                  <stop offset="0.3" stopColor="#ffc66f" />
                  <stop offset="0.72" stopColor="#ff835d" />
                  <stop offset="1" stopColor="#a83f42" />
                </radialGradient>
                <pattern id="projectile-grid" width="73" height="61.33" patternUnits="userSpaceOnUse">
                  <path d="M 73 0 L 0 0 0 61.33" fill="none" stroke="rgba(113,151,211,.12)" strokeWidth="1" />
                </pattern>
              </defs>

              <rect x="0" y="0" width="1000" height="500" rx="18" fill="url(#projectile-sky)" />
              <rect x={PLOT.left} y={PLOT.top} width={PLOT.right - PLOT.left} height={PLOT.ground - PLOT.top} fill="url(#projectile-grid)" />

              {[0, .25, .5, .75, 1].map((fraction) => {
                const height = initialHeight * fraction
                return (
                <g key={height} className="projectile-axis-label">
                  <line x1={PLOT.left - 6} x2={PLOT.left} y1={yToSvg(height)} y2={yToSvg(height)} />
                  <text x={PLOT.left - 13} y={yToSvg(height) + 4} textAnchor="end">{format(height, 1)}</text>
                </g>
                )
              })}
              {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
                <g key={fraction} className="projectile-axis-label">
                  <line x1={xToSvg(range * fraction)} x2={xToSvg(range * fraction)} y1={PLOT.ground} y2={PLOT.ground + 6} />
                  <text x={xToSvg(range * fraction)} y={PLOT.ground + 24} textAnchor="middle">{format(range * fraction, 1)}</text>
                </g>
              ))}
              <text className="projectile-axis-title" x="22" y="64">y / m</text>
              <text className="projectile-axis-title" x={PLOT.right - 40} y="477">x / m</text>

              <line className="projectile-ground" x1={PLOT.left - 20} x2={PLOT.right + 12} y1={PLOT.ground} y2={PLOT.ground} />
              <path className="projectile-trajectory" d={trajectoryPath} />

              {samples.filter((sample) => sample.time <= current.time + 1e-6).map((sample, index) => {
                const ghostX = xToSvg(sample.x)
                const ghostY = yToSvg(sample.y)
                const calloutWidth = 184
                const calloutHeight = 72
                const calloutX = ghostX > PLOT.right - calloutWidth - 28
                  ? ghostX - calloutWidth - 16
                  : ghostX + 16
                const calloutY = ghostY < PLOT.top + calloutHeight + 12
                  ? ghostY + 14
                  : ghostY - calloutHeight - 10
                const isSelected = selectedTrailIndex === index
                const accessibleLabel = `运动残影 ${index + 1}：距地高度 ${format(sample.y, 1)} 米，水平位移 ${format(sample.x, 1)} 米，时间 ${format(sample.time, 2)} 秒`
                const toggleSelection = () => setSelectedTrailIndex((currentIndex) => currentIndex === index ? null : index)
                return (
                  <g
                    key={sample.time}
                    className={`projectile-ghost-group${isSelected ? ' is-selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={accessibleLabel}
                    aria-pressed={isSelected}
                    onClick={toggleSelection}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        toggleSelection()
                      }
                    }}
                  >
                    <circle className="projectile-ghost-hitarea" cx={ghostX} cy={ghostY} r="14" />
                    <circle className="projectile-ghost" cx={ghostX} cy={ghostY} r={index === 0 ? 5 : 6} style={{ opacity: isSelected ? 1 : 0.38 + (index / samples.length) * 0.42 }} />
                    {isSelected && (
                      <g className="projectile-ghost-readout" data-testid={`projectile-trail-readout-${index}`}>
                        <line x1={ghostX} y1={ghostY} x2={calloutX + (calloutX > ghostX ? 0 : calloutWidth)} y2={calloutY + calloutHeight / 2} />
                        <rect x={calloutX} y={calloutY} width={calloutWidth} height={calloutHeight} rx="9" />
                        <text x={calloutX + 12} y={calloutY + 20}>距地高度 {format(sample.y, 1)} m</text>
                        <text x={calloutX + 12} y={calloutY + 40}>水平位移 {format(sample.x, 1)} m</text>
                        <text x={calloutX + 12} y={calloutY + 60}>时间 {format(sample.time, 2)} s</text>
                      </g>
                    )}
                  </g>
                )
              })}

              {showHorizontal && (
                <g className="projectile-projection projectile-projection--horizontal">
                  <line ref={horizontalLineRef} x1={launchX} x2={launchX} y1={PLOT.top} y2={launchY} />
                  <circle ref={horizontalPointRef} cx={launchX} cy={PLOT.top} r="10" />
                  <text ref={horizontalLabelRef} x={Math.min(launchX + 15, 880)} y={PLOT.top - 15}>水平匀速</text>
                </g>
              )}

              {showVertical && (
                <g className="projectile-projection projectile-projection--vertical">
                  <line ref={verticalLineRef} x1={PLOT.left} x2={launchX} y1={launchY} y2={launchY} />
                  <circle ref={verticalPointRef} cx={PLOT.left} cy={launchY} r="10" />
                  <text ref={verticalLabelRef} x={PLOT.left + 16} y={Math.max(launchY - 14, 88)}>自由落体</text>
                </g>
              )}

              <g ref={ballRef} className="projectile-main-ball" transform={`translate(${launchX} ${launchY})`}>
                <circle className="projectile-main-ball__halo" r="20" />
                <circle className="projectile-main-ball__body" r="13" />
                <circle className="projectile-main-ball__highlight" cx="-4" cy="-5" r="3.2" />
              </g>

              <g className="projectile-launch-mark">
                <line x1={PLOT.left} x2={PLOT.left} y1={PLOT.top - 20} y2={PLOT.ground} />
                <text x={PLOT.left + 12} y={PLOT.top + 28}>h = {format(initialHeight, 1)} m</text>
              </g>
            </svg>
          </div>

          <div className="projectile-transport">
            <button type="button" className="projectile-transport__primary" onClick={toggleMotion} aria-label={status === 'running' ? '暂停运动' : '开始运动'}>
              <span aria-hidden="true">{status === 'running' ? 'Ⅱ' : '▶'}</span>
              {status === 'running' ? '暂停' : status === 'landed' ? '再次发射' : '开始'}
            </button>
            <button type="button" onClick={() => resetMotion()} aria-label="复位运动"><span aria-hidden="true">↺</span>复位</button>
            <div className="projectile-speed" aria-label="播放速度">
              <span>速度</span>
              {SPEED_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={speed === option ? 'is-active' : ''}
                  onClick={() => setSpeed(option)}
                  aria-pressed={speed === option}
                >
                  {option}×
                </button>
              ))}
            </div>
            <div className="projectile-progress" aria-hidden="true"><i ref={progressRef} style={{ width: '0%' }} /></div>
          </div>
        </section>

        <aside className="projectile-controls" aria-label="平抛运动参数">
          <div className="projectile-controls__heading">
            <div><span>实验参数</span><small>改变参数后自动复位</small></div>
            <b>h = {format(initialHeight, 1)} m</b>
          </div>

          <label className="projectile-range">
            <span><b>水平初速度</b><output>{format(initialSpeed, 1)} m/s</output></span>
            <input
              aria-label="水平初速度"
              type="range"
              min="4"
              max="30"
              step="0.5"
              value={initialSpeed}
              onChange={(event) => changeInitialSpeed(Number(event.target.value))}
            />
            <small>决定水平方向的匀速运动与最终射程</small>
          </label>

          <label className="projectile-range projectile-range--height">
            <span><b>释放高度</b><output>{format(initialHeight, initialHeight % 1 === 0 ? 0 : 1)} m</output></span>
            <input
              aria-label="释放高度"
              type="range"
              min="5"
              max="50"
              step="0.5"
              value={initialHeight}
              onChange={(event) => changeHeight(Number(event.target.value))}
            />
            <small>改变小球离开平台时的竖直高度</small>
          </label>

          <label className="projectile-range projectile-range--gravity">
            <span><b>重力加速度</b><output>{format(gravity, 1)} m/s²</output></span>
            <input
              aria-label="重力加速度"
              type="range"
              min="1.6"
              max="15"
              step="0.1"
              value={gravity}
              onChange={(event) => changeGravity(Number(event.target.value))}
            />
            <small>只改变竖直方向的自由落体运动</small>
          </label>

          <label className="projectile-range projectile-range--axis">
            <span><b>xy 轴比例</b><output>{axisRatio.toFixed(2)} : 1</output></span>
            <input
              aria-label="xy轴比例"
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              value={axisRatio}
              onChange={(event) => setAxisRatio(Number(event.target.value))}
            />
            <small>1:1 表示横纵坐标每米使用相同画面尺度</small>
          </label>

          <div className="projectile-projection-toggles">
            <span>运动分解</span>
            <button type="button" aria-label="水平匀速投影" aria-pressed={showHorizontal} onClick={() => setShowHorizontal((value) => !value)}>
              <i className="is-horizontal" aria-hidden="true" />
              <span><b>水平匀速投影</b><small>显示竖直辅助线</small></span>
            </button>
            <button type="button" aria-label="竖直自由落体投影" aria-pressed={showVertical} onClick={() => setShowVertical((value) => !value)}>
              <i className="is-vertical" aria-hidden="true" />
              <span><b>竖直自由落体</b><small>显示水平辅助线</small></span>
            </button>
          </div>

          <div className="projectile-note">
            <span>等时间残影</span>
            <p>相邻残影的时间间隔相同；点击任一黄色残影点，可读取该时刻的距地高度、水平位移与时间。</p>
          </div>
        </aside>
      </div>

      <section className="projectile-metrics" aria-label="运动测量值">
        <div><span>释放高度</span><strong>{format(initialHeight, 1)} m</strong><small>h</small></div>
        <div><span>飞行时间</span><strong data-testid="projectile-flight-time">{format(duration)} s</strong><small>√(2h/g)</small></div>
        <div><span>水平射程</span><strong data-testid="projectile-range">{format(range)} m</strong><small>v₀t</small></div>
        <div><span>水平速度 vₓ</span><strong data-testid="projectile-vx">{format(current.vx)} m/s</strong><small>恒定</small></div>
        <div><span>竖直速度 vᵧ</span><strong>{format(current.vy)} m/s</strong><small>−gt</small></div>
      </section>
    </article>
  )
}

export default ProjectileLab
