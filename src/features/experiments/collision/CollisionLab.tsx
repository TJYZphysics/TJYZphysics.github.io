import {
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

import { calculateTrajectoryPositions, solveCollision } from './collision'
import './collision.css'

type RunState = 'idle' | 'running' | 'paused' | 'complete'

interface ControlProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  disabled: boolean
  onChange: (value: number) => void
}

const COLLISION_POINT = 0.52
const RUN_DURATION_MS = 3800

function formatSigned(value: number, digits = 2) {
  const normalized = Math.abs(value) < 1e-10 ? 0 : value
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(digits)}`
}

function ParameterControl({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onChange,
}: ControlProps) {
  const progress = ((value - min) / (max - min)) * 100

  return (
    <label className="collision-control" htmlFor={id}>
      <span className="collision-control__heading">
        <span>{label}</span>
        <output htmlFor={id}>
          {value.toFixed(step < 1 ? 1 : 0)} {unit}
        </output>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--range-progress': `${progress}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

export function CollisionLab() {
  const [massA, setMassA] = useState(2)
  const [massB, setMassB] = useState(3)
  const [velocityA, setVelocityA] = useState(3.5)
  const [velocityB, setVelocityB] = useState(-1.2)
  const [restitution, setRestitution] = useState(0.82)
  const [runState, setRunState] = useState<RunState>('idle')
  const [hasCollided, setHasCollided] = useState(false)

  const bodyARef = useRef<HTMLDivElement>(null)
  const bodyBRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef(0)
  const collisionReportedRef = useRef(false)

  const result = useMemo(
    () => solveCollision({ massA, massB, velocityA, velocityB, restitution }),
    [massA, massB, velocityA, velocityB, restitution],
  )

  const willCollide = velocityA > velocityB
  const inputsLocked = runState === 'running' || runState === 'paused'
  const energyLossPercent = result.initialKineticEnergy > 0
    ? Math.max(0, (-result.energyDelta / result.initialKineticEnergy) * 100)
    : 0

  const applyProgress = useCallback((progress: number) => {
    const trackWidth = trackRef.current?.clientWidth ?? 600
    const bodyAWidth = (bodyARef.current?.offsetWidth ?? 54) * (0.82 + massA * 0.045)
    const bodyBWidth = (bodyBRef.current?.offsetWidth ?? 54) * (0.82 + massB * 0.045)
    const contactGap = ((bodyAWidth + bodyBWidth) / 2 + 3) / trackWidth * 100
    const contactA = 50 - contactGap / 2
    const contactB = 50 + contactGap / 2
    const { positionA, positionB } = calculateTrajectoryPositions({
      progress,
      collisionPoint: COLLISION_POINT,
      contactA,
      contactB,
      velocityA,
      velocityB,
      finalVelocityA: result.finalVelocityA,
      finalVelocityB: result.finalVelocityB,
    })

    if (bodyARef.current) {
      bodyARef.current.style.left = `${Math.min(94, Math.max(6, positionA))}%`
    }
    if (bodyBRef.current) {
      bodyBRef.current.style.left = `${Math.min(94, Math.max(6, positionB))}%`
    }
  }, [massA, massB, velocityA, velocityB, result.finalVelocityA, result.finalVelocityB])

  const reset = useCallback(() => {
    progressRef.current = 0
    collisionReportedRef.current = false
    setHasCollided(false)
    setRunState('idle')
    applyProgress(0)
  }, [applyProgress])

  useEffect(() => {
    if (!inputsLocked) {
      reset()
    }
  }, [massA, massB, velocityA, velocityB, restitution]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    applyProgress(progressRef.current)
  }, [applyProgress])

  useEffect(() => {
    if (!trackRef.current || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => applyProgress(progressRef.current))
    observer.observe(trackRef.current)
    return () => observer.disconnect()
  }, [applyProgress])

  useEffect(() => {
    if (runState !== 'running') return undefined

    let frame = 0
    let previousTime: number | undefined

    const animate = (time: number) => {
      if (previousTime !== undefined) {
        progressRef.current = Math.min(
          1,
          progressRef.current + (time - previousTime) / RUN_DURATION_MS,
        )
        applyProgress(progressRef.current)

        if (progressRef.current >= COLLISION_POINT && !collisionReportedRef.current) {
          collisionReportedRef.current = true
          setHasCollided(true)
        }

        if (progressRef.current >= 1) {
          setRunState('complete')
          return
        }
      }

      previousTime = time
      frame = requestAnimationFrame(animate)
    }

    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [applyProgress, runState])

  const start = () => {
    if (!willCollide) return
    if (runState === 'complete') {
      progressRef.current = 0
      collisionReportedRef.current = false
      setHasCollided(false)
      applyProgress(0)
    }
    setRunState('running')
  }

  const resultMessage = !willCollide
    ? '物体 A 的速度必须大于物体 B，二者才会在一维轨道上接近并碰撞。'
    : runState === 'complete'
      ? restitution === 0
        ? `完全非弹性碰撞完成。两物体以 ${formatSigned(result.finalVelocityA)} m/s 的共同速度运动，损失的动能转化为形变与内能。`
        : restitution === 1
          ? `弹性碰撞完成。系统总动量与总动能均守恒，质量差决定了速度交换的比例。`
          : `碰撞完成。总动量守恒，系统损失 ${energyLossPercent.toFixed(1)}% 的初始动能；恢复系数越小，形变与内能占比越高。`
      : runState === 'paused'
        ? hasCollided
          ? '已在碰撞后暂停。继续运行可观察两物体按碰后速度分离。'
          : '已在碰撞前暂停。参数保持锁定，继续运行即可恢复实验。'
        : hasCollided
          ? '冲量已完成传递，正在观察碰撞后的运动。'
          : '调整参数后开始实验。速度正方向为向右，负方向为向左。'

  return (
    <section className="collision-lab" aria-labelledby="collision-title">
      <header className="collision-lab__header">
        <div>
          <p className="collision-lab__index">EXPERIMENT 02</p>
          <h2 id="collision-title">一维碰撞实验台</h2>
          <p>改变质量、初速度与恢复系数，观察冲量如何在两个物体间重新分配。</p>
        </div>
        <div className="collision-lab__law" aria-label="碰撞遵循的物理规律">
          <span>守恒量</span>
          <strong>Σp<sub>前</sub> = Σp<sub>后</sub></strong>
        </div>
      </header>

      <div className="collision-lab__workspace">
        <div className="collision-stage" data-collided={hasCollided}>
          <div className="collision-stage__readout">
            <span className={`collision-status collision-status--${runState}`}>
              <i aria-hidden="true" />
              {runState === 'idle' && '准备就绪'}
              {runState === 'running' && (hasCollided ? '碰后运动' : '正在接近')}
              {runState === 'paused' && '实验暂停'}
              {runState === 'complete' && '测量完成'}
            </span>
            <span>e = {restitution.toFixed(2)}</span>
          </div>

          <div ref={trackRef} className="collision-track" aria-label="一维碰撞动画区域">
            <div className="collision-track__grid" aria-hidden="true" />
            <div className="collision-track__axis" aria-hidden="true">
              <span>−x</span>
              <span>0</span>
              <span>+x</span>
            </div>
            <div className="collision-impact" aria-hidden="true" />

            <div
              ref={bodyARef}
              className="collision-body collision-body--a"
              style={{ '--body-scale': 0.82 + massA * 0.045 } as CSSProperties}
            >
              <span className="collision-body__velocity">
                {formatSigned(hasCollided ? result.finalVelocityA : velocityA)} m/s
              </span>
              <span className="collision-body__mass">A · {massA.toFixed(1)} kg</span>
            </div>

            <div
              ref={bodyBRef}
              className="collision-body collision-body--b"
              style={{ '--body-scale': 0.82 + massB * 0.045 } as CSSProperties}
            >
              <span className="collision-body__velocity">
                {formatSigned(hasCollided ? result.finalVelocityB : velocityB)} m/s
              </span>
              <span className="collision-body__mass">B · {massB.toFixed(1)} kg</span>
            </div>
          </div>

          <div className="collision-transport" aria-label="实验控制按钮">
            <button type="button" onClick={start} disabled={!willCollide || runState === 'running'}>
              <Play size={17} fill="currentColor" aria-hidden="true" />
              {runState === 'paused' ? '继续' : runState === 'complete' ? '再次运行' : '开始'}
            </button>
            <button
              type="button"
              className="collision-transport__secondary"
              onClick={() => setRunState('paused')}
              disabled={runState !== 'running'}
            >
              <Pause size={17} fill="currentColor" aria-hidden="true" />
              暂停
            </button>
            <button
              type="button"
              className="collision-transport__secondary"
              onClick={reset}
              disabled={runState === 'idle' && progressRef.current === 0}
            >
              <RotateCcw size={17} aria-hidden="true" />
              重置
            </button>
          </div>
        </div>

        <aside className="collision-panel" aria-label="碰撞参数">
          <div className="collision-panel__title">
            <span>实验参数</span>
            <span>{inputsLocked ? '运行中已锁定' : '可调整'}</span>
          </div>
          <ParameterControl id="mass-a" label="物体 A 质量" value={massA} min={0.5} max={6} step={0.1} unit="kg" disabled={inputsLocked} onChange={setMassA} />
          <ParameterControl id="velocity-a" label="物体 A 初速度" value={velocityA} min={-5} max={5} step={0.1} unit="m/s" disabled={inputsLocked} onChange={setVelocityA} />
          <ParameterControl id="mass-b" label="物体 B 质量" value={massB} min={0.5} max={6} step={0.1} unit="kg" disabled={inputsLocked} onChange={setMassB} />
          <ParameterControl id="velocity-b" label="物体 B 初速度" value={velocityB} min={-5} max={5} step={0.1} unit="m/s" disabled={inputsLocked} onChange={setVelocityB} />
          <ParameterControl id="restitution" label="恢复系数" value={restitution} min={0} max={1} step={0.01} unit="" disabled={inputsLocked} onChange={setRestitution} />

          <div className="collision-panel__legend">
            <span><i className="collision-panel__swatch collision-panel__swatch--a" />物体 A</span>
            <span><i className="collision-panel__swatch collision-panel__swatch--b" />物体 B</span>
          </div>
        </aside>
      </div>

      <div className="collision-results">
        <div className="collision-velocity-table">
          <div className="collision-velocity-table__head">
            <span>速度测量</span>
            <span>碰撞前</span>
            <span>碰撞后</span>
          </div>
          <div>
            <span><i className="collision-panel__swatch collision-panel__swatch--a" />物体 A</span>
            <strong>{formatSigned(velocityA)} m/s</strong>
            <strong>{formatSigned(result.finalVelocityA)} m/s</strong>
          </div>
          <div>
            <span><i className="collision-panel__swatch collision-panel__swatch--b" />物体 B</span>
            <strong>{formatSigned(velocityB)} m/s</strong>
            <strong>{formatSigned(result.finalVelocityB)} m/s</strong>
          </div>
        </div>

        <div className="collision-metric">
          <span>总动量</span>
          <strong>{formatSigned(result.finalMomentum)} kg·m/s</strong>
          <small>变化量 {formatSigned(result.momentumDelta, 6)}</small>
        </div>
        <div className="collision-metric">
          <span>系统动能</span>
          <strong>{result.finalKineticEnergy.toFixed(2)} J</strong>
          <small>变化量 {formatSigned(result.energyDelta)} J</small>
        </div>
      </div>

      <div className={`collision-explanation${!willCollide ? ' collision-explanation--warning' : ''}`} role="status" aria-live="polite">
        <span aria-hidden="true">{willCollide ? 'Δ' : '!'}</span>
        <p>{resultMessage}</p>
      </div>
    </section>
  )
}

export default CollisionLab
