import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

import {
  initialVelocity,
  positionDomain,
  predictFirstMeeting,
  simulationDuration,
  stateAt,
  velocityDomain,
  type Direction,
  type ValueDomain,
  type VehicleParameters,
} from './model'
import './pursuit.css'

type RunState = 'idle' | 'running' | 'paused' | 'complete'
type ChartKind = 'position' | 'velocity'

interface VehicleControls {
  speed: number
  direction: Direction
  acceleration: number
}

interface RangeControlProps {
  id: string
  label: string
  ariaLabel?: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  disabled?: boolean
  onChange: (value: number) => void
}

interface MotionChartProps {
  kind: ChartKind
  vehicleA: VehicleParameters
  vehicleB: VehicleParameters
  currentTime: number
  duration: number
}

const DEFAULT_A: VehicleControls = { speed: 8, direction: 1, acceleration: 0.4 }
const DEFAULT_B: VehicleControls = { speed: 4, direction: 1, acceleration: 0 }
const DEFAULT_DISTANCE = 40
const PLAYBACK_SPEEDS = [0.5, 1, 2] as const
const CHART_WIDTH = 620
const CHART_HEIGHT = 230
const CHART_SAMPLE_COUNT = 48
const CHART_MARGIN = { top: 20, right: 18, bottom: 35, left: 56 }

function formatNumber(value: number, digits = 1) {
  const normalized = Math.abs(value) < 1e-8 ? 0 : value
  return normalized.toFixed(digits)
}

function formatSigned(value: number, digits = 1) {
  const normalized = Math.abs(value) < 1e-8 ? 0 : value
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(digits)}`
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      {children}
    </svg>
  )
}

function RangeControl({
  id,
  label,
  ariaLabel = label,
  value,
  min,
  max,
  step,
  unit,
  disabled = false,
  onChange,
}: RangeControlProps) {
  const progress = ((value - min) / (max - min)) * 100
  const digits = step < 1 ? 1 : 0

  return (
    <label className="pursuit-range" htmlFor={id}>
      <span className="pursuit-range__heading">
        <span>{label}</span>
        <output htmlFor={id}>{formatNumber(value, digits)} {unit}</output>
      </span>
      <input
        id={id}
        aria-label={ariaLabel}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--pursuit-range-progress': `${progress}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function DirectionControl({
  vehicle,
  direction,
  disabled,
  onChange,
}: {
  vehicle: string
  direction: Direction
  disabled: boolean
  onChange: (direction: Direction) => void
}) {
  return (
    <div className="pursuit-direction">
      <span>初速度方向</span>
      <div role="group" aria-label={`${vehicle}初速度方向`}>
        <button
          type="button"
          className={direction === -1 ? 'is-active' : ''}
          aria-pressed={direction === -1}
          disabled={disabled}
          onClick={() => onChange(-1)}
        >
          ← 向左
        </button>
        <button
          type="button"
          className={direction === 1 ? 'is-active' : ''}
          aria-pressed={direction === 1}
          disabled={disabled}
          onClick={() => onChange(1)}
        >
          向右 →
        </button>
      </div>
    </div>
  )
}

function makeTicks(domain: ValueDomain, count = 5) {
  return Array.from({ length: count }, (_, index) => (
    domain.min + ((domain.max - domain.min) * index) / (count - 1)
  ))
}

function makeTimes(duration: number, count = 90) {
  if (count <= 1) return [duration]
  return Array.from({ length: count }, (_, index) => (duration * index) / (count - 1))
}

function linePath(
  times: readonly number[],
  valueAt: (time: number) => number,
  mapX: (time: number) => number,
  mapY: (value: number) => number,
) {
  return times.map((time, index) => (
    `${index === 0 ? 'M' : 'L'} ${mapX(time).toFixed(2)} ${mapY(valueAt(time)).toFixed(2)}`
  )).join(' ')
}

function MotionChart({
  kind,
  vehicleA,
  vehicleB,
  currentTime,
  duration,
}: MotionChartProps) {
  const chartModel = useMemo(() => {
    const domain = kind === 'position'
      ? positionDomain([vehicleA, vehicleB], duration)
      : velocityDomain([vehicleA, vehicleB], duration)
    const plotWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right
    const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom
    const mapX = (time: number) => CHART_MARGIN.left + (time / duration) * plotWidth
    const mapY = (value: number) => (
      CHART_MARGIN.top + ((domain.max - value) / (domain.max - domain.min)) * plotHeight
    )
    const valueA = (time: number) => stateAt(vehicleA, time)[kind]
    const valueB = (time: number) => stateAt(vehicleB, time)[kind]
    const allTimes = makeTimes(duration, CHART_SAMPLE_COUNT)
    return {
      domain,
      mapX,
      mapY,
      valueA,
      valueB,
      futurePathA: linePath(allTimes, valueA, mapX, mapY),
      futurePathB: linePath(allTimes, valueB, mapX, mapY),
      yTicks: makeTicks(domain),
      timeTicks: Array.from({ length: 6 }, (_, index) => (duration * index) / 5),
    }
  }, [duration, kind, vehicleA, vehicleB])
  const { domain, mapX, mapY, valueA, valueB } = chartModel
  const elapsedEnd = Math.min(currentTime, duration)
  const elapsedCount = Math.max(2, Math.ceil((elapsedEnd / duration) * CHART_SAMPLE_COUNT))
  const elapsedTimes = elapsedEnd <= 0
    ? [0]
    : makeTimes(elapsedEnd, elapsedCount)
  const scanX = mapX(elapsedEnd)
  const unit = kind === 'position' ? 'm' : 'm/s'
  const title = kind === 'position' ? 'x–t 位置图像' : 'v–t 速度图像'
  const chartLabel = kind === 'position' ? '位置' : '速度'

  return (
    <section className="pursuit-chart" aria-labelledby={`pursuit-${kind}-chart-title`}>
      <header>
        <div>
          <h3 id={`pursuit-${kind}-chart-title`}>{title}</h3>
          <span>{chartLabel} / {unit}</span>
        </div>
        <strong>t = {formatNumber(currentTime, 2)} s</strong>
      </header>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={`${title}，扫描线位于 ${formatNumber(currentTime, 2)} 秒`}
      >
        <defs>
          <linearGradient id={`pursuit-scan-${kind}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.18" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="0.82" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {chartModel.yTicks.map((tick) => (
          <g key={`y-${tick}`} className="pursuit-chart__grid-line">
            <line x1={CHART_MARGIN.left} x2={CHART_WIDTH - CHART_MARGIN.right} y1={mapY(tick)} y2={mapY(tick)} />
            <text x={CHART_MARGIN.left - 9} y={mapY(tick) + 4} textAnchor="end">
              {formatNumber(tick, Math.abs(domain.max - domain.min) < 10 ? 1 : 0)}
            </text>
          </g>
        ))}

        {chartModel.timeTicks.map((tick) => (
          <g key={`x-${tick}`} className="pursuit-chart__grid-line">
            <line x1={mapX(tick)} x2={mapX(tick)} y1={CHART_MARGIN.top} y2={CHART_HEIGHT - CHART_MARGIN.bottom} />
            <text x={mapX(tick)} y={CHART_HEIGHT - 13} textAnchor="middle">
              {formatNumber(tick, duration < 12 ? 1 : 0)}
            </text>
          </g>
        ))}

        <line
          className="pursuit-chart__zero"
          x1={CHART_MARGIN.left}
          x2={CHART_WIDTH - CHART_MARGIN.right}
          y1={mapY(0)}
          y2={mapY(0)}
        />

        <path className="pursuit-chart__future pursuit-chart__future--a" d={chartModel.futurePathA} />
        <path className="pursuit-chart__future pursuit-chart__future--b" d={chartModel.futurePathB} />
        <path className="pursuit-chart__line pursuit-chart__line--a" d={linePath(elapsedTimes, valueA, mapX, mapY)} />
        <path className="pursuit-chart__line pursuit-chart__line--b" d={linePath(elapsedTimes, valueB, mapX, mapY)} />

        <line
          className="pursuit-chart__scan"
          data-testid={`pursuit-scanline-${kind}`}
          data-simulation-time={currentTime.toFixed(4)}
          x1={scanX}
          x2={scanX}
          y1={CHART_MARGIN.top - 2}
          y2={CHART_HEIGHT - CHART_MARGIN.bottom + 2}
          stroke={`url(#pursuit-scan-${kind})`}
        />
        <circle className="pursuit-chart__point pursuit-chart__point--a" cx={scanX} cy={mapY(valueA(elapsedEnd))} r="4.5" />
        <circle className="pursuit-chart__point pursuit-chart__point--b" cx={scanX} cy={mapY(valueB(elapsedEnd))} r="4.5" />
        <text className="pursuit-chart__time-label" x={CHART_WIDTH - CHART_MARGIN.right} y={CHART_HEIGHT - 13} textAnchor="end">t / s</text>
      </svg>
    </section>
  )
}

function VehiclePanel({
  name,
  color,
  value,
  disabled,
  onChange,
}: {
  name: 'A' | 'B'
  color: 'a' | 'b'
  value: VehicleControls
  disabled: boolean
  onChange: (next: VehicleControls) => void
}) {
  return (
    <div className={`pursuit-vehicle-panel pursuit-vehicle-panel--${color}`}>
      <div className="pursuit-vehicle-panel__title">
        <span><i />小车 {name}</span>
        <strong>v₀ = {formatSigned(initialVelocity({ ...value, initialPosition: 0 }))} m/s</strong>
      </div>
      <RangeControl
        id={`pursuit-speed-${name.toLowerCase()}`}
        label="速度大小"
        ariaLabel={`小车 ${name} 速度大小`}
        value={value.speed}
        min={0}
        max={20}
        step={0.5}
        unit="m/s"
        disabled={disabled}
        onChange={(speed) => onChange({ ...value, speed })}
      />
      <RangeControl
        id={`pursuit-acceleration-${name.toLowerCase()}`}
        label="加速度（向右为正）"
        ariaLabel={`小车 ${name} 加速度`}
        value={value.acceleration}
        min={-5}
        max={5}
        step={0.1}
        unit="m/s²"
        disabled={disabled}
        onChange={(acceleration) => onChange({ ...value, acceleration })}
      />
      <DirectionControl
        vehicle={`小车 ${name}`}
        direction={value.direction}
        disabled={disabled}
        onChange={(direction) => onChange({ ...value, direction })}
      />
    </div>
  )
}

export function PursuitLab() {
  const [carA, setCarA] = useState<VehicleControls>(DEFAULT_A)
  const [carB, setCarB] = useState<VehicleControls>(DEFAULT_B)
  const [initialDistance, setInitialDistance] = useState(DEFAULT_DISTANCE)
  const [playbackSpeed, setPlaybackSpeed] = useState<(typeof PLAYBACK_SPEEDS)[number]>(1)
  const [runState, setRunState] = useState<RunState>('idle')
  const [simulationTime, setSimulationTime] = useState(0)
  const timeRef = useRef(0)
  const playbackSpeedRef = useRef(playbackSpeed)

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed
  }, [playbackSpeed])

  const vehicleA = useMemo<VehicleParameters>(() => ({
    ...carA,
    initialPosition: 0,
  }), [carA])
  const vehicleB = useMemo<VehicleParameters>(() => ({
    ...carB,
    initialPosition: initialDistance,
  }), [carB, initialDistance])
  const meeting = useMemo(
    () => predictFirstMeeting(vehicleA, vehicleB),
    [vehicleA, vehicleB],
  )
  const duration = useMemo(() => simulationDuration(meeting), [meeting])
  const trackDomain = useMemo(
    () => positionDomain([vehicleA, vehicleB], duration),
    [duration, vehicleA, vehicleB],
  )
  const currentA = stateAt(vehicleA, simulationTime)
  const currentB = stateAt(vehicleB, simulationTime)
  const inputsLocked = runState === 'running' || runState === 'paused'
  const hasMet = meeting !== null && simulationTime >= meeting.time
  const relativeDistance = currentB.position - currentA.position
  const span = trackDomain.max - trackDomain.min
  const mapTrack = (position: number) => (
    5 + ((position - trackDomain.min) / span) * 90
  )
  const carAPercent = mapTrack(currentA.position)
  const carBPercent = mapTrack(currentB.position)
  const meetingPercent = meeting && meeting.time <= duration ? mapTrack(meeting.position) : null
  const initialAPercent = mapTrack(vehicleA.initialPosition)
  const initialBPercent = mapTrack(vehicleB.initialPosition)
  const gapLeft = Math.min(initialAPercent, initialBPercent)
  const gapWidth = Math.abs(initialBPercent - initialAPercent)

  const reset = useCallback(() => {
    timeRef.current = 0
    setSimulationTime(0)
    setRunState('idle')
  }, [])

  useEffect(() => {
    if (!inputsLocked) reset()
  }, [carA, carB, initialDistance]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (runState !== 'running') return undefined

    let frameId = 0
    let previousTimestamp: number | undefined
    let lastCommitTimestamp: number | undefined
    const animate = (timestamp: number) => {
      if (previousTimestamp !== undefined) {
        const deltaSeconds = Math.min(0.1, Math.max(0, timestamp - previousTimestamp) / 1000)
        timeRef.current = Math.min(duration, timeRef.current + deltaSeconds * playbackSpeedRef.current)
        if (lastCommitTimestamp === undefined || timestamp - lastCommitTimestamp >= 1000 / 30) {
          setSimulationTime(timeRef.current)
          lastCommitTimestamp = timestamp
        }
        if (timeRef.current >= duration) {
          setSimulationTime(duration)
          setRunState('complete')
          return
        }
      }
      previousTimestamp = timestamp
      frameId = requestAnimationFrame(animate)
    }

    frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [duration, runState])

  const start = () => {
    if (runState === 'complete') {
      timeRef.current = 0
      setSimulationTime(0)
    }
    setRunState('running')
  }

  const statusText = runState === 'idle'
    ? '参数已就绪'
    : runState === 'paused'
      ? '实验已暂停'
      : runState === 'complete'
        ? '本次观测完成'
        : hasMet
          ? '已越过首次相遇点'
          : meeting
            ? '正在接近首次相遇'
            : '按设定状态运动'

  return (
    <section className="pursuit-lab" aria-labelledby="pursuit-title">
      <header className="pursuit-lab__header">
        <div>
          <p className="pursuit-lab__index">KINEMATICS · CONSTANT ACCELERATION</p>
          <h2 id="pursuit-title">追及与相遇实验台</h2>
          <p>用同一条时间轴观察两辆小车的位移、速度与相对距离，扫描线会与跑道状态严格同步。</p>
        </div>
        <div className="pursuit-lab__law" aria-label="恒加速度位移公式">
          <span>解析运动方程</span>
          <strong>x = x₀ + v₀t + ½at²</strong>
        </div>
      </header>

      <div className="pursuit-layout">
        <div className="pursuit-main">
          <section className="pursuit-stage" aria-label="小车运动跑道">
            <div className="pursuit-stage__toolbar">
              <span className={`pursuit-status pursuit-status--${runState}`}>
                <i aria-hidden="true" />{statusText}
              </span>
              <div className="pursuit-stage__clock">
                <span>SIM TIME</span>
                <strong>{formatNumber(simulationTime, 2)} s</strong>
              </div>
            </div>

            <div className="pursuit-track">
              <div className="pursuit-track__sky" aria-hidden="true" />
              <div className="pursuit-track__distance" style={{ left: `${gapLeft}%`, width: `${gapWidth}%` }}>
                <span>{formatNumber(initialDistance, 0)} m</span>
              </div>
              {meetingPercent !== null && (
                <div className="pursuit-track__meeting" style={{ left: `${meetingPercent}%` }} aria-hidden="true">
                  <span>相遇点</span>
                </div>
              )}
              <div className="pursuit-track__road pursuit-track__road--a" aria-hidden="true" />
              <div className="pursuit-track__road pursuit-track__road--b" aria-hidden="true" />

              <div
                className={`pursuit-car pursuit-car--a pursuit-car--${currentA.velocity < 0 ? 'left' : 'right'}`}
                style={{ left: `${carAPercent}%` }}
              >
                <span className="pursuit-car__readout">x={formatNumber(currentA.position, 1)} m · v={formatSigned(currentA.velocity)} m/s</span>
                <span className="pursuit-car__body" aria-hidden="true"><i /><b>A</b><em /><em /></span>
              </div>
              <div
                className={`pursuit-car pursuit-car--b pursuit-car--${currentB.velocity < 0 ? 'left' : 'right'}`}
                style={{ left: `${carBPercent}%` }}
              >
                <span className="pursuit-car__readout">x={formatNumber(currentB.position, 1)} m · v={formatSigned(currentB.velocity)} m/s</span>
                <span className="pursuit-car__body" aria-hidden="true"><i /><b>B</b><em /><em /></span>
              </div>

              <div className="pursuit-track__scale" aria-hidden="true">
                <span>{formatNumber(trackDomain.min, 0)} m</span>
                <span>世界坐标 x</span>
                <span>{formatNumber(trackDomain.max, 0)} m</span>
              </div>
            </div>

            <div className="pursuit-readouts" aria-label="当前运动读数">
              <div><span>小车 A</span><strong>{formatNumber(currentA.position, 2)} m</strong><small>{formatSigned(currentA.velocity, 2)} m/s</small></div>
              <div><span>小车 B</span><strong>{formatNumber(currentB.position, 2)} m</strong><small>{formatSigned(currentB.velocity, 2)} m/s</small></div>
              <div><span>相对位置 xᵦ − xₐ</span><strong>{formatSigned(relativeDistance, 2)} m</strong><small>{hasMet ? '已发生首次相遇' : '正值表示 B 在右侧'}</small></div>
            </div>

            <div className="pursuit-transport" aria-label="实验播放控制">
              <button type="button" className="pursuit-transport__primary" onClick={start} disabled={runState === 'running'}>
                <Icon><path d="M8 5.2 18 12 8 18.8Z" fill="currentColor" /></Icon>
                {runState === 'paused' ? '继续运行' : runState === 'complete' ? '再次运行' : '启动运行'}
              </button>
              <button type="button" onClick={() => setRunState('paused')} disabled={runState !== 'running'}>
                <Icon><path d="M7.5 5.5h3v13h-3zm6 0h3v13h-3z" fill="currentColor" /></Icon>
                暂停
              </button>
              <button type="button" onClick={reset} disabled={runState === 'idle' && simulationTime === 0}>
                <Icon><path d="M4.8 9.2A7.5 7.5 0 1 1 5 15.3M4.8 9.2V4.8m0 4.4h4.4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></Icon>
                复位
              </button>
              <div className="pursuit-speed" role="group" aria-label="播放速度">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    className={playbackSpeed === speed ? 'is-active' : ''}
                    aria-pressed={playbackSpeed === speed}
                    onClick={() => setPlaybackSpeed(speed)}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="pursuit-charts">
            <MotionChart kind="velocity" vehicleA={vehicleA} vehicleB={vehicleB} currentTime={simulationTime} duration={duration} />
            <MotionChart kind="position" vehicleA={vehicleA} vehicleB={vehicleB} currentTime={simulationTime} duration={duration} />
          </div>
        </div>

        <aside className="pursuit-controls" aria-label="追及相遇参数">
          <div className="pursuit-controls__heading">
            <div><span>实验参数</span><small>{inputsLocked ? '运行中已锁定' : '可调节'}</small></div>
            <p>速度大小由方向赋予正负；加速度始终以向右为正。</p>
          </div>

          <VehiclePanel name="A" color="a" value={carA} disabled={inputsLocked} onChange={setCarA} />
          <VehiclePanel name="B" color="b" value={carB} disabled={inputsLocked} onChange={setCarB} />

          <div className="pursuit-distance-control">
            <RangeControl
              id="pursuit-initial-distance"
              label="初始距离"
              value={initialDistance}
              min={5}
              max={120}
              step={5}
              unit="m"
              disabled={inputsLocked}
              onChange={setInitialDistance}
            />
          </div>

          <div className={`pursuit-prediction${meeting ? '' : ' pursuit-prediction--none'}`} role="status" aria-live="polite">
            <span>{meeting ? '首次相遇预测' : '运动趋势判断'}</span>
            {meeting ? (
              <>
                <strong>t = {formatNumber(meeting.time, 2)} s</strong>
                <small>x = {formatNumber(meeting.position, 2)} m</small>
              </>
            ) : (
              <>
                <strong>不会相遇</strong>
                <small>当前恒加速度条件下无非负实数解</small>
              </>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

export default PursuitLab
