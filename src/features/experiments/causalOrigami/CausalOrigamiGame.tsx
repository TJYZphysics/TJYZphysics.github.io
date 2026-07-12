import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Play, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import './causalOrigami.css'
import { DEFAULT_LEVEL, eventKey, placeFold, runLevel, type Direction, type EventPoint } from './model'

const CELL = 64
const PAD = 32
const BOARD_SIZE = PAD * 2 + 8 * CELL

export function CausalOrigamiGame() {
  const [folds, setFolds] = useState<Map<string, Direction>>(new Map())
  const [direction, setDirection] = useState<Direction>(1)
  const [result, setResult] = useState<ReturnType<typeof runLevel> | null>(null)
  const [history, setHistory] = useState<Map<string, Direction>[]>([])
  const [message, setMessage] = useState('选择偏转方向，再点击时空事件放置折点。')
  const level = DEFAULT_LEVEL
  const outcome = useMemo(() => result, [result])
  const points = Array.from({ length: level.duration + 1 }, (_, t) =>
    Array.from({ length: level.width }, (_, x) => ({ x, t })),
  ).flat()

  const edit = (point: EventPoint) => {
    if (point.t === 0 || eventKey(point) === eventKey(level.target)) return
    const key = eventKey(point)
    if (folds.has(key)) {
      setHistory((items) => [...items, new Map(folds)])
      const next = new Map(folds); next.delete(key); setFolds(next)
      setMessage('折点已移除。'); setResult(null); return
    }
    const placed = placeFold(folds, point, direction, level)
    if (!placed.ok) {
      setMessage(placed.reason === 'forbidden' ? '红色禁区无法折叠。' : '折点额度已用完。先移除一个折点。')
      return
    }
    setHistory((items) => [...items, new Map(folds)])
    setFolds(placed.folds); setResult(null); setMessage(`折点已放置：信号将向${direction === 1 ? '右' : '左'}偏转。`)
  }

  const run = () => {
    const next = runLevel(level, folds); setResult(next)
    if (next.success) setMessage('会合成功：两束信号在目标事件共享同一个“现在”。')
    else if (!next.legal && next.reason === 'forbidden') setMessage(`因果路径无效：信号在时间 ${next.violation?.t}、位置 ${next.violation?.x} 进入了禁区。`)
    else if (!next.legal) setMessage(`因果路径无效：信号在时间 ${next.violation?.t} 越出了时空纸面。`)
    else setMessage('尚未会合。观察轨迹，尝试让信号绕开禁区并延迟抵达。')
  }
  const clear = () => { if (folds.size) setHistory((items) => [...items, new Map(folds)]); setFolds(new Map()); setResult(null); setMessage('折点已清空，可以撤销此操作。') }
  const undo = () => {
    const previous = history.at(-1)
    if (!previous) return
    setFolds(new Map(previous)); setHistory((items) => items.slice(0, -1)); setResult(null); setMessage('已撤销最近一次编辑。')
  }
  const reset = () => { setFolds(new Map()); setHistory([]); setDirection(1); setResult(null); setMessage('关卡已重新开始。') }

  const svgPoint = (point: EventPoint) => `${PAD + point.x * CELL},${PAD + point.t * CELL}`
  return <section className="causal-game" aria-labelledby="causal-title">
    <header className="causal-game__header">
      <div><span className="causal-game__eyebrow">ORIGINAL EXPERIMENT · 03</span><h2 id="causal-title">因果折纸</h2><p>折叠局部光锥，让分离的信号在指定事件会合。</p></div>
      <div className="causal-game__budget" aria-label={`剩余折点 ${level.budget - folds.size}`}><strong>{level.budget - folds.size}</strong><span>折点余量</span></div>
    </header>

    <div className="causal-game__toolbar" aria-label="折点工具">
      <div className="causal-game__direction" role="group" aria-label="偏转方向">
        <button className={direction === -1 ? 'is-active' : ''} onClick={() => setDirection(-1)} aria-pressed={direction === -1}><ChevronLeft /> 向左</button>
        <button className={direction === 1 ? 'is-active' : ''} onClick={() => setDirection(1)} aria-pressed={direction === 1}>向右 <ChevronRight /></button>
      </div>
      <button className="causal-game__action" onClick={run}><Play />运行信号</button>
      <button className="causal-game__icon" onClick={undo} disabled={!history.length} title="撤销最近操作"><Undo2 /><span>撤销</span></button>
      <button className="causal-game__icon" onClick={clear} title="清空折点"><Trash2 /><span>清空</span></button>
      <button className="causal-game__icon" onClick={reset} title="重新开始"><RotateCcw /><span>重新开始</span></button>
    </div>

    <div className="causal-game__stage-wrap">
      <div className="causal-game__stage" style={{ width: '100%', maxWidth: BOARD_SIZE, aspectRatio: '1' }}>
        <svg className="causal-game__paths" viewBox={`0 0 ${PAD * 2 + (level.width - 1) * CELL} ${PAD * 2 + level.duration * CELL}`} aria-hidden="true">
          {outcome?.paths.map((path, index) => <polyline key={index} className={`signal signal--${index}`} points={path.map(svgPoint).join(' ')} />)}
        </svg>
        {points.map((point) => {
          const key = eventKey(point), fold = folds.get(key), forbidden = level.forbidden.some((p) => eventKey(p) === key)
          const target = key === eventKey(level.target), source = level.starts.some(({ point: p }) => eventKey(p) === key)
          return <button key={key} className={`causal-event ${forbidden ? 'is-forbidden' : ''} ${target ? 'is-target' : ''} ${source ? 'is-source' : ''} ${fold ? 'has-fold' : ''}`}
            style={{ left: `${((PAD + point.x * CELL) / BOARD_SIZE) * 100}%`, top: `${((PAD + point.t * CELL) / BOARD_SIZE) * 100}%` }} onClick={() => edit(point)} aria-disabled={forbidden || source || target}
            aria-label={forbidden ? `禁区，时间 ${point.t} 位置 ${point.x}` : target ? '目标会合事件' : source ? '信号源' : fold ? `移除折点，当前向${fold === 1 ? '右' : '左'}` : `在时间 ${point.t} 位置 ${point.x} 放置折点`}>
            {target ? <span>◎</span> : source ? <span>●</span> : fold ? <span>{fold === 1 ? '↘' : '↙'}</span> : forbidden ? <span>×</span> : null}
          </button>
        })}
      </div>
    </div>
    <div className={`causal-game__feedback ${outcome?.success ? 'is-success' : ''}`} role="status" aria-live="polite">{message}</div>
    {outcome && <p className="sr-only">{outcome.paths.map((path, index) => `信号 ${index + 1} 路径：${path.map((point) => `时间 ${point.t} 位置 ${point.x}`).join('，')}`).join('。')}。{message}</p>}
    <details className="causal-game__rules"><summary>实验规则</summary><ol><li>信号每前进一刻，必须横移一格——这就是离散光锥。</li><li>折点会把经过此处的信号改向；再次点击可移除。</li><li>禁区不能折叠。使用不超过四个折点，让两束信号同时抵达金色目标。</li></ol></details>
  </section>
}

export default CausalOrigamiGame
