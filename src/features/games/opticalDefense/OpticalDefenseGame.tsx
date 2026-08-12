import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BatteryCharging, ChevronRight, CircleDot, Coins, Combine, Crosshair, DoorOpen, Filter,
  Flame, Gauge, HeartPulse, HelpCircle, Layers3, Lightbulb, Link2, ListFilter, Pause, Play, RadioTower,
  Minus, Plus, RefreshCw, RotateCw, ScanLine, Settings, Shield, Snowflake, Sparkles,
  SplitSquareHorizontal, SquareStack, Trash2, Waves, X, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import './opticalDefense.css'
import { OPTICAL_DEFENSE_LEVELS } from './levels'
import type { OpticalDefenseScene, SceneSnapshot } from './OpticalDefenseScene'
import {
  ACCELERATOR_MAX_CHARGE_J, ACCELERATOR_MIN_INPUT_W, attachSensor, createBattleState, DEVICE_COSTS, deviceLevel,
  deviceUpgradeCost, placeDevice, pointOnPath, queueCapacitorDetonation, rotateDevice, scoreBattle,
  sellDevice, setDeviceRotation, snapDeviceOutputToTarget, startWave, tickBattle, togglePause, updateDevice,
  upgradeDevice,
} from './simulation'
import type { BattleState } from './simulation'
import { SOURCE_POWER_W, totalPower } from './rules'
import { traceOpticalNetwork } from './optics'
import { DEFAULT_SAVE, readOpticalSaveResult, writeOpticalSave } from './storage'
import type { DeviceKind, DevicePlacement, RgbPower, SaveData, SensorAction, SensorChannel, TargetStrategy } from './types'

type ToolDefinition = {
  kind: DeviceKind
  name: string
  shortName: string
  role: string
  icon: LucideIcon
  color?: string
}

const TOOLS: ToolDefinition[] = [
  { kind: 'source-red', name: '红光源', shortName: '红光', role: '50W', icon: CircleDot, color: '#ff5b64' },
  { kind: 'source-green', name: '绿光源', shortName: '绿光', role: '75W', icon: CircleDot, color: '#48e890' },
  { kind: 'source-blue', name: '蓝光源', shortName: '蓝光', role: '100W', icon: CircleDot, color: '#55a8ff' },
  { kind: 'mirror', name: '平面镜', shortName: '镜面', role: '反射', icon: SquareStack },
  { kind: 'splitter', name: '分束器', shortName: '分束', role: '1-3 路', icon: SplitSquareHorizontal },
  { kind: 'combiner', name: '合束器', shortName: '合束', role: 'RGB', icon: Combine },
  { kind: 'filter', name: '滤光片', shortName: '滤色', role: '通道', icon: Filter },
  { kind: 'collector', name: '能量收集器', shortName: '收集器', role: '回收', icon: Combine },
  { kind: 'bulb', name: '灯泡', shortName: '灯泡', role: '广域', icon: Lightbulb },
  { kind: 'laser-emitter', name: '激光发射器', shortName: '激光', role: '单体', icon: Crosshair },
  { kind: 'radiation-source', name: '辐射源', shortName: '辐射', role: '范围', icon: RadioTower },
  { kind: 'frost-tower', name: '寒冰之匣', shortName: '寒冰', role: '减速', icon: Snowflake },
  { kind: 'brazier', name: '火焰杯', shortName: '火焰', role: '燃烧', icon: Flame },
  { kind: 'accelerator', name: '粒子加速器', shortName: '加速器', role: '蓄力', icon: Gauge },
  { kind: 'shutter', name: '光闸', shortName: '光闸', role: '开关', icon: DoorOpen },
  { kind: 'photo-sensor', name: '光电传感器', shortName: '传感器', role: '控制', icon: ScanLine },
  { kind: 'capacitor', name: '储能电容', shortName: '电容', role: '爆破', icon: BatteryCharging },
]

const TARGET_OPTIONS: Array<{ value: TargetStrategy; label: string }> = [
  { value: 'first', label: '最前' }, { value: 'last', label: '最后' }, { value: 'highest-health', label: '最高血量' },
  { value: 'lowest-health', label: '最低血量' }, { value: 'status-first', label: '状态优先' }, { value: 'boss-first', label: 'Boss 优先' },
]

const isEditable = (phase: BattleState['phase']) => phase !== 'victory' && phase !== 'defeat'
const LAB_WIDTH = 1200
const LAB_HEIGHT = 700

function initialLevelId() {
  const stored = Number(window.sessionStorage.getItem('tjyz-optical-current-level'))
  return Number.isInteger(stored) && stored >= 1 && stored <= OPTICAL_DEFENSE_LEVELS.length ? stored : 1
}

function useOpticalSound(enabled: boolean) {
  const contextRef = useRef<AudioContext | null>(null)
  return useCallback((frequency = 520, duration = 0.055) => {
    if (!enabled || typeof AudioContext === 'undefined') return
    const context = contextRef.current ?? new AudioContext()
    contextRef.current = context
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.035, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + duration)
  }, [enabled])
}

export function OpticalDefenseGame() {
  const [initialSave] = useState(() => readOpticalSaveResult())
  const [save, setSave] = useState<SaveData>(initialSave.save)
  const [levelId, setLevelId] = useState(initialLevelId)
  const level = OPTICAL_DEFENSE_LEVELS[levelId - 1]
  const [battle, setBattle] = useState(() => createBattleState(level))
  const [selectedTool, setSelectedTool] = useState<DeviceKind>('source-red')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snapOutput, setSnapOutput] = useState<{ placementId: string; outputIndex: number } | null>(null)
  const [message, setMessage] = useState(initialSave.recovered ? '检测到旧版或异常存档，已安全恢复可用进度。' : '实验台已就绪。')
  const [storageWarning, setStorageWarning] = useState(false)
  const [showLevels, setShowLevels] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [sceneReady, setSceneReady] = useState(false)
  const [completedStars, setCompletedStars] = useState(0)
  const [keyboardHoleIndex, setKeyboardHoleIndex] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<HTMLElement>(null)
  const sceneRef = useRef<OpticalDefenseScene | null>(null)
  const sceneSnapshotRef = useRef<SceneSnapshot | null>(null)
  const battleRef = useRef(battle)
  const callbacksRef = useRef({ onHole: (_holeId: string) => {}, onDevice: (_id: string) => {} })
  const previousEventRef = useRef(0)
  const beep = useOpticalSound(save.settings.sound)
  const availableDevices = level.availableDevices
  const selectedPlacement = battle.placements.find((placement) => placement.id === selectedId) ?? null
  const liveEnemies = battle.enemies.filter((enemy) => !enemy.dead && !enemy.escaped).length
  const defeatedEnemies = battle.enemies.filter((enemy) => enemy.dead).length
  const resolvedEnemies = battle.enemies.filter((enemy) => enemy.dead || enemy.escaped).length
  const waveProgress = battle.spawnPlan.length ? resolvedEnemies / battle.spawnPlan.length : 0
  const activeWave = battle.spawnPlan[Math.min(battle.nextSpawnIndex, battle.spawnPlan.length - 1)]?.waveNumber ?? level.waves.length
  const enemyRoster = useMemo(() => level.waves.flatMap((wave) => wave.enemies).reduce<Record<string, number>>((counts, group) => {
    counts[group.kind] = (counts[group.kind] ?? 0) + group.count
    return counts
  }, {}), [level])
  const network = useMemo(() => battle.network ?? traceOpticalNetwork(
    level,
    battle.placements,
    battle.enemies.map((enemy) => ({ ...enemy, position: pointOnPath(level.paths?.[enemy.routeIndex ?? 0] ?? level.path, enemy.progress) })),
  ), [battle, level])

  useEffect(() => {
    if (!writeOpticalSave(save)) setStorageWarning(true)
  }, [save])

  useEffect(() => {
    battleRef.current = battle
  }, [battle])

  const commitBattle = useCallback((update: BattleState | ((current: BattleState) => BattleState)) => {
    const next = typeof update === 'function' ? update(battleRef.current) : update
    battleRef.current = next
    setBattle(next)
    return next
  }, [])

  useEffect(() => {
    if (!stageRef.current) return undefined
    let disposed = false
    let game: { destroy: (removeCanvas: boolean) => void } | null = null
    void import('./OpticalDefenseScene').then(({ OpticalDefenseScene, Phaser }) => {
      if (disposed || !stageRef.current) return
      const scene = new OpticalDefenseScene({
        onHole: (holeId) => callbacksRef.current.onHole(holeId),
        onDevice: (id) => callbacksRef.current.onDevice(id),
        onReady: () => setSceneReady(true),
      })
      const snapshot = sceneSnapshotRef.current
      if (snapshot) scene.setSnapshot(snapshot)
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: stageRef.current,
        width: LAB_WIDTH,
        height: LAB_HEIGHT,
        backgroundColor: '#071014',
        render: { antialias: true, pixelArt: false, roundPixels: false },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene,
        banner: false,
        audio: { noAudio: true },
      })
      sceneRef.current = scene
    }).catch(() => {
      if (!disposed) setMessage('图形引擎加载失败，请刷新后重试。')
    })
    return () => {
      disposed = true
      sceneRef.current = null
      game?.destroy(true)
    }
  }, [])

  callbacksRef.current.onHole = (holeId: string) => {
    if (snapOutput) {
      setMessage('吸附模式：请选择一台已安装仪器作为目标。')
      return
    }
    const result = placeDevice(battleRef.current, level, selectedTool, holeId, availableDevices)
    if (!result.ok) {
      setMessage(result.reason)
      beep(180, 0.09)
      return
    }
    commitBattle(result.state)
    setSelectedId(result.state.placements.at(-1)?.id ?? null)
    setMessage(`${TOOLS.find((tool) => tool.kind === selectedTool)?.name} 已接入光路。`)
    beep(selectedTool.startsWith('source-') ? 720 : 470)
  }
  callbacksRef.current.onDevice = (id: string) => {
    if (selectedTool === 'photo-sensor' && !snapOutput) {
      const result = attachSensor(battleRef.current, id)
      if (!result.ok) setMessage(result.reason)
      else {
        commitBattle(result.state)
        setSelectedId(id)
        setMessage('传感器已附着，控制菜单已并入该仪器。')
        beep(680, 0.08)
      }
      return
    }
    if (snapOutput) {
      if (id === snapOutput.placementId) {
        setSnapOutput(null)
        setMessage('已取消输出吸附。')
        return
      }
      const source = battle.placements.find((item) => item.id === snapOutput.placementId)
      if (source?.kind === 'mirror' && !network.deviceIncomingDirections.has(source.id)) {
        setSnapOutput(null)
        setMessage('镜面尚未收到入射光，保持当前角度。')
        return
      }
      const target = battle.placements.find((item) => item.id === id)
      commitBattle((current) => snapDeviceOutputToTarget(current, level, snapOutput.placementId, snapOutput.outputIndex, id))
      setSelectedId(snapOutput.placementId)
      setSnapOutput(null)
      setMessage(`输出 ${snapOutput.outputIndex + 1} 已吸附至${TOOLS.find((tool) => tool.kind === target?.kind)?.name ?? '目标设备'}。`)
      beep(740, 0.08)
      return
    }
    setSelectedId(id)
    const placement = battle.placements.find((item) => item.id === id)
    setMessage(placement ? `${TOOLS.find((tool) => tool.kind === placement.kind)?.name} 已选中。` : '设备已选中。')
  }

  useEffect(() => {
      const snapshot = { level, battle, network, selectedId, beamGlow: save.settings.beamGlow, reduceMotion: save.settings.reduceMotion }
    sceneSnapshotRef.current = snapshot
    sceneRef.current?.setSnapshot(snapshot)
  }, [battle, level, network, save.settings.beamGlow, save.settings.reduceMotion, selectedId])

  useEffect(() => {
    if (battle.phase !== 'running') return undefined
    let frame = 0
    let last = performance.now()
    let lastReactCommit = last
    const loop = (now: number) => {
      if (now - last < 1000 / 30) {
        frame = requestAnimationFrame(loop)
        return
      }
      const delta = Math.min(0.1, (now - last) / 1000)
      last = now
      const previousPhase = battleRef.current.phase
      const next = tickBattle(battleRef.current, level, delta * save.settings.gameSpeed)
      battleRef.current = next
      const nextNetwork = next.network ?? traceOpticalNetwork(
        level,
        next.placements,
        next.enemies.map((enemy) => ({ ...enemy, position: pointOnPath(level.paths?.[enemy.routeIndex ?? 0] ?? level.path, enemy.progress) })),
      )
      sceneRef.current?.setSnapshot({
        level, battle: next, network: nextNetwork, selectedId,
        beamGlow: save.settings.beamGlow, reduceMotion: save.settings.reduceMotion,
      })
      if (now - lastReactCommit >= 100 || next.phase !== previousPhase) {
        lastReactCommit = now
        setBattle(next)
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [battle.phase, level, save.settings.beamGlow, save.settings.gameSpeed, save.settings.reduceMotion, selectedId])

  useEffect(() => {
    const advance = (event: Event) => {
      const seconds = Math.max(0, Math.min(120, Number((event as CustomEvent<number>).detail) || 0))
      let advanced = battleRef.current
      const steps = Math.ceil(seconds / 0.1)
      for (let index = 0; index < steps && advanced.phase === 'running'; index += 1) {
        advanced = tickBattle(advanced, level, Math.min(0.1, seconds - index * 0.1))
      }
      battleRef.current = advanced
      setBattle(advanced)
    }
    window.addEventListener('optical-defense:advance', advance)
    return () => window.removeEventListener('optical-defense:advance', advance)
  }, [level])

  useEffect(() => {
    const latest = battle.events.filter((event) => event.id > previousEventRef.current)
    let nextMessage = ''
    let sawExplosion = false
    latest.forEach((event) => {
      previousEventRef.current = Math.max(previousEventRef.current, event.id)
      if (event.type === 'kill') {
        if (!sawExplosion) nextMessage = `光束命中：容量 +${event.value}W。`
        beep(880, 0.07)
      } else if (event.type === 'explosion') {
        sawExplosion = true
        nextMessage = '电容释放完成，安装孔已恢复。'
        beep(110, 0.22)
      } else {
        if (!sawExplosion) nextMessage = '敌人突破光路，核心生命降低。'
        beep(140, 0.12)
      }
    })
    if (nextMessage) setMessage(nextMessage)
  }, [battle.events, beep])

  useEffect(() => {
    if (battle.phase !== 'victory') return
    const stars = scoreBattle(battle, level)
    setCompletedStars(stars)
    setSave((current) => {
      return {
        ...current,
        unlockedLevel: OPTICAL_DEFENSE_LEVELS.length,
        stars: { ...current.stars, [level.id]: Math.max(current.stars[level.id] ?? 0, stars) },
      }
    })
    setMessage('核心稳定，当前波次已清除。')
  }, [battle.phase, battle, level])

  const selectLevel = useCallback((nextLevelId: number) => {
    const nextLevel = OPTICAL_DEFENSE_LEVELS[nextLevelId - 1]
    if (!nextLevel) return
    setLevelId(nextLevelId)
    commitBattle(createBattleState(nextLevel))
    setSelectedTool(nextLevel.availableDevices[0])
    setSelectedId(null)
    setSnapOutput(null)
    setCompletedStars(0)
    setShowLevels(false)
    setMessage(`LEVEL ${String(nextLevelId).padStart(2, '0')} 光场已校准。`)
    window.sessionStorage.setItem('tjyz-optical-current-level', String(nextLevelId))
  }, [commitBattle])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const isControl = target?.closest('input, select, textarea, button, [contenteditable="true"], [role="dialog"]')
      if (isControl || !workspaceRef.current?.contains(document.activeElement)) return
      if (event.code === 'Space') {
        event.preventDefault()
        commitBattle((current) => current.phase === 'build' ? startWave(current) : togglePause(current))
      }
      if (event.key.toLowerCase() === 'r' && selectedId && isEditable(battle.phase)) commitBattle((current) => rotateDevice(current, selectedId))
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId && isEditable(battle.phase)) {
        commitBattle((current) => sellDevice(current, selectedId))
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [battle.phase, selectedId])

  const runControl = () => {
    const current = battleRef.current
    const next = current.phase === 'build' ? startWave(current) : togglePause(current)
    battleRef.current = next
    commitBattle(next)
    setMessage(current.phase === 'running' ? '光场已暂停，可调整设备。' : current.phase === 'paused' ? '光场恢复。' : '敌人波次已进入路径。')
    beep(current.phase === 'running' ? 330 : 610)
  }

  const resetLevel = () => {
    commitBattle(createBattleState(level))
    setSelectedId(null)
    setSnapOutput(null)
    setCompletedStars(0)
    setMessage('本关实验台已重置。')
  }

  const patchSelected = (patch: Parameters<typeof updateDevice>[2]) => {
    if (!selectedId || !isEditable(battle.phase)) return
    commitBattle((current) => updateDevice(current, selectedId, patch))
  }

  const detonate = () => {
    if (!selectedId) return
    const current = battleRef.current
    const result = queueCapacitorDetonation(current, selectedId)
    if (!result.ok) {
      setMessage(result.reason)
      return
    }
    battleRef.current = result.state
    commitBattle(result.state)
    setMessage(current.phase === 'paused' ? '引爆指令已缓存，恢复光场后结算。' : '引爆指令已下达。')
  }

  const toggleSetting = (key: Exclude<keyof SaveData['settings'], 'gameSpeed'>) => {
    setSave((current) => ({ ...current, settings: { ...current.settings, [key]: !current.settings[key] } }))
  }

  const setGameSpeed = (gameSpeed: 1 | 2 | 3) => {
    setSave((current) => ({ ...current, settings: { ...current.settings, gameSpeed } }))
    setMessage(`战斗速度已调整为 ${gameSpeed}×。`)
  }

  const toolGroups = useMemo(() => [
    { label: '光源', tools: TOOLS.filter((tool) => tool.kind.startsWith('source-')) },
    { label: '光路', tools: TOOLS.filter((tool) => ['mirror', 'splitter', 'combiner', 'filter', 'collector', 'shutter', 'photo-sensor'].includes(tool.kind)) },
    { label: '终端', tools: TOOLS.filter((tool) => ['bulb', 'laser-emitter', 'radiation-source', 'frost-tower', 'brazier', 'accelerator', 'capacitor'].includes(tool.kind)) },
  ], [])

  useEffect(() => setKeyboardHoleIndex(0), [levelId])

  const onBoardKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const holeId = `h-${index}`
      const placement = battle.placements.find((item) => item.holeId === holeId && !item.destroyed)
      if (placement) callbacksRef.current.onDevice(placement.id)
      else callbacksRef.current.onHole(holeId)
      return
    }
    const vectors: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
    }
    const vector = vectors[event.key]
    if (!vector) return
    event.preventDefault()
    const origin = level.holes[index]
    const next = level.holes.map((point, holeIndex) => {
      const dx = point.x - origin.x
      const dy = point.y - origin.y
      const forward = dx * vector.x + dy * vector.y
      const sideways = Math.abs(dx * vector.y - dy * vector.x)
      return { holeIndex, forward, score: forward + sideways * 2.5 }
    }).filter((candidate) => candidate.forward > 1).sort((left, right) => left.score - right.score)[0]
    if (!next) return
    setKeyboardHoleIndex(next.holeIndex)
    requestAnimationFrame(() => event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-board-hole="${next.holeIndex}"]`)?.focus())
  }

  return (
    <section className="optical-defense" aria-labelledby="optical-defense-title" data-testid="optical-defense">
      <header className="optical-defense__topbar">
        <div className="optical-defense__identity">
          <span>OPTICAL DEFENSE</span>
          <h2 id="optical-defense-title">光路塔防</h2>
        </div>
        <button className="optical-defense__level-button" type="button" onClick={() => setShowLevels(true)} data-testid="open-levels">
          <span>LEVEL</span><strong>{String(level.id).padStart(2, '0')}</strong><ChevronRight aria-hidden="true" />
        </button>
        <div className="optical-defense__meters" aria-label="战斗资源">
          <div><Zap aria-hidden="true" /><span>功率</span><strong data-testid="power-meter">{battle.usedPowerW}/{battle.capacityW}W</strong></div>
          <div><Coins aria-hidden="true" /><span>金币</span><strong>{battle.coins}</strong></div>
          <div><HeartPulse aria-hidden="true" /><span>核心</span><strong>{battle.coreHealth}/{level.coreHealth}</strong></div>
          <div><Waves aria-hidden="true" /><span>击败</span><strong>{defeatedEnemies}/{battle.spawnPlan.length}</strong></div>
        </div>
        <div className="optical-defense__top-actions">
          <div className="optical-defense__speed" aria-label="战斗倍速" data-testid="game-speed"><Gauge aria-hidden="true" />{([1, 2, 3] as const).map((speed) => <button key={speed} type="button" className={save.settings.gameSpeed === speed ? 'is-active' : ''} aria-pressed={save.settings.gameSpeed === speed} onClick={() => setGameSpeed(speed)}>{speed}×</button>)}</div>
          <button type="button" onClick={resetLevel} aria-label="重置本关" title="重置本关"><RefreshCw aria-hidden="true" /></button>
          <button type="button" onClick={() => setShowHelp(true)} aria-label="打开游戏说明" title="说明" data-testid="open-help"><HelpCircle aria-hidden="true" /></button>
          <button type="button" onClick={() => setShowSettings(true)} aria-label="打开设置" title="设置" data-testid="open-settings"><Settings aria-hidden="true" /></button>
          <button className="is-primary" type="button" onClick={runControl} disabled={battle.phase === 'victory' || battle.phase === 'defeat'} data-testid="wave-control">
            {battle.phase === 'running' ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            <span>{battle.phase === 'build' ? '启动波次' : battle.phase === 'running' ? '暂停' : '继续'}</span>
          </button>
        </div>
      </header>

      <div className="optical-defense__mission">
        <div><span>LEVEL {String(level.id).padStart(2, '0')}</span><strong>{level.title}</strong></div>
        <p>{level.lesson}</p>
        <div className="optical-defense__threats" aria-label="本关敌人编成">{Object.entries(enemyRoster).map(([kind, count]) => <span key={kind} className={`is-${kind}`}>{({ normal: '常规', fast: '高速', armored: '重甲', resistant: '抗性', boss: '首领' } as Record<string, string>)[kind]} ×{count}</span>)}</div>
        <i style={{ width: `${Math.min(100, waveProgress * 100)}%` }} />
      </div>

      <div className="optical-defense__workspace">
        <aside className="optical-defense__palette" aria-label="仪器仓">
          {toolGroups.map((group) => {
            const available = group.tools.filter((tool) => availableDevices.includes(tool.kind))
            if (!available.length) return null
            return <section key={group.label}><h3>{group.label}</h3><div>
              {available.map(({ kind, shortName, name, role, icon: Icon, color }) => {
                const sourcePower = kind.startsWith('source-') ? SOURCE_POWER_W[kind as keyof typeof SOURCE_POWER_W] : null
                return <button
                  key={kind}
                  type="button"
                  className={selectedTool === kind ? 'is-active' : ''}
                  style={color ? { '--tool-color': color } as React.CSSProperties : undefined}
                  onClick={() => { setSelectedTool(kind); setSelectedId(null); setMessage(`${name} 已进入安装位。`) }}
                  aria-pressed={selectedTool === kind}
                  title={`${name} · ${sourcePower ? `${sourcePower}W` : `${DEVICE_COSTS[kind]} 金币`}`}
                  data-testid={`tool-${kind}`}
                ><Icon aria-hidden="true" /><span>{shortName}</span><small>{sourcePower ? role : `¤${DEVICE_COSTS[kind]}`}</small></button>
              })}
            </div></section>
          })}
        </aside>

        <main
          className="optical-defense__field"
          ref={workspaceRef}
          tabIndex={0}
          aria-label="光路塔防实验台，使用方向键在安装孔之间移动，回车放置或选择设备"
          onPointerDown={() => workspaceRef.current?.focus()}
        >
          <div className="optical-defense__canvas-shell" ref={stageRef} data-testid="optical-canvas" data-scene-ready={sceneReady} aria-busy={!sceneReady}>
            <div className="optical-defense__keyboard-grid" role="grid" aria-label="可键盘操作的仪器安装孔">
              {level.holes.map((point, index) => {
                const holeId = `h-${index}`
                const placement = battle.placements.find((item) => item.holeId === holeId && !item.destroyed)
                const name = placement ? TOOLS.find((tool) => tool.kind === placement.kind)?.name : null
                return <button
                  key={holeId}
                  type="button"
                  role="gridcell"
                  tabIndex={index === keyboardHoleIndex ? 0 : -1}
                  aria-label={placement ? `${holeId.toUpperCase()}，已安装${name}，按回车选择` : `${holeId.toUpperCase()}，空安装孔，按回车放置${TOOLS.find((tool) => tool.kind === selectedTool)?.name}`}
                  data-board-hole={index}
                  style={{ left: `${point.x / LAB_WIDTH * 100}%`, top: `${point.y / LAB_HEIGHT * 100}%` }}
                  onFocus={() => setKeyboardHoleIndex(index)}
                  onKeyDown={(event) => onBoardKeyDown(event, index)}
                  onClick={() => placement ? callbacksRef.current.onDevice(placement.id) : callbacksRef.current.onHole(holeId)}
                />
              })}
            </div>
          </div>
          <div className="optical-defense__field-status">
            <span className={`is-${battle.phase}`}>{battle.phase === 'build' ? '布防' : battle.phase === 'running' ? '运行' : battle.phase === 'paused' ? '暂停' : battle.phase === 'victory' ? '完成' : '核心失效'}</span>
            <output role="status" aria-live="polite">{message}</output>
            {storageWarning && <em role="alert">本地保存不可用，仅保留本次会话</em>}
            <b>波次 {activeWave}/{level.waves.length} · {liveEnemies} 在途 · {battle.nextSpawnIndex}/{battle.spawnPlan.length} 已部署</b>
          </div>
        </main>

        <aside className="optical-defense__inspector" aria-label="设备参数">
          <header><ListFilter aria-hidden="true" /><span>设备参数</span></header>
          {selectedPlacement ? <DeviceInspector
            placement={selectedPlacement}
            phase={battle.phase}
            placements={battle.placements}
            inputPower={network.deviceInputs.get(selectedPlacement.id)}
            focusedPower={network.focusedInputs.get(selectedPlacement.id)}
            sensorTriggered={network.sensorTriggeredIds.has(selectedPlacement.id)}
            shutterOpen={network.shutterStates.get(selectedPlacement.id)}
            onRotate={(amount) => commitBattle((current) => rotateDevice(current, selectedPlacement.id, amount))}
            onSetRotation={(rotation) => commitBattle((current) => setDeviceRotation(current, selectedPlacement.id, rotation))}
            onUpgrade={() => {
              const result = upgradeDevice(battleRef.current, selectedPlacement.id)
              if (!result.ok) setMessage(result.reason)
              else {
                commitBattle(result.state)
                setMessage(`${TOOLS.find((tool) => tool.kind === selectedPlacement.kind)?.name} 已升级至 LV.${deviceLevel(selectedPlacement) + 1}。`)
                beep(820, 0.08)
              }
            }}
            onSell={() => { commitBattle((current) => sellDevice(current, selectedPlacement.id)); setSelectedId(null); setMessage('设备已回收。') }}
            onPatch={patchSelected}
            onDetonate={detonate}
            snappingOutput={snapOutput?.placementId === selectedPlacement.id ? snapOutput.outputIndex : null}
            onSnap={(outputIndex) => {
              if (snapOutput?.placementId === selectedPlacement.id && snapOutput.outputIndex === outputIndex) {
                setSnapOutput(null)
                setMessage('已取消输出吸附。')
              } else {
                setSnapOutput({ placementId: selectedPlacement.id, outputIndex })
                setMessage(`吸附模式：为输出 ${outputIndex + 1} 选择目标仪器。`)
              }
            }}
          /> : <div className="optical-defense__empty-inspector"><Layers3 aria-hidden="true" /><strong>仪器总览</strong><dl><div><dt>已安装</dt><dd>{battle.placements.length}</dd></div><div><dt>光束容量</dt><dd>{battle.capacityW - battle.usedPowerW}W</dd></div><div><dt>已击败</dt><dd>{defeatedEnemies}</dd></div></dl></div>}
        </aside>
      </div>

      {showLevels && <div className="optical-defense__overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowLevels(false)}>
        <section className="optical-defense__modal optical-defense__level-modal" role="dialog" aria-modal="true" aria-labelledby="optical-levels-title">
          <header><div><span>MISSION ARCHIVE</span><h3 id="optical-levels-title">关卡档案</h3></div><button onClick={() => setShowLevels(false)} aria-label="关闭关卡档案"><X /></button></header>
          <div className="optical-defense__level-grid">
            {OPTICAL_DEFENSE_LEVELS.map((item) => <button key={item.id} type="button" className={item.id === level.id ? 'is-current' : ''} onClick={() => selectLevel(item.id)} data-testid={`level-${item.id}`}>
              <span>{String(item.id).padStart(2, '0')}</span><strong>{item.title}</strong><small>{`${'★'.repeat(save.stars[item.id] ?? 0)}${'☆'.repeat(3 - (save.stars[item.id] ?? 0))}`}</small>
            </button>)}
          </div>
        </section>
      </div>}

      {showSettings && <div className="optical-defense__overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowSettings(false)}>
        <section className="optical-defense__modal optical-defense__settings" role="dialog" aria-modal="true" aria-labelledby="optical-settings-title">
          <header><div><span>SYSTEM</span><h3 id="optical-settings-title">光场设置</h3></div><button onClick={() => setShowSettings(false)} aria-label="关闭设置"><X /></button></header>
          <label><span><strong>程序化音效</strong><small>命中、部署与爆破反馈</small></span><input type="checkbox" checked={save.settings.sound} onChange={() => toggleSetting('sound')} data-testid="setting-sound" /></label>
          <label><span><strong>光束辉光</strong><small>多层叠加显示功率密度</small></span><input type="checkbox" checked={save.settings.beamGlow} onChange={() => toggleSetting('beamGlow')} /></label>
          <label><span><strong>减少动态效果</strong><small>缩短爆炸与界面过渡</small></span><input type="checkbox" checked={save.settings.reduceMotion} onChange={() => toggleSetting('reduceMotion')} /></label>
          <button className="optical-defense__restore-settings" onClick={() => setSave((current) => ({ ...current, settings: DEFAULT_SAVE.settings }))}>恢复默认</button>
        </section>
      </div>}

      {showHelp && <div className="optical-defense__overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowHelp(false)}>
        <section className="optical-defense__modal optical-defense__help" role="dialog" aria-modal="true" aria-labelledby="optical-help-title" data-testid="help-dialog">
          <header><div><span>FIELD MANUAL</span><h3 id="optical-help-title">游戏说明</h3></div><button onClick={() => setShowHelp(false)} aria-label="关闭游戏说明"><X /></button></header>
          <div className="optical-defense__help-grid">
            <article><h4>玩法</h4><p>在非路线安装孔布置光源、光路仪器与攻击终端。启动后敌人沿路线前进；游戏运行时仍可放置、升级、出售和编辑仪器。阻止敌人抵达核心即可获胜。</p></article>
            <article><h4>光路与吸附</h4><p>光束会被沿途第一个敌人或仪器截获。光源、镜面、分束器、合束器、滤光片、收集器与光闸均可指定输出目标；分束器每一路可独立吸附，角度不受限制且总输出不超过输入。</p></article>
            <article><h4>仪器</h4><p>灯泡、辐射源、寒冰与火焰负责范围效果，激光与加速器负责单体。收集器回收其范围内多个范围仪器的逸散能量，效率随等级提高。传感器需附着到已有仪器，其控制项会显示在宿主菜单中。</p></article>
            <article><h4>敌人与抗性</h4><p>高速敌人移动更快，重甲敌人减免未破甲伤害，抗性敌人显著削弱对应颜色，首领拥有护盾与更高核心伤害。混合不同颜色和状态反应可处理后期编成。</p></article>
          </div>
        </section>
      </div>}

      {battle.phase === 'victory' && completedStars > 0 && <div className="optical-defense__overlay">
        <section className="optical-defense__modal optical-defense__result" role="dialog" aria-modal="true" aria-labelledby="optical-result-title">
          <Sparkles aria-hidden="true" /><span>MISSION COMPLETE</span><h3 id="optical-result-title">光路稳定</h3><div className="optical-defense__stars">{'★'.repeat(completedStars)}{'☆'.repeat(3 - completedStars)}</div>
          <dl><div><dt>核心生命</dt><dd>{battle.coreHealth}/{level.coreHealth}</dd></div><div><dt>通关时间</dt><dd>{battle.elapsedSeconds.toFixed(1)}s</dd></div><div><dt>功率效率</dt><dd>{Math.round((1 - battle.usedPowerW / battle.capacityW) * 100)}%</dd></div></dl>
          <div><button onClick={resetLevel}><RefreshCw />重试</button>{level.id < OPTICAL_DEFENSE_LEVELS.length && <button className="is-primary" onClick={() => selectLevel(level.id + 1)}>下一关<ChevronRight /></button>}</div>
        </section>
      </div>}

      {battle.phase === 'defeat' && <div className="optical-defense__overlay">
        <section className="optical-defense__modal optical-defense__result" role="dialog" aria-modal="true" aria-labelledby="optical-defeat-title"><Shield aria-hidden="true" /><span>CORE OFFLINE</span><h3 id="optical-defeat-title">核心失守</h3><button className="is-primary" onClick={resetLevel}><RefreshCw />重新校准</button></section>
      </div>}
    </section>
  )
}

function DeviceInspector({
  placement, placements, phase, inputPower, focusedPower, sensorTriggered, shutterOpen,
  onRotate, onSetRotation, onUpgrade, onSell, onPatch, onDetonate, snappingOutput, onSnap,
}: {
  placement: DevicePlacement
  placements: DevicePlacement[]
  phase: BattleState['phase']
  inputPower?: RgbPower
  focusedPower?: RgbPower
  sensorTriggered: boolean
  shutterOpen?: boolean
  onRotate: (amount: number) => void
  onSetRotation: (rotation: number) => void
  onUpgrade: () => void
  onSell: () => void
  onPatch: (patch: Parameters<typeof updateDevice>[2]) => void
  onDetonate: () => void
  snappingOutput: number | null
  onSnap: (outputIndex: number) => void
}) {
  const tool = TOOLS.find((item) => item.kind === placement.kind)!
  const Icon = tool.icon
  const editable = isEditable(phase)
  const ratios = placement.splitRatios ?? [0.5, 0.5]
  const input = inputPower ?? { r: 0, g: 0, b: 0 }
  const focusedWatts = totalPower(focusedPower ?? { r: 0, g: 0, b: 0 })
  const upgradeCost = deviceUpgradeCost(placement)
  const acceleratorMaximum = ACCELERATOR_MAX_CHARGE_J * (1 + (deviceLevel(placement) - 1) * 0.2)
  const capacitorMaximum = 450 * (1 + (deviceLevel(placement) - 1) * 0.25)
  const shutters = placements.filter((item) => item.kind === 'shutter' && !item.destroyed)
  const setRatio = (index: number, value: number) => {
    const next = [...ratios]
    next[index] = value
    const sum = next.reduce((total, ratio) => total + ratio, 0)
    onPatch({ splitRatios: sum > 1 ? next.map((ratio) => ratio / sum) : next })
  }
  return <div className="optical-defense__device" data-testid="selected-device">
    <div className="optical-defense__device-title"><i style={{ '--tool-color': tool.color } as React.CSSProperties}><Icon /></i><span><strong>{tool.name}</strong><small>{tool.role} · {placement.holeId.toUpperCase()} · LV.{deviceLevel(placement)}</small></span></div>
    <dl>
      <div><dt>实际输入</dt><dd>{Math.round(totalPower(input))}W</dd></div>
      <div><dt>光谱 RGB</dt><dd>{Math.round(input.r)} / {Math.round(input.g)} / {Math.round(input.b)}</dd></div>
      <div><dt>聚焦分量</dt><dd>{focusedWatts > 0 ? `${Math.round(focusedWatts)}W` : '无'}</dd></div>
      <div><dt>角度</dt><dd>{placement.rotationDeg.toFixed(1)}°</dd></div>
    </dl>
    {placement.kind === 'mirror' && <fieldset><legend>镜面控制</legend>
      <div className="optical-defense__segments"><button className={(placement.mirrorMode ?? 'fixed') === 'fixed' ? 'is-active' : ''} onClick={() => onPatch({ mirrorMode: 'fixed' })} disabled={!editable}>固定方向</button><button className={placement.mirrorMode === 'auto' ? 'is-active' : ''} onClick={() => onPatch({ mirrorMode: 'auto' })} disabled={!editable}>自动攻击</button></div>
      <label><span>目标策略</span><select value={placement.targetStrategy ?? 'first'} disabled={!editable} onChange={(event) => onPatch({ targetStrategy: event.target.value as TargetStrategy })}>{TARGET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="optical-defense__switch-row"><span>15° 角度吸附</span><input type="checkbox" checked={placement.rotationSnap !== false} disabled={!editable} onChange={(event) => onPatch({ rotationSnap: event.target.checked })} /></label>
      <div className="optical-defense__angle-control"><button type="button" aria-label="角度减一度" onClick={() => onRotate(-1)} disabled={!editable}><Minus /></button><input type="number" min="0" max="359.9" step={placement.rotationSnap === false ? 1 : 15} value={Number(placement.rotationDeg.toFixed(1))} disabled={!editable} onChange={(event) => onSetRotation(Number(event.target.value))} aria-label="镜面角度" /><button type="button" aria-label="角度加一度" onClick={() => onRotate(1)} disabled={!editable}><Plus /></button></div>
      <input type="range" min="0" max="359" step={placement.rotationSnap === false ? 1 : 15} value={placement.rotationDeg} disabled={!editable} onChange={(event) => onSetRotation(Number(event.target.value))} aria-label="镜面角度滑杆" />
    </fieldset>}
    {placement.kind === 'splitter' && <fieldset><legend>分光比例</legend><div className="optical-defense__segments"><button className={ratios.length === 2 ? 'is-active' : ''} onClick={() => onPatch({ splitRatios: [0.5, 0.5] })} disabled={!editable}>2 路</button><button className={ratios.length === 3 ? 'is-active' : ''} onClick={() => onPatch({ splitRatios: [0.34, 0.33, 0.33] })} disabled={!editable}>3 路</button></div>{ratios.map((ratio, index) => <label key={index}><span>输出 {index + 1}<output>{Math.round(ratio * 100)}%</output></span><input type="range" min="0" max="1" step="0.05" value={ratio} disabled={!editable} onChange={(event) => setRatio(index, Number(event.target.value))} /></label>)}</fieldset>}
    {placement.kind === 'collector' && <div className="optical-defense__collector"><strong>收集效率 {10 + (deviceLevel(placement) - 1) * 5}%</strong><small>回收范围内灯泡、辐射源、寒冰与火焰的逸散能量；多台收集器共享有限能量池。</small></div>}
    {placement.kind === 'filter' && <label><span>通过颜色</span><select value={placement.filterColor ?? 'r'} disabled={!editable} onChange={(event) => onPatch({ filterColor: event.target.value as 'r' | 'g' | 'b' })}><option value="r">红</option><option value="g">绿</option><option value="b">蓝</option></select></label>}
    {placement.hasSensor && <fieldset><legend>附着传感器</legend>
      <label><span>控制光闸</span><select value={placement.sensorTargetId ?? ''} disabled={!editable} onChange={(event) => onPatch({ sensorTargetId: event.target.value || undefined })}><option value="">未连接</option>{shutters.map((shutter) => <option key={shutter.id} value={shutter.id}>{shutter.holeId.toUpperCase()}</option>)}</select></label>
      <label><span>检测通道</span><select value={placement.sensorChannel ?? 'any'} disabled={!editable} onChange={(event) => onPatch({ sensorChannel: event.target.value as SensorChannel })}><option value="any">总功率</option><option value="r">红光</option><option value="g">绿光</option><option value="b">蓝光</option></select></label>
      <label><span>触发阈值 <output>{placement.sensorThresholdW ?? 10}W</output></span><input type="range" min="1" max="150" step="1" value={placement.sensorThresholdW ?? 10} disabled={!editable} onChange={(event) => onPatch({ sensorThresholdW: Number(event.target.value) })} /></label>
      <label><span>触发动作</span><select value={placement.sensorAction ?? 'open-when-triggered'} disabled={!editable} onChange={(event) => onPatch({ sensorAction: event.target.value as SensorAction })}><option value="open-when-triggered">有光时开启</option><option value="close-when-triggered">有光时关闭</option></select></label>
      <output className={`optical-defense__sensor-state ${sensorTriggered ? 'is-triggered' : ''}`}>{sensorTriggered ? '已触发' : '等待信号'}</output>
    </fieldset>}
    {placement.kind === 'shutter' && <label className="optical-defense__switch-row"><span>手动状态 · {shutterOpen === false ? '关闭' : '开启'}</span><input type="checkbox" checked={placement.enabled !== false} disabled={!editable} onChange={(event) => onPatch({ enabled: event.target.checked })} /></label>}
    {placement.kind === 'accelerator' && <div className="optical-defense__capacitor"><span><Gauge />{({ idle: '待机', charging: '充能', ready: '待发', cooldown: '冷却' } as const)[placement.acceleratorPhase ?? 'idle']} <output>{Math.round(placement.acceleratorChargeJ ?? 0)}/{Math.round(acceleratorMaximum)}J</output></span><i><b style={{ width: `${Math.min(100, (placement.acceleratorChargeJ ?? 0) / acceleratorMaximum * 100)}%` }} /></i><small>最低输入 {ACCELERATOR_MIN_INPUT_W}W{(placement.acceleratorCooldownS ?? 0) > 0 ? ` · ${(placement.acceleratorCooldownS ?? 0).toFixed(1)}s` : ''}</small></div>}
    {placement.kind === 'capacitor' && <div className="optical-defense__capacitor"><span><BatteryCharging />储能 <output>{Math.round(placement.chargeJ ?? 0)}/{Math.round(capacitorMaximum)}J</output></span><i><b style={{ width: `${Math.min(100, (placement.chargeJ ?? 0) / capacitorMaximum * 100)}%` }} /></i><button onClick={onDetonate} disabled={(placement.chargeJ ?? 0) <= 0 || placement.detonateQueued} data-testid="detonate-capacitor"><Zap />{placement.detonateQueued ? '已下达' : '引爆'}</button></div>}
    {(['source-red', 'source-green', 'source-blue', 'mirror', 'splitter', 'combiner', 'filter', 'collector', 'shutter'] as DeviceKind[]).includes(placement.kind) && Array.from({ length: placement.kind === 'splitter' ? ratios.length : 1 }, (_, outputIndex) => <button key={outputIndex} className={`optical-defense__snap-action${snappingOutput === outputIndex ? ' is-active' : ''}`} onClick={() => onSnap(outputIndex)} disabled={!editable} data-testid={placement.kind === 'mirror' ? 'snap-mirror' : `snap-output-${outputIndex}`}><Link2 />{snappingOutput === outputIndex ? '取消吸附' : placement.outputTargetIds?.[outputIndex] || (outputIndex === 0 && placement.snapTargetId) ? `重设输出 ${outputIndex + 1}` : `吸附输出 ${outputIndex + 1}`}</button>)}
    <div className="optical-defense__device-actions"><button onClick={onUpgrade} disabled={!editable || upgradeCost === null}><Sparkles />{upgradeCost === null ? '已满级' : `升级 ¤${upgradeCost}`}</button><button onClick={onSell} disabled={!editable}><Trash2 />出售</button></div>
    {placement.kind !== 'mirror' && <button className="optical-defense__snap-action" onClick={() => onRotate(15)} disabled={!editable}><RotateCw />旋转 15°</button>}
  </div>
}

export default OpticalDefenseGame
