import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, BookOpen, Check, ChevronLeft, ChevronRight, CircleHelp, History, Lightbulb,
  Minus, MousePointer2, Plus, RotateCcw, Scale, Trash2, Undo2, X,
} from 'lucide-react'

import './devilsBalance.css'
import { DEVILS_BALANCE_LEVELS, npcPhase } from './levels'
import {
  COLOR_DEFS, COLOR_IDS, addTrays, cloneTrays, countTrays, deriveSolvedWeights,
  emptyTrays, enumerateAssignments, evaluateTrays, filterCandidates, isInventoryEmpty,
  subtractInventory, validatePlayerTrays, type ColorId, type DevilBalanceLevel,
  type Pan, type ScaleResult, type Trays,
} from './model'

type GameStatus = 'playing' | 'won' | 'lost'

type Observation = {
  turn: number
  combined: Trays
  player: Trays
  results: [ScaleResult, ScaleResult]
  remainingCandidates: number
}

type HintAction = {
  panIndex: number
  color: ColorId
  count: number
}

type PieceAnimation = {
  id: number
  kind: 'drop' | 'throw'
  panIndex: number
  color: ColorId
}

const SCALE_NAMES = ['天平 A', '天平 B'] as const
const SCALE_ROLES = ['主天平 / MAIN', '副天平 / AUX'] as const
const PAN_SHORT_NAMES = ['A 左', 'A 右', 'B 左', 'B 右'] as const
const PAN_NAMES = ['A 左盘', 'A 右盘', 'B 左盘', 'B 右盘'] as const
const TUTORIAL_STORAGE_KEY = 'tjyz-devils-balance-tutorial-seen'
const MAX_CANDIDATE_MASS = 10

function initialInventory(level: DevilBalanceLevel) {
  return COLOR_IDS.reduce<Record<ColorId, number>>((inventory, color) => {
    inventory[color] = level.inventoryPerColor
    return inventory
  }, {} as Record<ColorId, number>)
}

function colorInfo(color: ColorId) {
  return COLOR_DEFS.find((item) => item.id === color) ?? COLOR_DEFS[0]
}

function resultTone(result: ScaleResult | undefined) {
  return result === '=' ? 'equal' : result === '>' ? 'left' : result === '<' ? 'right' : 'pending'
}

function formatResult(result: ScaleResult | undefined) {
  return result === '=' ? '平衡' : result === '>' ? '左重' : result === '<' ? '右重' : '待测量'
}

function flattenPan(pan: Pan): ColorId[] {
  return COLOR_IDS.flatMap((color) => Array.from({ length: pan[color] }, () => color))
}

/** 托盘内的方块始终横向排布（左盘 / 右盘使用同一布局）。 */
function StockRow({ pan, source }: { pan: Pan; source: 'npc' | 'player' }) {
  const pieces = COLOR_IDS.filter((color) => pan[color] > 0)
  return (
    <div className={`db__stock db__stock--${source}`}>
      <span className="db__stock-label">{source === 'npc' ? 'NPC' : '你'}</span>
      <div className="db__stock-fill" aria-label={`${source === 'npc' ? 'NPC' : '玩家'}方块`}>
        {pieces.length === 0 ? <i className="db__stock-empty">—</i> : pieces.flatMap((color) => {
          const info = colorInfo(color)
          const cells = Math.min(pan[color], 24)
          const row = Array.from({ length: cells }, (_, index) => (
            <b
              key={`${color}-${index}`}
              className="db__mini-block"
              style={{ '--piece-color': info.hex, '--piece-soft': info.soft } as CSSProperties}
              title={`${info.fullName} ×${pan[color]}`}
            />
          ))
          if (pan[color] > 24) row.push(<em key={`${color}-more`} className="db__more-tag">+{pan[color] - 24}</em>)
          return row
        })}
      </div>
    </div>
  )
}

function nextPlanAction(level: DevilBalanceLevel, turnIndex: number): HintAction | null {
  const plan = level.solutionPlan[turnIndex]
  if (!plan) return null
  for (let panIndex = 0; panIndex < plan.length; panIndex += 1) {
    for (const color of COLOR_IDS) {
      const count = plan[panIndex][color]
      if (count > 0) return { panIndex, color, count }
    }
  }
  return null
}

function planHint(level: DevilBalanceLevel, turnIndex: number) {
  const action = nextPlanAction(level, turnIndex)
  if (!action) return '本关的解题路线已经耗尽。回看测量记录，优先寻找还能区分候选解的颜色组合。'
  const info = colorInfo(action.color)
  return `建议动作：先选中${info.fullName}，再把目标切换到${PAN_NAMES[action.panIndex]}，投放 ${action.count} 枚。点击“定位这一步”可以自动切好操作栏，但不会替你提交。`
}

function BlockToken({ color, count, label }: { color: ColorId; count: number; label?: string }) {
  const info = colorInfo(color)
  return (
    <span className="db__block-token" style={{ '--piece-color': info.hex, '--piece-soft': info.soft } as CSSProperties}>
      <i aria-hidden="true" />
      <span>{label ?? info.name}</span>
      {count > 1 ? <b>×{count}</b> : null}
    </span>
  )
}

function LevelButton({ level, active, onClick }: { level: DevilBalanceLevel; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`db__level-button ${active ? 'is-active' : ''}`}
      onClick={onClick}
      aria-label={`选择第 ${level.order} 关：${level.name}`}
      aria-pressed={active}
      title={`${level.name} · ${level.difficulty}`}
    >
      <span>{String(level.order).padStart(2, '0')}</span>
      <small>{level.difficulty}</small>
    </button>
  )
}

export function DevilsBalanceGame() {
  const gameRootRef = useRef<HTMLElement>(null)
  const [levelIndex, setLevelIndex] = useState(0)
  const [turnIndex, setTurnIndex] = useState(0)
  const [selectedColor, setSelectedColor] = useState<ColorId>('red')
  const [selectedPanIndex, setSelectedPanIndex] = useState(0)
  const [playerTrays, setPlayerTrays] = useState<Trays>(() => emptyTrays())
  const [remaining, setRemaining] = useState(() => initialInventory(DEVILS_BALANCE_LEVELS[0]))
  const [candidates, setCandidates] = useState(() => enumerateAssignments(DEVILS_BALANCE_LEVELS[0].reference))
  const [history, setHistory] = useState<Observation[]>([])
  const [status, setStatus] = useState<GameStatus>('playing')
  const [message, setMessage] = useState('NPC 已完成投放。观察托盘，选择方块开始本回合实验。')
  const [displayedResults, setDisplayedResults] = useState<[ScaleResult | undefined, ScaleResult | undefined]>([undefined, undefined])
  const [tutorialOpen, setTutorialOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) !== '1'
    } catch {
      return true
    }
  })
  const [rulesOpen, setRulesOpen] = useState(false)
  const [hintOpen, setHintOpen] = useState(false)
  const [hintLevel, setHintLevel] = useState(0)
  const [resultOpen, setResultOpen] = useState(false)
  const [pieceAnimation, setPieceAnimation] = useState<PieceAnimation | null>(null)
  const [hintTargetPan, setHintTargetPan] = useState<number | null>(null)
  const modalScrollY = useRef<number | null>(null)
  const modalOpen = (tutorialOpen && levelIndex === 0) || rulesOpen || hintOpen || resultOpen

  const getGameScrollTarget = useCallback(() => {
    const root = gameRootRef.current
    if (!root || typeof window === 'undefined') return 0

    const siteHeader = document.querySelector<HTMLElement>('.site-header')
    const headerOffset = (siteHeader?.getBoundingClientRect().height ?? 0) + 12
    return Math.max(0, window.scrollY + root.getBoundingClientRect().top - headerOffset)
  }, [])

  const scrollToImmediately = useCallback((top: number) => {
    const root = document.documentElement
    const previousScrollBehavior = root.style.scrollBehavior
    root.style.scrollBehavior = 'auto'
    window.scrollTo({ top, left: 0, behavior: 'auto' })
    root.style.scrollBehavior = previousScrollBehavior
  }, [])

  useLayoutEffect(() => {
    if (modalOpen || typeof window === 'undefined') return undefined

    const frame = window.requestAnimationFrame(() => {
      scrollToImmediately(getGameScrollTarget())
    })

    return () => window.cancelAnimationFrame(frame)
  }, [getGameScrollTarget, modalOpen, scrollToImmediately])

  const rememberModalScroll = useCallback(() => {
    if (typeof window !== 'undefined' && modalScrollY.current === null) {
      modalScrollY.current = window.scrollY
    }
  }, [])

  useEffect(() => {
    if (!modalOpen || typeof window === 'undefined') return undefined

    const scrollY = modalScrollY.current ?? getGameScrollTarget()
    scrollToImmediately(scrollY)
    modalScrollY.current = scrollY

    return () => {
      modalScrollY.current = null
      const restore = () => scrollToImmediately(scrollY)
      restore()
      window.requestAnimationFrame(restore)
      window.setTimeout(restore, 50)
    }
  }, [getGameScrollTarget, modalOpen, scrollToImmediately])

  useEffect(() => {
    if (!tutorialOpen && !rulesOpen && !hintOpen && !resultOpen) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setTutorialOpen(false)
      try { window.localStorage.setItem(TUTORIAL_STORAGE_KEY, '1') } catch { /* storage may be unavailable */ }
      setRulesOpen(false)
      setHintOpen(false)
      setResultOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hintOpen, resultOpen, rulesOpen, tutorialOpen])

  const level = DEVILS_BALANCE_LEVELS[levelIndex]
  const npc = useMemo(() => npcPhase(level, turnIndex), [level, turnIndex])
  const solved = useMemo(() => deriveSolvedWeights(candidates), [candidates])
  const playerCount = countTrays(playerTrays)
  const pendingColorCount = playerTrays.reduce((total, pan) => total + pan[selectedColor], 0)
  const referenceInfo = colorInfo(level.reference.color)
  const initialCandidateCount = enumerateAssignments(level.reference).length
  const progress = Math.max(0, Math.min(100, Math.round((1 - candidates.length / initialCandidateCount) * 100)))
  const hintAction = nextPlanAction(level, history.length)
  const selectedPanName = PAN_NAMES[selectedPanIndex]
  const selectedColorInfo = colorInfo(selectedColor)
  const remainingTotal = Object.values(remaining).reduce((total, count) => total + count, 0)
  const actionDirection = hintAction
    ? `下一步：选中${colorInfo(hintAction.color).fullName}，把目标切换到${PAN_NAMES[hintAction.panIndex]}。`
    : '下一步：先选择一个颜色和目标托盘，再观察两台天平的比较结果。'
  const hintText = hintLevel === 0
    ? `提示分三层解锁。${actionDirection}`
    : hintLevel === 1
      ? `基础观察：把已知参照色和一个未知色放在同一台天平两侧，先建立“谁更重”的相对关系。${actionDirection}`
      : hintLevel === 2
        ? `${level.hint} 尽量让两台天平分别承担不同的比较任务。${actionDirection}`
        : planHint(level, history.length)

  const dismissTutorial = () => {
    setTutorialOpen(false)
    try { window.localStorage.setItem(TUTORIAL_STORAGE_KEY, '1') } catch { /* storage may be unavailable */ }
  }

  const closeRules = () => {
    setRulesOpen(false)
  }

  const closeHint = () => {
    setHintOpen(false)
  }

  const closeResult = () => {
    setResultOpen(false)
  }

  const triggerPieceAnimation = (kind: PieceAnimation['kind'], panIndex: number, color: ColorId) => {
    const animation = { id: Date.now(), kind, panIndex, color }
    setPieceAnimation(animation)
    window.setTimeout(() => {
      setPieceAnimation((current) => current?.id === animation.id ? null : current)
    }, kind === 'drop' ? 680 : 560)
  }

  const selectColor = (color: ColorId) => {
    setSelectedColor(color)
    setMessage(`已选择${colorInfo(color).fullName}。点击天平下方的「放入左盘 / 放入右盘」按钮。`)
  }

  const selectPan = (panIndex: number) => {
    if (status !== 'playing') return
    setSelectedPanIndex(panIndex)
    setHintTargetPan(null)
    setMessage(`已选择${PAN_NAMES[panIndex]}作为投放目标。`)
  }

  const guideToHintAction = () => {
    if (!hintAction || status !== 'playing') return
    setSelectedColor(hintAction.color)
    setSelectedPanIndex(hintAction.panIndex)
    setHintTargetPan(hintAction.panIndex)
    closeHint()
    setMessage(`提示已定位：选中${colorInfo(hintAction.color).fullName}，目标为${PAN_NAMES[hintAction.panIndex]}。`)
    window.setTimeout(() => setHintTargetPan((current) => current === hintAction.panIndex ? null : current), 1500)
  }

  const resetLevel = (nextIndex = levelIndex) => {
    const nextLevel = DEVILS_BALANCE_LEVELS[nextIndex]
    setLevelIndex(nextIndex)
    setTurnIndex(0)
    setSelectedColor(nextLevel.reference.color)
    setSelectedPanIndex(0)
    setPlayerTrays(emptyTrays())
    setRemaining(initialInventory(nextLevel))
    setCandidates(enumerateAssignments(nextLevel.reference))
    setHistory([])
    setStatus('playing')
    setDisplayedResults([undefined, undefined])
    setPieceAnimation(null)
    setHintTargetPan(null)
    setHintLevel(0)
    dismissTutorial()
    setRulesOpen(false)
    setHintOpen(false)
    setResultOpen(false)
    setMessage('NPC 已完成投放。观察托盘，选择方块开始本回合实验。')
  }

  const selectLevel = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= DEVILS_BALANCE_LEVELS.length) return
    resetLevel(nextIndex)
  }

  const addToPan = (panIndex = selectedPanIndex) => {
    if (status !== 'playing') return
    if (playerCount >= level.playerLimit) {
      setMessage(`本回合最多投放 ${level.playerLimit} 枚玩家方块。`)
      return
    }
    if (remaining[selectedColor] <= pendingColorCount) {
      setMessage(`${colorInfo(selectedColor).fullName}库存不足，先观察已有记录。`)
      return
    }
    setDisplayedResults([undefined, undefined])
    setPlayerTrays((current) => {
      const next = cloneTrays(current)
      next[panIndex][selectedColor] += 1
      return next
    })
    triggerPieceAnimation('drop', panIndex, selectedColor)
    setMessage(`已将${colorInfo(selectedColor).fullName}方块放入${PAN_NAMES[panIndex]}。`)
  }

  const removeFromPan = (panIndex = selectedPanIndex) => {
    if (status !== 'playing' || playerTrays[panIndex][selectedColor] <= 0) return
    setDisplayedResults([undefined, undefined])
    setPlayerTrays((current) => {
      const next = cloneTrays(current)
      next[panIndex][selectedColor] -= 1
      return next
    })
    triggerPieceAnimation('throw', panIndex, selectedColor)
    setMessage(`已从${PAN_NAMES[panIndex]}取出一枚${colorInfo(selectedColor).fullName}方块。`)
  }

  const clearPlayerTrays = () => {
    if (playerCount === 0) return
    setPlayerTrays(emptyTrays())
    setPieceAnimation(null)
    setMessage('本回合的玩家投放已清空。')
  }

  const submitMeasurement = () => {
    if (status !== 'playing') return
    const validation = validatePlayerTrays(playerTrays, remaining, level.playerLimit)
    if (!validation.ok) {
      setMessage(validation.reason === 'limit' ? `本回合最多投放 ${level.playerLimit} 枚方块。` : '玩家库存不足，无法提交。')
      return
    }

    const combined = addTrays(npc, playerTrays)
    const results = evaluateTrays(combined, level.target)
    const nextCandidates = filterCandidates(candidates, combined, results)
    const nextRemaining = subtractInventory(remaining, playerTrays)
    const nextHistory: Observation = {
      turn: turnIndex + 1,
      combined,
      player: cloneTrays(playerTrays),
      results,
      remainingCandidates: nextCandidates.length,
    }
    setHistory((items) => [...items, nextHistory])
    setCandidates(nextCandidates)
    setRemaining(nextRemaining)
    setPlayerTrays(emptyTrays())
    setPieceAnimation(null)
    setDisplayedResults(results)
    setHintLevel(0)

    if (nextCandidates.length === 1) {
      setStatus('won')
      setMessage('唯一解已锁定。五种颜色的重量全部确定，实验完成。')
      setResultOpen(true)
      return
    }
    if (nextCandidates.length === 0) {
      setStatus('lost')
      setMessage('记录与当前规则矛盾，候选解为空。请重置本关再试。')
      setResultOpen(true)
      return
    }
    if (isInventoryEmpty(nextRemaining) || turnIndex + 1 >= level.maxTurns) {
      setStatus('lost')
      setMessage('方块资源已耗尽，仍有多个候选解。重置本关可以重新规划投放。')
      setResultOpen(true)
      return
    }
    setTurnIndex((index) => index + 1)
    setMessage(`测量完成：天平 A ${formatResult(results[0])}，天平 B ${formatResult(results[1])}。候选解剩余 ${nextCandidates.length} 组。`)
  }

  const undoLastMeasurement = () => {
    const previous = history.at(-1)
    if (!previous || status === 'won' || status === 'lost') return
    const previousHistory = history.slice(0, -1)
    const previousCandidates = previousHistory.reduce(
      (items, record) => filterCandidates(items, record.combined, record.results),
      enumerateAssignments(level.reference),
    )
    const restoredRemaining = initialInventory(level)
    previousHistory.forEach((record) => {
      COLOR_IDS.forEach((color) => {
        restoredRemaining[color] -= record.player.reduce((total, pan) => total + pan[color], 0)
      })
    })
    setHistory(previousHistory)
    setCandidates(previousCandidates)
    setRemaining(restoredRemaining)
    setTurnIndex(Math.max(0, previousHistory.length))
    setPieceAnimation(null)
    setDisplayedResults(previousHistory.at(-1)?.results ?? [undefined, undefined])
    setHintLevel(0)
    setMessage('已撤销上一轮测量，托盘恢复到提交前的状态。')
  }

  const placementSummary = (record: Observation) => {
    const entries = record.player.flatMap((pan, index) => {
      const line = COLOR_IDS.filter((color) => pan[color] > 0).map((color) => `${colorInfo(color).name}×${pan[color]}→${PAN_SHORT_NAMES[index]}`)
      return line
    })
    return entries.join(' · ') || '无投放'
  }

  return (
    <section ref={gameRootRef} className={`db-game db-game--${status}`} aria-labelledby="devils-balance-title">
      <header className="db-game__header">
        <div className="db-game__brand">
          <span className="db-game__eyebrow">WEIGHT SCALE GAME · 10 CASES</span>
          <h2 id="devils-balance-title">魔鬼天平</h2>
          <p>看见投放，看不见数字。用两台天平的比较结果，找出五种颜色的真实重量。</p>
        </div>
        <div className="db-game__hud">
          <div className="db-game__chip" title="当前回合">
            <span>TURN</span><strong>{String(history.length + 1).padStart(2, '0')}</strong>
          </div>
          <div className="db-game__chip" title="剩余方块总数">
            <span>BLOCKS</span><strong>{remainingTotal}</strong>
          </div>
          <div className={`db-game__chip db-game__chip-status is-${status}`} title="当前状态">
            <span>STATUS</span><strong>{status === 'playing' ? '进行中' : status === 'won' ? '已获胜' : '已失败'}</strong>
          </div>
          <div className="db-game__header-tools" aria-label="游戏工具">
            <button type="button" className="db-game__tool-button" onClick={() => { rememberModalScroll(); setRulesOpen(true) }} title="打开规则书">
              <BookOpen aria-hidden="true" /><span>规则书</span>
            </button>
            <button type="button" className="db-game__tool-button" onClick={() => { rememberModalScroll(); setHintOpen(true) }} title="打开提示">
              <Lightbulb aria-hidden="true" /><span>提示</span><b>{hintLevel}/3</b>
            </button>
            {levelIndex === 0 ? (
              <button type="button" className="db-game__tool-button" onClick={() => { rememberModalScroll(); setTutorialOpen(true) }} title="重新打开新手引导">
                <CircleHelp aria-hidden="true" /><span>引导</span>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <section className="db-game__level-panel" aria-labelledby="db-level-title">
        <div className="db-game__level-copy">
          <div><span id="db-level-title">关卡选择</span><strong>{level.name}</strong></div>
          <p>{level.description}</p>
        </div>
        <div className="db-game__level-grid">
          {DEVILS_BALANCE_LEVELS.map((item, index) => <LevelButton key={item.id} level={item} active={index === levelIndex} onClick={() => selectLevel(index)} />)}
        </div>
        <div className="db-game__level-nav">
          <button type="button" onClick={() => selectLevel(levelIndex - 1)} disabled={levelIndex === 0} aria-label="上一关"><ChevronLeft /><span>上一关</span></button>
          <button type="button" onClick={() => selectLevel(levelIndex + 1)} disabled={levelIndex === DEVILS_BALANCE_LEVELS.length - 1} aria-label="下一关"><span>下一关</span><ChevronRight /></button>
        </div>
      </section>

      <div className="db-game__main">
        <aside className="db-game__panel db-game__vault" aria-label="矿物库存">
          <div className="db-game__panel-head"><span>MINERAL VAULT</span><small>矿物库存 · 选择投放</small></div>
          <div className="db-game__vault-list" role="listbox" aria-label="选择要投放的矿物颜色">
            {COLOR_DEFS.map((color) => {
              const isSelected = selectedColor === color.id
              const isEmpty = remaining[color.id] === 0
              return (
                <button
                  key={color.id}
                  type="button"
                  className={`db-game__vault-card ${isSelected ? 'is-selected' : ''} ${isEmpty ? 'is-empty' : ''}`}
                  onClick={() => selectColor(color.id)}
                  role="option"
                  aria-selected={isSelected}
                  aria-label={`选择${color.fullName}，库存 ${remaining[color.id]}`}
                  style={{ '--piece-color': color.hex, '--piece-soft': color.soft } as CSSProperties}
                >
                  <span className="db-game__vault-orb"><i aria-hidden="true" /></span>
                  <span className="db-game__vault-copy"><b>{color.fullName}</b><small>1–10 g · 未知</small></span>
                  <strong className="db-game__vault-count">{remaining[color.id]}</strong>
                </button>
              )
            })}
          </div>
          <div className="db-game__vault-hint">
            先选择一种矿物，再点击天平下方的「放入左盘 / 放入右盘」按钮。
            NPC 方块来自无限池，你放入的方块会在「提交测量」时消耗。
          </div>
        </aside>

        <section className="db-game__panel db-game__arena" aria-label="两台双盘天平实验台">
          <header className="db-game__arena-top">
            <div className="db-game__arena-title">
              <span>WEIGHT SCALE CHAMBER</span>
              <strong>双天平实验台</strong>
              <p><MousePointer2 aria-hidden="true" />点击托盘选中目标，点击下方「放入」按钮投放所选矿物。</p>
            </div>
            <div className="db-game__arena-legend" aria-label="实验台图例">
              <span><i className="is-npc" />NPC 方块</span>
              <span><i className="is-player" />玩家方块</span>
              <span><i className="is-target" />当前目标</span>
            </div>
          </header>

          <div className="db-game__scales" aria-label="两台双盘天平">
            {SCALE_NAMES.map((name, scaleIndex) => {
              const result = displayedResults[scaleIndex as 0 | 1]
              const tone = resultTone(result)
              return (
                <article key={name} className={`db-game__scale db-game__scale--${tone}`}>
                  <header>
                    <div><Scale aria-hidden="true" /><span>{name}</span><small>{SCALE_ROLES[scaleIndex]}</small></div>
                    <strong className={`is-${tone}`} aria-label={`${name}结果 ${result ?? '待测量'}`} title={result ? `${name}·${formatResult(result)}` : '待测量'}>{result ?? '?'}</strong>
                  </header>
                  <div key={`${name}-${history.length}-${result ?? 'pending'}`} className="db-game__machine">
                    <div className="db-game__beam db-game__beam--result" aria-hidden="true" />
                    <div className="db-game__pivot" aria-hidden="true" />
                    <div className="db-game__stem" aria-hidden="true" />
                    <div className="db-game__cord db-game__cord--left" aria-hidden="true" />
                    <div className="db-game__cord db-game__cord--right" aria-hidden="true" />
                    {[scaleIndex * 2, scaleIndex * 2 + 1].map((panIndex) => {
                      const isTarget = selectedPanIndex === panIndex
                      const isHintTarget = hintTargetPan === panIndex
                      const animationInfo = pieceAnimation?.panIndex === panIndex ? colorInfo(pieceAnimation.color) : null
                      return (
                        <div
                          key={PAN_NAMES[panIndex]}
                          className={`db-game__tray db-game__tray--${panIndex % 2 === 0 ? 'left' : 'right'} db-game__tray--interactive ${isTarget ? 'is-target' : ''} ${isHintTarget ? 'is-hint-target' : ''}`}
                          role="button"
                          tabIndex={status === 'playing' ? 0 : -1}
                          onClick={() => selectPan(panIndex)}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return
                            event.preventDefault()
                            selectPan(panIndex)
                          }}
                          aria-label={`选择${PAN_NAMES[panIndex]}作为投放目标`}
                          aria-pressed={isTarget}
                        >
                          <div className="db-game__tray-head">
                            <span className="db-game__tray-label">{PAN_NAMES[panIndex]}</span>
                            <small className={isTarget ? 'is-target' : ''}>{isTarget ? '当前目标' : '点击选目标'}</small>
                          </div>
                          {animationInfo ? <span key={pieceAnimation?.id} className={`db__animated-piece db__animated-piece--${pieceAnimation?.kind}`} style={{ '--piece-color': animationInfo.hex, '--piece-soft': animationInfo.soft } as CSSProperties} aria-hidden="true"><i /><b>{animationInfo.name}</b></span> : null}
                          <StockRow pan={npc[panIndex]} source="npc" />
                          <StockRow pan={playerTrays[panIndex]} source="player" />
                        </div>
                      )
                    })}
                  </div>
                  <div className="db-game__scale-drop">
                    {[0, 1].map((side) => {
                      const panIndex = scaleIndex * 2 + side
                      const canRemove = status === 'playing' && playerTrays[panIndex][selectedColor] > 0
                      return (
                        <div key={PAN_NAMES[panIndex]} className="db-game__drop-zone">
                          <button
                            type="button"
                            className="db-game__drop-btn"
                            onClick={() => addToPan(panIndex)}
                            disabled={status !== 'playing'}
                            title={`把${selectedColorInfo.fullName}放入${PAN_NAMES[panIndex]}`}
                          >
                            {side === 0 ? <><Plus aria-hidden="true" /><span>放入左盘</span></> : <><span>放入右盘</span><Plus aria-hidden="true" /></>}
                          </button>
                          <button
                            type="button"
                            className="db-game__drop-remove"
                            onClick={() => removeFromPan(panIndex)}
                            disabled={!canRemove}
                            title={`从${PAN_NAMES[panIndex]}取出一枚${selectedColorInfo.fullName}`}
                            aria-label={`从${PAN_NAMES[panIndex]}取出一枚${selectedColorInfo.fullName}`}
                          >
                            <Minus aria-hidden="true" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </article>
              )
            })}
          </div>

          <div className="db-game__statusbar" role="status" aria-live="polite">
            <span className="db-game__statusbar-icon">{status === 'won' ? <Check aria-hidden="true" /> : status === 'lost' ? <AlertTriangle aria-hidden="true" /> : <Scale aria-hidden="true" />}</span>
            <strong>{status === 'won' ? '推导完成' : status === 'lost' ? '本关未完成' : '实验记录'}</strong>
            <span className="db-game__statusbar-msg">{message}</span>
          </div>
        </section>

        <aside className="db-game__panel db-game__lab" aria-label="推理实验室">
          <div className="db-game__panel-head"><span>INFERENCE LAB</span><small>推理记录</small></div>
          <div className="db-game__clue" aria-label="已知参照">
            <div className="db-game__clue-icon"><CircleHelp aria-hidden="true" /></div>
            <div className="db-game__clue-copy">
              <small>INITIAL CLUE · 已知参照</small>
              <strong className="db-game__clue-value"><BlockToken color={level.reference.color} count={1} label={referenceInfo.fullName} />= {level.reference.weight} g</strong>
            </div>
          </div>

          <section className="db-game__candpanel" aria-label="候选解统计">
            <div className="db-game__cand-head">
              <span>CANDIDATE WEIGHTS</span>
              <b>{candidates.length} 组候选</b>
            </div>
            <div className="db-game__progress"><i style={{ width: `${progress}%` }} /></div>
            <div className="db-game__cand-grid" aria-label="候选重量分布">
              {COLOR_DEFS.map((color) => {
                const known = solved[color.id]
                return (
                  <div key={color.id} className="db-game__cand-row">
                    <span className="db-game__cand-color"><i style={{ backgroundColor: color.hex }} />{color.name}</span>
                    <div className="db-game__cand-nums">
                      {Array.from({ length: MAX_CANDIDATE_MASS }, (_, index) => index + 1).map((value) => (
                        <b key={value} className={known === value ? 'is-known' : ''} title={`${color.fullName} 候选 ${value}g`}>{value}</b>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="db-game__cand-note">高亮数字表示该颜色目前已被锁定的重量。</p>
          </section>

          <section className="db-game__lab-history" aria-labelledby="db-history-title">
            <div className="db-game__lab-history-head">
              <span id="db-history-title"><History aria-hidden="true" />测量记录</span>
              <small>{history.length} / {level.maxTurns} 回合</small>
            </div>
            {history.length === 0 ? (
              <p className="db-game__history-empty">提交测量后，两台天平的结果会记录在这里。</p>
            ) : (
              <div className="db-game__lab-history-list">
                {history.slice(-9).reverse().map((record) => (
                  <div key={record.turn} className="db-game__lab-row">
                    <div className="db-game__lab-turn">
                      <span>TURN {String(record.turn).padStart(2, '0')}</span>
                      <b className={`is-${resultTone(record.results[0])}`}>A {record.results[0]}</b>
                      <b className={`is-${resultTone(record.results[1])}`}>B {record.results[1]}</b>
                      <small>{record.remainingCandidates} 组</small>
                    </div>
                    <em className="db-game__lab-detail">{placementSummary(record)}</em>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      <footer className="db-game__footer">
        <div className="db-game__selection" role="listbox" aria-label="选择矿物颜色">
          <span className="db-game__selection-note">选择矿物</span>
          {COLOR_DEFS.map((color) => (
            <button
              key={color.id}
              type="button"
              className={`db-game__mini ${selectedColor === color.id ? 'is-active' : ''}`}
              onClick={() => selectColor(color.id)}
              aria-selected={selectedColor === color.id}
              role="option"
              aria-label={color.fullName}
              title={`${color.fullName} · 库存 ${remaining[color.id]}`}
              style={{ '--piece-color': color.hex, '--piece-soft': color.soft } as CSSProperties}
            >
              <i aria-hidden="true" />
            </button>
          ))}
          <span className="db-game__selection-text">已选：{selectedColorInfo.fullName} · 库存 {remaining[selectedColor]}</span>
        </div>
        <div className="db-game__footer-actions">
          <button type="button" onClick={clearPlayerTrays} disabled={playerCount === 0} title="清空本回合投放" aria-label="清空本回合投放"><Trash2 aria-hidden="true" /><span>清空</span></button>
          <button type="button" onClick={undoLastMeasurement} disabled={history.length === 0 || status !== 'playing'} title="撤销上一轮测量"><Undo2 aria-hidden="true" /><span>撤销上一轮</span></button>
          <button type="button" onClick={() => resetLevel()} title="重置当前关卡"><RotateCcw aria-hidden="true" /><span>重置本关</span></button>
          <button type="button" className="db-game__measure" onClick={submitMeasurement} disabled={status !== 'playing'} title={`提交测量：消耗 ${playerCount} 枚玩家方块，结算两台天平`}>
            <Scale aria-hidden="true" /><span>提交测量 · END TURN</span><small>{playerCount}/{level.playerLimit} 已放</small>
          </button>
        </div>
      </footer>

      {tutorialOpen && levelIndex === 0 ? createPortal((
        <div className="db-game__modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) dismissTutorial() }}>
          <section className="db-game__modal db-game__modal--tutorial" role="dialog" aria-modal="true" aria-labelledby="db-tutorial-title">
            <header className="db-game__modal-header">
              <div><span className="db-game__modal-kicker">QUICK START · CASE 01</span><h3 id="db-tutorial-title">三分钟上手魔鬼天平</h3></div>
              <button type="button" className="db-game__modal-close" onClick={dismissTutorial} aria-label="退出新手引导" title="退出新手引导"><X /></button>
            </header>
            <p className="db-game__modal-lead">你只需要观察方块、安排比较、记录符号。数字不会出现在天平上。</p>
            <ol className="db-game__tutorial-steps">
              <li><b>01</b><div><strong>记住参照</strong><span>本关公开了 {referenceInfo.fullName} = {level.reference.weight}，它是唯一的精确重量。</span></div></li>
              <li><b>02</b><div><strong>选颜色</strong><span>在左侧“矿物库存”里选中一种颜色，卡片右侧的数字是你的库存。</span></div></li>
              <li><b>03</b><div><strong>锁定目标</strong><span>点击托盘选中目标盘，再点击天平下方「放入左盘 / 放入右盘」按钮。每回合最多放 {level.playerLimit} 枚。</span></div></li>
              <li><b>04</b><div><strong>提交测量</strong><span>点击底部“提交测量”，两台天平只返回 &gt;、&lt; 或 =，托盘里的方块会被消耗。</span></div></li>
              <li><b>05</b><div><strong>锁定唯一解</strong><span>候选解降到 1 组时获胜；资源耗尽前都可以重置本关重新规划。</span></div></li>
            </ol>
            <div className="db-game__modal-actions">
              <button type="button" className="db-game__modal-secondary" onClick={dismissTutorial}>跳过引导</button>
              <button type="button" className="db-game__modal-primary" onClick={dismissTutorial}>开始实验<ChevronRight /></button>
            </div>
          </section>
        </div>
      ), document.body) : null}

      {rulesOpen ? createPortal((
        <div className="db-game__modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeRules() }}>
          <section className="db-game__modal" role="dialog" aria-modal="true" aria-labelledby="db-rules-title">
            <header className="db-game__modal-header">
              <div><span className="db-game__modal-kicker">FIELD MANUAL · WEIGHT SCALE GAME</span><h3 id="db-rules-title">规则书</h3></div>
              <button type="button" className="db-game__modal-close" onClick={closeRules} aria-label="关闭规则书" title="关闭规则书"><X /></button>
            </header>
            <div className="db-game__rules-grid">
              <article><span>目标</span><strong>找出五种颜色的真实重量</strong><p>每种重量是 1–10 的互不相同整数。候选解只保留与所有测量记录一致的组合。</p></article>
              <article><span>已知参照</span><strong>{referenceInfo.fullName} = {level.reference.weight}</strong><p>每一关只公开一种颜色的精确重量，其余四种需要通过比较推导。</p></article>
              <article><span>NPC 阶段</span><strong>先随机投放 0–3 枚</strong><p>NPC 方块来自无限池，你可以看见它们的颜色和数量，但不能取走。</p></article>
              <article><span>玩家阶段</span><strong>最多投放 {level.playerLimit} 枚</strong><p>先在库存或底部选择颜色，再点击天平下方「放入」按钮；「−」会把本回合的玩家方块移出托盘。</p></article>
              <article><span>测量反馈</span><strong>&gt; 左重　&lt; 右重　= 平衡</strong><p>两台天平分别比较左右盘总重，不会显示具体数字。</p></article>
              <article><span>消耗与胜负</span><strong>提交后全部清空</strong><p>托盘方块会消耗。候选解为 1 组即胜利；候选解为空或资源/回合耗尽仍未唯一则失败。</p></article>
            </div>
            <div className="db-game__modal-actions"><button type="button" className="db-game__modal-primary" onClick={closeRules}>返回实验</button></div>
          </section>
        </div>
      ), document.body) : null}

      {hintOpen ? createPortal((
        <div className="db-game__modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeHint() }}>
          <section className="db-game__modal db-game__modal--hint" role="dialog" aria-modal="true" aria-labelledby="db-hint-title">
            <header className="db-game__modal-header">
              <div><span className="db-game__modal-kicker">OBSERVATION ASSIST · {hintLevel}/3 UNLOCKED</span><h3 id="db-hint-title">实验提示</h3></div>
              <button type="button" className="db-game__modal-close" onClick={closeHint} aria-label="关闭提示" title="关闭提示"><X /></button>
            </header>
            <div className="db-game__hint-meter" aria-label={`提示已解锁 ${hintLevel} 层，共 3 层`}>
              {[1, 2, 3].map((item) => <i key={item} className={item <= hintLevel ? 'is-active' : ''} />)}
            </div>
            <p className={`db-game__hint-copy ${hintLevel === 0 ? 'is-locked' : ''}`}>{hintText}</p>
            {hintLevel >= 1 && hintAction ? (
              <div className="db-game__hint-action">
                <div><BlockToken color={hintAction.color} count={hintAction.count} /><ChevronRight aria-hidden="true" /><strong>{PAN_NAMES[hintAction.panIndex]}<small>投放 {hintAction.count} 枚</small></strong></div>
                <button type="button" onClick={guideToHintAction} disabled={status !== 'playing'}>定位这一步</button>
              </div>
            ) : null}
            <div className="db-game__hint-context"><span>当前状态</span><strong>第 {history.length + 1} 回合 · {candidates.length} 组候选解</strong></div>
            <div className="db-game__modal-actions">
              <button type="button" className="db-game__modal-secondary" onClick={() => setHintLevel(0)} disabled={hintLevel === 0}>重置提示层级</button>
              <button type="button" className="db-game__modal-primary" onClick={() => setHintLevel((current) => Math.min(3, current + 1))} disabled={hintLevel >= 3}>解锁下一条提示<Lightbulb /></button>
            </div>
          </section>
        </div>
      ), document.body) : null}

      {resultOpen ? createPortal((
        <div className="db-game__modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeResult() }}>
          <section className={`db-game__modal db-game__result ${status === 'won' ? 'is-win' : 'is-lose'}`} role="dialog" aria-modal="true" aria-labelledby="db-result-title">
            <span className="db-game__modal-kicker">{status === 'won' ? 'PRIZE MATCH CLEARED' : 'GAME OVER'}</span>
            <h3 id="db-result-title">{status === 'won' ? 'EUREKA · 推导完成' : 'NO BALANCE · 本关未完成'}</h3>
            <p>
              {status === 'won'
                ? '唯一解已锁定，五种颜色的真实重量全部正确。'
                : history.length > 0
                  ? '记录与当前规则出现矛盾，候选解为空。重置本关重新规划投放。'
                  : '方块资源或回合数已耗尽，仍有多组候选解。重置本关再试。'}
            </p>
            <div className="db-game__result-weight" aria-label="锁定的重量">
              {COLOR_DEFS.map((color) => {
                const known = solved[color.id]
                return <span key={color.id} style={{ '--piece-color': color.hex, '--piece-soft': color.soft } as CSSProperties}><i aria-hidden="true" />{color.name}<b>{known ?? '?'}</b></span>
              })}
            </div>
            <div className="db-game__modal-actions">
              <button type="button" className="db-game__modal-secondary" onClick={closeResult}>再看棋盘</button>
              {status === 'won' && levelIndex < DEVILS_BALANCE_LEVELS.length - 1 ? (
                <button type="button" className="db-game__modal-primary" onClick={() => { closeResult(); selectLevel(levelIndex + 1) }}>下一关<ChevronRight /></button>
              ) : (
                <button type="button" className="db-game__modal-primary" onClick={() => { closeResult(); resetLevel() }}>重新本关<RotateCcw /></button>
              )}
            </div>
          </section>
        </div>
      ), document.body) : null}
    </section>
  )
}

export default DevilsBalanceGame