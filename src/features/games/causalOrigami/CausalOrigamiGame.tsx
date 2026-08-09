import { useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowDownRight,
  ChevronLeft,
  ChevronRight,
  Diamond,
  Play,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react'

import './causalOrigami.css'
import { LIGHT_PATH_LEVELS } from './levels'
import { eventKey, placeTool, runLevel, type EventPoint, type ToolKind } from './model'

const CELL = 64
const PAD = 32
const BOARD_SIZE = PAD * 2 + 8 * CELL

const TOOL_INFO = {
  'turn-left': {
    name: '左偏转器',
    description: '让光线转向左下方',
    icon: ArrowDownLeft,
  },
  'turn-right': {
    name: '右偏转器',
    description: '让光线转向右下方',
    icon: ArrowDownRight,
  },
  splitter: {
    name: '分光棱镜',
    description: '把光线分成左右两支',
    icon: Diamond,
  },
} satisfies Record<ToolKind, {
  name: string
  description: string
  icon: typeof ArrowDownLeft
}>

const TOOL_KINDS = Object.keys(TOOL_INFO) as ToolKind[]

function describePoint(point: EventPoint) {
  return `时间 ${point.t}，位置 ${point.x}`
}

function firstAvailableTool(levelIndex: number): ToolKind {
  const inventory = LIGHT_PATH_LEVELS[levelIndex].inventory
  return TOOL_KINDS.find((tool) => inventory[tool] > 0) ?? 'turn-left'
}

function readyMessage(levelIndex: number) {
  return `第 ${LIGHT_PATH_LEVELS[levelIndex].order} 关已就绪。选择镜片或棱镜，再点击棋盘事件点进行布置。`
}

export function CausalOrigamiGame() {
  const [levelIndex, setLevelIndex] = useState(0)
  const [selectedTool, setSelectedTool] = useState<ToolKind>(() => firstAvailableTool(0))
  const [placements, setPlacements] = useState<Map<string, ToolKind>>(() => new Map())
  const [history, setHistory] = useState<Map<string, ToolKind>[]>([])
  const [result, setResult] = useState<ReturnType<typeof runLevel> | null>(null)
  const [message, setMessage] = useState(() => readyMessage(0))

  const level = LIGHT_PATH_LEVELS[levelIndex]
  const points = useMemo(() => (
    Array.from({ length: level.duration + 1 }, (_, t) => (
      Array.from({ length: level.width }, (_, x) => ({ x, t }))
    )).flat()
  ), [level.duration, level.width])
  const usedInventory = useMemo(() => {
    const used = { 'turn-left': 0, 'turn-right': 0, splitter: 0 }
    placements.forEach((tool) => { used[tool] += 1 })
    return used
  }, [placements])

  const selectLevel = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= LIGHT_PATH_LEVELS.length) return
    setLevelIndex(nextIndex)
    setSelectedTool(firstAvailableTool(nextIndex))
    setPlacements(new Map())
    setHistory([])
    setResult(null)
    setMessage(readyMessage(nextIndex))
  }

  const edit = (point: EventPoint) => {
    const key = eventKey(point)
    const placedTool = placements.get(key)

    if (placedTool) {
      const next = new Map(placements)
      next.delete(key)
      setHistory((items) => [...items, new Map(placements)])
      setPlacements(next)
      setResult(null)
      setMessage(`${TOOL_INFO[placedTool].name}已移除。`)
      return
    }

    const placed = placeTool(placements, { point, tool: selectedTool }, level)
    if (!placed.ok) {
      const failureMessages = {
        outside: '该事件点位于棋盘之外。',
        start: '光源位置不能放置道具。',
        target: '目标事件不能放置道具。',
        forbidden: '红色禁区不能放置道具。',
        inventory: `${TOOL_INFO[selectedTool].name}库存已用完。`,
      }
      setMessage(failureMessages[placed.reason])
      return
    }

    setHistory((items) => [...items, new Map(placements)])
    setPlacements(placed.placements)
    setResult(null)
    setMessage(`${TOOL_INFO[selectedTool].name}已放置在时间 ${point.t}、位置 ${point.x}。`)
  }

  const run = () => {
    const next = runLevel(level, placements)
    setResult(next)
    if (next.success) {
      setMessage('通关成功：两束光都通过合法分支抵达了目标事件。')
    } else if (!next.legal && next.reason === 'forbidden') {
      setMessage(`运行失败：光线在时间 ${next.violation?.t}、位置 ${next.violation?.x} 进入禁区。`)
    } else if (!next.legal) {
      setMessage(`运行失败：光线在时间 ${next.violation?.t} 越出棋盘边界。`)
    } else {
      setMessage('尚未会合：观察光路分支，并调整镜片与棱镜的位置。')
    }
  }

  const clear = () => {
    if (placements.size > 0) setHistory((items) => [...items, new Map(placements)])
    setPlacements(new Map())
    setResult(null)
    setMessage('所有道具已清空。')
  }

  const undo = () => {
    const previous = history.at(-1)
    if (!previous) return
    setPlacements(new Map(previous))
    setHistory((items) => items.slice(0, -1))
    setResult(null)
    setMessage('已撤销最近一次布置。')
  }

  const reset = () => {
    setSelectedTool(firstAvailableTool(levelIndex))
    setPlacements(new Map())
    setHistory([])
    setResult(null)
    setMessage(readyMessage(levelIndex))
  }

  const svgPoint = (point: EventPoint) => `${PAD + point.x * CELL},${PAD + point.t * CELL}`

  return (
    <section className="causal-game" aria-labelledby="causal-title">
      <header className="causal-game__header">
        <div>
          <span className="causal-game__eyebrow">OPTICS EXPERIMENT · 03</span>
          <h2 id="causal-title">光路寻踪</h2>
          <p>布置镜片与棱镜，让两束光在目标事件会合。</p>
        </div>
        <div className="causal-game__level-readout" aria-label={`当前第 ${level.order} 关，难度${level.difficulty}`}>
          <span>LEVEL</span>
          <strong>{String(level.order).padStart(2, '0')}</strong>
          <small>{level.difficulty}</small>
        </div>
      </header>

      <section className="causal-game__level-panel" aria-labelledby="level-picker-title">
        <div className="causal-game__level-copy">
          <div>
            <span id="level-picker-title">关卡选择</span>
            <strong>{level.name}</strong>
          </div>
          <p>{level.hint}</p>
        </div>
        <div className="causal-game__level-grid">
          {LIGHT_PATH_LEVELS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={levelIndex === index ? 'is-active' : ''}
              onClick={() => selectLevel(index)}
              aria-label={`选择第 ${item.order} 关`}
              aria-pressed={levelIndex === index}
              title={`${item.name} · ${item.difficulty}`}
            >
              {String(item.order).padStart(2, '0')}
            </button>
          ))}
        </div>
        <div className="causal-game__level-nav">
          <button type="button" onClick={() => selectLevel(levelIndex - 1)} disabled={levelIndex === 0}>
            <ChevronLeft />上一关
          </button>
          <button type="button" onClick={() => selectLevel(levelIndex + 1)} disabled={levelIndex === LIGHT_PATH_LEVELS.length - 1}>
            下一关<ChevronRight />
          </button>
        </div>
      </section>

      <section className="sr-only" role="region" aria-label="当前关卡布局说明" tabIndex={0}>
        <h3>第 {level.order} 关布局</h3>
        <p>
          {level.starts.map(({ point, direction }, index) => (
            `光源 ${index + 1}：${describePoint(point)}，朝${direction === -1 ? '左下' : '右下'}。`
          )).join(' ')}
        </p>
        <p>目标：{describePoint(level.target)}。</p>
        <p>
          禁区：{level.forbidden.length > 0
            ? level.forbidden.map(describePoint).join('；')
            : '无'}。
        </p>
        <p>
          库存：左偏转器 {level.inventory['turn-left']} 件，右偏转器 {level.inventory['turn-right']} 件，
          分光棱镜 {level.inventory.splitter} 件；最多布置 {level.budget} 件道具。
        </p>
      </section>

      <div className="causal-game__workspace">
        <aside className="causal-game__console" aria-label="光学工具台">
          <div className="causal-game__console-title">
            <span>光学工具台</span>
            <small>{placements.size} 件已布置</small>
          </div>
          <div className="causal-game__tools">
            {TOOL_KINDS.map((tool) => {
              const info = TOOL_INFO[tool]
              const Icon = info.icon
              const remaining = level.inventory[tool] - usedInventory[tool]
              return (
                <button
                  key={tool}
                  type="button"
                  className={`causal-game__tool causal-game__tool--${tool} ${selectedTool === tool ? 'is-active' : ''}`}
                  onClick={() => setSelectedTool(tool)}
                  aria-label={`选择${info.name}，剩余 ${remaining} 件`}
                  aria-pressed={selectedTool === tool}
                  disabled={remaining === 0 && selectedTool !== tool}
                >
                  <span className="causal-game__tool-icon"><Icon /></span>
                  <span className="causal-game__tool-copy">
                    <strong>{info.name}</strong>
                    <small>{info.description}</small>
                  </span>
                  <span className="causal-game__tool-count">{remaining}</span>
                </button>
              )
            })}
          </div>

          <div className="causal-game__actions">
            <button type="button" className="causal-game__run" onClick={run}><Play />运行光路</button>
            <button type="button" onClick={undo} disabled={history.length === 0} title="撤销最近操作" aria-label="撤销最近一次布置"><Undo2 /><span>撤销</span></button>
            <button type="button" onClick={clear} disabled={placements.size === 0} title="清空全部道具" aria-label="清空全部道具"><Trash2 /><span>清空</span></button>
            <button type="button" onClick={reset} title="重新开始当前关卡" aria-label="重置当前关卡"><RotateCcw /><span>重置</span></button>
          </div>

          <div className="causal-game__legend" aria-label="棋盘图例">
            <span><i className="legend-source" />光源</span>
            <span><i className="legend-target" />目标</span>
            <span><i className="legend-forbidden" />禁区</span>
          </div>
        </aside>

        <div className="causal-game__stage-wrap">
          <div className="causal-game__stage" style={{ width: '100%', maxWidth: BOARD_SIZE, aspectRatio: '1' }}>
            <span className="causal-game__axis">时间方向</span>
            <svg
              className="causal-game__paths"
              viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
              aria-label={result ? `运行后生成 ${result.branchesForSource.flat().length} 条光路分支` : '等待运行的光路图'}
            >
              {result?.branchesForSource.flatMap((branches, source) => branches.map((branch, branchIndex) => (
                <polyline
                  key={`${source}-${branchIndex}-${branch.path.map(eventKey).join(':')}`}
                  className={`signal signal--source-${source} ${branchIndex > 0 && !branch.reachedTarget ? 'is-secondary' : ''} ${branch.reachedTarget ? 'reached-target' : ''} ${branch.legal ? '' : 'is-illegal'}`}
                  points={branch.path.map(svgPoint).join(' ')}
                />
              )))}
            </svg>

            {points.map((point) => {
              const key = eventKey(point)
              const placedTool = placements.get(key)
              const forbidden = level.forbidden.some((item) => eventKey(item) === key)
              const target = key === eventKey(level.target)
              const source = level.starts.some(({ point: start }) => eventKey(start) === key)
              const boundary = point.t === 0 || point.t === level.duration
              const inactive = forbidden || target || source || boundary
              const placedInfo = placedTool ? TOOL_INFO[placedTool] : null
              const PlacedIcon = placedInfo?.icon
              const label = forbidden
                ? `禁区，时间 ${point.t}、位置 ${point.x}`
                : target
                  ? '目标会合事件'
                  : source
                    ? '光源'
                    : boundary
                      ? `棋盘边界，时间 ${point.t}、位置 ${point.x}`
                      : placedTool
                      ? `移除${placedInfo?.name}，时间 ${point.t}、位置 ${point.x}`
                      : `在时间 ${point.t}、位置 ${point.x} 放置${TOOL_INFO[selectedTool].name}`

              return (
                <button
                  key={key}
                  type="button"
                  className={`causal-event ${forbidden ? 'is-forbidden' : ''} ${target ? 'is-target' : ''} ${source ? 'is-source' : ''} ${placedTool ? `has-tool tool--${placedTool}` : ''}`}
                  style={{
                    left: `${((PAD + point.x * CELL) / BOARD_SIZE) * 100}%`,
                    top: `${((PAD + point.t * CELL) / BOARD_SIZE) * 100}%`,
                  }}
                  onClick={() => edit(point)}
                  disabled={inactive}
                  aria-label={label}
                >
                  {target ? <span className="causal-event__target" /> : null}
                  {source ? <span className="causal-event__source" /> : null}
                  {forbidden ? <span aria-hidden="true">×</span> : null}
                  {PlacedIcon ? <PlacedIcon /> : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {result ? (
        <section className="sr-only" role="region" aria-label="光路运行结果说明" tabIndex={0}>
          <h3>{result.success ? '运行成功' : '运行未成功'}</h3>
          {result.branchesForSource.flatMap((branches, sourceIndex) => branches.map((branch, branchIndex) => (
            <p key={`${sourceIndex}-${branchIndex}-${branch.path.map(eventKey).join(':')}`}>
              光源 {sourceIndex + 1}，分支 {branchIndex + 1}：
              {branch.path.map(describePoint).join('；')}。
              {branch.reachedTarget && branch.legal ? '抵达目标。' : '未抵达目标。'}
              {!branch.legal && branch.reason === 'forbidden' ? '该分支进入禁区。' : null}
              {!branch.legal && branch.reason === 'outside' ? '该分支越出棋盘。' : null}
            </p>
          )))}
        </section>
      ) : null}

      <div className={`causal-game__feedback ${result?.success ? 'is-success' : ''}`}>
        <div role="status" aria-live="polite">
          <strong>{result?.success ? '实验完成' : '实验记录'}</strong>
          <span>{message}</span>
        </div>
        {result?.success && levelIndex < LIGHT_PATH_LEVELS.length - 1 ? (
          <button type="button" onClick={() => selectLevel(levelIndex + 1)}>进入下一关<ChevronRight /></button>
        ) : null}
      </div>

      <details className="causal-game__rules">
        <summary>查看实验规则</summary>
        <ol>
          <li>光线每经过一个时间步横向移动一格；镜片会改变后续传播方向。</li>
          <li>分光棱镜产生左右两条分支，只要每个光源各有一条合法分支抵达目标即可。</li>
          <li>道具不能放在光源、目标或禁区；再次点击已放置的道具可将其移除。</li>
        </ol>
      </details>
    </section>
  )
}

export default CausalOrigamiGame
