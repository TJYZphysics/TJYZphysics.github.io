import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react'
import { Aperture, Move3d, Pause, Play, RotateCcw, Waves } from 'lucide-react'
import { createWaveField, sampleReceiverProfile, waveNumber, waveSpeed, type WaveExperimentMode, type WaveField, type WaveReceiverProfile } from './physics'
import { renderWaveScene, type WaveCamera, type WaveColorTheme, type WaveDisplayMode } from './renderer'
import './wavePropagation.css'

interface RangeControlProps {
  label: string
  symbol: string
  value: number
  minimum: number
  maximum: number
  step: number
  unit: string
  onChange: (value: number) => void
}

function RangeControl({ label, symbol, value, minimum, maximum, step, unit, onChange }: RangeControlProps) {
  return (
    <label className="wave-lab__range">
      <span>{label}<i>{symbol}</i></span>
      <output>{value.toFixed(step < 0.1 ? 2 : 1)} {unit}</output>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

const modeCopy: Record<WaveExperimentMode, { name: string; note: string }> = {
  'double-source': { name: '双点源', note: '两个同相点源叠加，程差决定相长与相消。' },
  'single-slit': { name: '单缝', note: '用惠更斯次级波源积分展示近场与远场衍射。' },
  'double-slit': { name: '双缝', note: '缝宽控制衍射包络，缝距控制干涉条纹。' },
}

const initialCamera: WaveCamera = { yaw: -0.48, pitch: -0.82, zoom: 1, panX: 0, panY: 8 }

function drawReceiverProfile(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  profile: WaveReceiverProfile,
  displayScale: number,
) {
  const padding = { left: 34, right: 14, top: 14, bottom: 20 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const limit = Math.max(displayScale, 0.05)
  const centerY = padding.top + plotHeight / 2
  const xFor = (index: number) => padding.left + (index / (profile.instantaneous.length - 1)) * plotWidth
  const yFor = (value: number) => padding.top + (1 - (value / limit + 1) / 2) * plotHeight
  const strokeValues = (values: Float32Array, color: string, dashed: boolean, sign = 1) => {
    context.beginPath()
    for (let index = 0; index < values.length; index += 1) {
      const x = xFor(index)
      const y = yFor(values[index] * sign)
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.strokeStyle = color
    context.lineWidth = dashed ? 1.2 : 2.1
    context.setLineDash(dashed ? [5, 5] : [])
    context.stroke()
  }

  context.fillStyle = '#071329'
  context.fillRect(0, 0, width, height)
  context.strokeStyle = 'rgba(151,183,229,.16)'
  context.lineWidth = 1
  context.setLineDash([])
  context.beginPath()
  context.moveTo(padding.left, centerY)
  context.lineTo(width - padding.right, centerY)
  context.moveTo(padding.left + plotWidth / 2, padding.top)
  context.lineTo(padding.left + plotWidth / 2, height - padding.bottom)
  context.stroke()
  strokeValues(profile.rmsEnvelope, 'rgba(130,160,203,.58)', true)
  strokeValues(profile.rmsEnvelope, 'rgba(130,160,203,.58)', true, -1)
  context.shadowColor = 'rgba(73,228,207,.42)'
  context.shadowBlur = 8
  strokeValues(profile.instantaneous, '#49e4cf', false)
  context.shadowBlur = 0
  context.setLineDash([])
  context.fillStyle = 'rgba(183,205,235,.68)'
  context.font = '600 9px "SFMono-Regular", Consolas, monospace'
  context.fillText('+A', 7, padding.top + 8)
  context.fillText('−A', 7, height - padding.bottom)
  context.fillText('x / m', width - 42, height - 6)
}

function WaveReceiver({
  field,
  distance,
  frequency,
  timeRef,
  displayScale,
}: {
  field: WaveField
  distance: number
  frequency: number
  timeRef: MutableRefObject<number>
  displayScale: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [readout, setReadout] = useState(() => sampleReceiverProfile(field, distance, timeRef.current, frequency))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return
    let cssWidth = 0
    let cssHeight = 0
    let frameId = 0
    let lastPaint = 0
    let lastReadout = 0
    let lastTime = Number.NEGATIVE_INFINITY
    const paint = (now: number, force = false) => {
      const time = timeRef.current
      if (!force && (time === lastTime || now - lastPaint < 1000 / 60)) return
      const profile = sampleReceiverProfile(field, distance, time, frequency)
      drawReceiverProfile(context, cssWidth, cssHeight, profile, displayScale)
      lastTime = time
      lastPaint = now
      if (force || now - lastReadout >= 100) {
        setReadout(profile)
        lastReadout = now
      }
    }
    const resize = () => {
      const rectangle = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      cssWidth = Math.max(1, rectangle.width)
      cssHeight = Math.max(1, rectangle.height)
      canvas.width = Math.round(cssWidth * dpr)
      canvas.height = Math.round(cssHeight * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      paint(performance.now(), true)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    const animate = (now: number) => {
      if (!document.hidden) paint(now)
      frameId = requestAnimationFrame(animate)
    }
    frameId = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
    }
  }, [displayScale, distance, field, frequency, timeRef])

  return (
    <section className="wave-lab__receiver" aria-label="接收屏波幅读数">
      <div className="wave-lab__receiver-heading">
        <div>
          <span>RECEIVER SCREEN</span>
          <strong>接收屏 · {distance.toFixed(1)} m</strong>
        </div>
        <p>虚线为平均波幅（RMS），实线为当前瞬时波幅。</p>
      </div>
      <div className="wave-lab__receiver-chart">
        <canvas ref={canvasRef} role="img" aria-label={`接收屏距离 ${distance.toFixed(1)} 米，平均波幅 ${readout.averageAmplitude.toFixed(3)} 米，瞬时波幅 ${readout.instantaneousAmplitude.toFixed(3)} 米`} />
      </div>
      <div className="wave-lab__receiver-readouts">
        <div><span>平均波幅（RMS）</span><strong>{readout.averageAmplitude.toFixed(3)} m</strong></div>
        <div><span>瞬时波幅（屏均 RMS）</span><strong>{readout.instantaneousAmplitude.toFixed(3)} m</strong></div>
        <div><span>屏面位置</span><strong>z = {readout.screenZ.toFixed(2)} m</strong></div>
      </div>
    </section>
  )
}

export function WavePropagationLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const timeRef = useRef(0)
  const needsRenderRef = useRef(true)
  const cameraRef = useRef<WaveCamera>({ ...initialCamera })
  const pointerRef = useRef<{ id: number; x: number; y: number; shift: boolean } | null>(null)
  const [mode, setMode] = useState<WaveExperimentMode>('double-source')
  const [amplitude, setAmplitude] = useState(0.2)
  const [frequency, setFrequency] = useState(1)
  const [wavelength, setWavelength] = useState(2)
  const [pointSpacing, setPointSpacing] = useState(4)
  const [slitWidth, setSlitWidth] = useState(1.8)
  const [slitSpacing, setSlitSpacing] = useState(4.2)
  const [sourceDistance, setSourceDistance] = useState(5)
  const [receiverDistance, setReceiverDistance] = useState(6)
  const [displayMode, setDisplayMode] = useState<WaveDisplayMode>('mesh')
  const [colorTheme, setColorTheme] = useState<WaveColorTheme>('neon')
  const [speed, setSpeed] = useState(1)
  const [running, setRunning] = useState(true)
  const [displayTime, setDisplayTime] = useState(0)
  const [dragging, setDragging] = useState(false)

  const runningRef = useRef(running)
  const speedRef = useRef(speed)
  useEffect(() => { runningRef.current = running }, [running])
  useEffect(() => { speedRef.current = speed }, [speed])

  const effectiveSlitSpacing = Math.max(slitSpacing, slitWidth + 0.4)
  const field = useMemo(() => createWaveField({
    mode,
    amplitude,
    wavelength,
    pointSpacing,
    slitWidth,
    slitSpacing: effectiveSlitSpacing,
    sourceDistance,
  }), [amplitude, effectiveSlitSpacing, mode, pointSpacing, slitWidth, sourceDistance, wavelength])
  const receiverMaxDistance = Math.max(1, field.depth - (field.sourcePositions[0]?.z ?? 0))
  const effectiveReceiverDistance = Math.min(receiverDistance, receiverMaxDistance)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return
    let frame = 0
    let previous = performance.now()
    let lastPaint = 0
    let lastReadout = 0
    let cssWidth = 0
    let cssHeight = 0
    const paint = () => {
      if (cssWidth <= 0 || cssHeight <= 0) return
      renderWaveScene(context, cssWidth, cssHeight, field, timeRef.current, frequency, effectiveReceiverDistance, displayMode, colorTheme, cameraRef.current)
      needsRenderRef.current = false
    }
    const resize = () => {
      const rectangle = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      cssWidth = Math.max(1, rectangle.width)
      cssHeight = Math.max(1, rectangle.height)
      canvas.width = Math.round(cssWidth * dpr)
      canvas.height = Math.round(cssHeight * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      needsRenderRef.current = true
      paint()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      cameraRef.current.zoom = Math.min(2.2, Math.max(0.58, cameraRef.current.zoom * Math.exp(-event.deltaY * 0.001)))
      needsRenderRef.current = true
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    resize()
    needsRenderRef.current = true

    const animate = (now: number) => {
      const delta = Math.min((now - previous) / 1000, 0.05)
      previous = now
      if (runningRef.current && !document.hidden) timeRef.current += delta * speedRef.current
      const shouldPaint = runningRef.current || needsRenderRef.current
      if (shouldPaint && now - lastPaint >= 1000 / 34) {
        paint()
        lastPaint = now
      }
      if (now - lastReadout >= 160) {
        setDisplayTime(timeRef.current)
        lastReadout = now
      }
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [colorTheme, displayMode, effectiveReceiverDistance, field, frequency])

  const reset = () => {
    timeRef.current = 0
    needsRenderRef.current = true
    setDisplayTime(0)
    setRunning(false)
  }

  const resetCamera = () => {
    cameraRef.current = { ...initialCamera }
    needsRenderRef.current = true
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, shift: event.shiftKey }
    setDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId) return
    const deltaX = event.clientX - pointer.x
    const deltaY = event.clientY - pointer.y
    if (event.shiftKey || pointer.shift || displayMode === 'projection') {
      cameraRef.current.panX += deltaX
      cameraRef.current.panY += deltaY
    } else {
      cameraRef.current.yaw += deltaX * 0.008
      cameraRef.current.pitch = Math.min(-0.18, Math.max(-1.28, cameraRef.current.pitch + deltaY * 0.008))
    }
    needsRenderRef.current = true
    pointerRef.current = { ...pointer, x: event.clientX, y: event.clientY, shift: event.shiftKey }
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current?.id === event.pointerId) pointerRef.current = null
    setDragging(false)
  }

  const adjustZoom = (factor: number) => {
    cameraRef.current.zoom = Math.min(2.2, Math.max(0.58, cameraRef.current.zoom * factor))
    needsRenderRef.current = true
  }

  const speedValue = waveSpeed(frequency, wavelength)
  const k = waveNumber(wavelength)
  const omega = Math.PI * 2 * frequency

  return (
    <section className="wave-lab" aria-labelledby="wave-lab-title">
      <aside className="wave-lab__console">
        <div className="wave-lab__heading">
          <span><Waves aria-hidden="true" /></span>
          <div><small>EXPERIMENT 05</small><h2 id="wave-lab-title">波的传播</h2><p>二维标量波场，以三维高度曲面呈现。</p></div>
        </div>

        <div className="wave-lab__mode" role="group" aria-label="选择波动实验">
          {(Object.keys(modeCopy) as WaveExperimentMode[]).map((item) => (
            <button key={item} className={mode === item ? 'is-active' : ''} onClick={() => setMode(item)} aria-pressed={mode === item}>{modeCopy[item].name}</button>
          ))}
        </div>
        <p className="wave-lab__mode-note">{modeCopy[mode].note}</p>

        <fieldset className="wave-lab__group">
          <legend>波源参数</legend>
          <RangeControl label="振幅" symbol="A" value={amplitude} minimum={0.05} maximum={0.5} step={0.01} unit="m" onChange={setAmplitude} />
          <RangeControl label="频率" symbol="f" value={frequency} minimum={0.2} maximum={3} step={0.1} unit="Hz" onChange={setFrequency} />
          <RangeControl label="波长" symbol="λ" value={wavelength} minimum={2} maximum={4.5} step={0.1} unit="m" onChange={setWavelength} />
          <div className="wave-lab__derived"><span>派生波速 c = fλ</span><strong>{speedValue.toFixed(2)} m/s</strong></div>
        </fieldset>

        <fieldset className="wave-lab__group">
          <legend>几何参数</legend>
          {mode === 'double-source' && <RangeControl label="点源间距" symbol="d" value={pointSpacing} minimum={0.8} maximum={8} step={0.1} unit="m" onChange={setPointSpacing} />}
          {mode !== 'double-source' && <RangeControl label="缝宽" symbol="a" value={slitWidth} minimum={0.5} maximum={4.5} step={0.1} unit="m" onChange={(value) => { setSlitWidth(value); setSlitSpacing((current) => Math.max(current, value + 0.4)) }} />}
          {mode === 'double-slit' && <RangeControl label="双缝中心距" symbol="d" value={effectiveSlitSpacing} minimum={slitWidth + 0.4} maximum={8} step={0.1} unit="m" onChange={setSlitSpacing} />}
          {mode !== 'double-source' && <RangeControl label="波源距离" symbol="L" value={sourceDistance} minimum={2} maximum={8} step={0.2} unit="m" onChange={setSourceDistance} />}
          <RangeControl label="接收屏距离" symbol="R" value={effectiveReceiverDistance} minimum={1} maximum={receiverMaxDistance} step={0.2} unit="m" onChange={setReceiverDistance} />
        </fieldset>
      </aside>

      <div className="wave-lab__workspace">
        <div className="wave-lab__toolbar">
          <div role="group" aria-label="显示方式">
            <button className={displayMode === 'mesh' ? 'is-active' : ''} onClick={() => setDisplayMode('mesh')}>三维网格</button>
            <button className={displayMode === 'projection' ? 'is-active' : ''} onClick={() => setDisplayMode('projection')}>高度投影</button>
          </div>
          <div role="group" aria-label="色彩主题">
            <button className={colorTheme === 'neon' ? 'is-active' : ''} onClick={() => setColorTheme('neon')}>赛博霓虹</button>
            <button className={colorTheme === 'thermal' ? 'is-active' : ''} onClick={() => setColorTheme('thermal')}>温度分布</button>
            <button className={colorTheme === 'mono' ? 'is-active' : ''} onClick={() => setColorTheme('mono')}>单色等高</button>
          </div>
        </div>

        <div className="wave-lab__canvas-frame">
          <canvas
            ref={canvasRef}
            className={dragging ? 'is-dragging' : ''}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            aria-label="波的传播三维演示画布。拖动旋转，Shift 加拖动平移，滚轮缩放。"
          />
          <div className="wave-lab__canvas-tag"><Aperture aria-hidden="true" /><span>{modeCopy[mode].name}</span></div>
          <div className="wave-lab__camera-hint"><Move3d aria-hidden="true" />拖动旋转 · Shift 拖动平移 · 滚轮缩放</div>
          <div className={`wave-lab__legend wave-lab__legend--${colorTheme}`}><span>−u</span><i /><span>+u</span></div>
        </div>

        <WaveReceiver
          field={field}
          distance={effectiveReceiverDistance}
          frequency={frequency}
          timeRef={timeRef}
          displayScale={field.unitAmplitudeMagnitude * 0.5}
        />

        <div className="wave-lab__transport">
          <div className="wave-lab__actions">
            <button className="wave-lab__primary" onClick={() => { needsRenderRef.current = true; setRunning((value) => !value) }}>{running ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{running ? '暂停' : '运行'}</button>
            <button onClick={reset}><RotateCcw aria-hidden="true" />复位</button>
            <button onClick={resetCamera}><Move3d aria-hidden="true" />重置视角</button>
            <button onClick={() => adjustZoom(0.84)} aria-label="缩小画面">− 缩小</button>
            <button onClick={() => adjustZoom(1.2)} aria-label="放大画面">＋ 放大</button>
          </div>
          <div className="wave-lab__speed" role="group" aria-label="动画速度">
            {[0.5, 1, 2].map((value) => <button key={value} className={speed === value ? 'is-active' : ''} onClick={() => setSpeed(value)}>{value}×</button>)}
          </div>
        </div>

        <div className="wave-lab__readouts">
          <div><span>仿真时间</span><strong>{displayTime.toFixed(2)} s</strong></div>
          <div><span>波数 k = 2π/λ</span><strong>{k.toFixed(3)} rad/m</strong></div>
          <div><span>角频率 ω = 2πf</span><strong>{omega.toFixed(3)} rad/s</strong></div>
          <div><span>绘制说明</span><strong>当前波场归一化显示</strong></div>
        </div>
        <p className="wave-lab__footnote">“温度分布”仅表示颜色映射，不代表真实温度；倍速只改变仿真时钟，不改变 c = fλ。</p>
      </div>
    </section>
  )
}

export default WavePropagationLab
