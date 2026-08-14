import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BatteryCharging, BookOpen, Check, ChevronRight, CircleDot, Coins, Combine, Crosshair, DoorOpen, Filter,
  Flame, Gauge, HeartPulse, HelpCircle, Layers3, Lightbulb, Link2, ListFilter, Pause, Play, RadioTower,
  Minus, Plus, RefreshCw, RotateCw, ScanLine, Settings, Shield, SlidersHorizontal, Snowflake, Sparkles,
  SplitSquareHorizontal, SquareStack, Trash2, Triangle, Waves, X, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import './opticalDefense.css'
import { OPTICAL_DEFENSE_LEVELS } from './levels'
import type { OpticalDefenseScene, SceneSnapshot } from './OpticalDefenseScene'
import {
  ACCELERATOR_MAX_CHARGE_J, ACCELERATOR_MIN_INPUT_W, advanceBattle, attachSensor, clearEnemies, continueAfterCoreLoss,
  createBattleState, DEVICE_COSTS, deviceLevel, deviceUpgradeCost, placeDevice, pointOnPath, queueCapacitorDetonation,
  rebuildSpawnPlan, rotateDevice, scoreBattle, sellDevice, setDeviceRotation, snapDeviceOutputToTarget, startWave,
  TERMINAL_ATTACK_PROFILES, togglePause, updateDevice, upgradeDevice,
} from './simulation'
import type { BattleState } from './simulation'
import { prismSplitPower, scaleRgb, SOURCE_POWER_W, sourceRgb, splitPower, totalPower } from './rules'
import { OPTICAL_TRANSMISSION, splitterOutputCount, traceOpticalNetwork } from './optics'
import { DEFAULT_SAVE, readOpticalSaveResult, writeOpticalSave } from './storage'
import {
  buildCustomLevel, CUSTOM_LEVEL_ID, createDefaultCustomConfig, loadCustomConfig, saveCustomConfig,
} from './customLevel'
import type { CustomLevelConfig } from './customLevel'
import { CustomLevelBuilder } from './CustomLevelBuilder'
import { CustomLevelConsole } from './CustomLevelConsole'
import type { DeviceKind, DevicePlacement, Point, RgbPower, SaveData, SensorAction, SensorChannel, TargetStrategy } from './types'

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
  { kind: 'prism-splitter', name: '棱镜分束器', shortName: '棱镜', role: 'RGB 色散', icon: Triangle },
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

type TutorialStep = { id: string; label: string; complete: boolean }

const TUTORIAL_LEVELS = new Set([1, 3, 4, 5, 6, 7, 8, 9])

const MANUAL_TABS = ['快速上手', '颜色与反应', '光路仪器', '攻击终端', '敌人', '数值'] as const
type ManualTab = typeof MANUAL_TABS[number]

type ConfirmKind = 'reset-level' | 'reset-map' | 'reset-custom-level' | 'reset-enemies' | 'reset-tuning'

const CONFIRM_META: Record<ConfirmKind, { title: string; message: string; confirmLabel: string }> = {
  'reset-level': { title: '重置本关', message: '确定要重置本关吗？当前布防与战斗进度将被清空。', confirmLabel: '重置本关' },
  'reset-map': { title: '重置地图', message: '确定要重置地图吗？自定义的地图、路径与全部参数将恢复到初始状态。', confirmLabel: '重置地图' },
  'reset-custom-level': { title: '重置关卡', message: '确定要重置关卡吗？将保留当前地图与参数，清空敌人和全部仪器。', confirmLabel: '重置关卡' },
  'reset-enemies': { title: '重置敌人', message: '确定要清除所有在场敌人吗？', confirmLabel: '重置敌人' },
  'reset-tuning': { title: '恢复默认调参', message: '确定要将第二十关的全部参数恢复到默认值吗？', confirmLabel: '恢复默认' },
}

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
  const [customConfig, setCustomConfig] = useState<CustomLevelConfig>(() => loadCustomConfig())
  const level = useMemo(
    () => levelId === CUSTOM_LEVEL_ID ? buildCustomLevel(customConfig) : OPTICAL_DEFENSE_LEVELS[levelId - 1],
    [customConfig, levelId],
  )
  const [battle, setBattle] = useState(() => createBattleState(level))
  const levelRef = useRef(level)
  levelRef.current = level
  const [builderOpen, setBuilderOpen] = useState(() => levelId === CUSTOM_LEVEL_ID)
  const [showConsole, setShowConsole] = useState(false)
  const [resetMenuOpen, setResetMenuOpen] = useState(false)
  const [confirmState, setConfirmState] = useState<ConfirmKind | null>(null)
  const [selectedTool, setSelectedTool] = useState<DeviceKind>('source-red')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snapOutput, setSnapOutput] = useState<{ placementId: string; outputIndex: number } | null>(null)
  const [message, setMessage] = useState(initialSave.recovered ? '检测到旧版或异常存档，已安全恢复可用进度。' : '实验台已就绪。')
  const [storageWarning, setStorageWarning] = useState(false)
  const [showLevels, setShowLevels] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [manualTab, setManualTab] = useState<ManualTab>('快速上手')
  const [tutorialOpen, setTutorialOpen] = useState(() => !initialSave.save.tutorial.dismissed)
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
  const tutorialPlacementKindsRef = useRef<Set<DeviceKind>>(new Set())
  const tutorialSnappedRef = useRef(false)
  const tutorialWaveStartedRef = useRef(false)
  const tutorialFirstKillRef = useRef(false)
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

  const tutorialSteps = useMemo<TutorialStep[]>(() => {
    const placed = new Set([...tutorialPlacementKindsRef.current, ...battle.placements.map((placement) => placement.kind)])
    if (level.id === 1) return [
      { id: 'select-red', label: '选择红光源', complete: selectedTool === 'source-red' || placed.has('source-red') },
      { id: 'place-source', label: '放置红光源', complete: placed.has('source-red') },
      { id: 'place-mirror', label: '放置平面镜', complete: placed.has('mirror') },
      { id: 'place-bulb', label: '放置灯泡', complete: placed.has('bulb') },
      { id: 'snap', label: '将镜面输出吸附到灯泡', complete: tutorialSnappedRef.current },
      { id: 'start', label: '启动波次', complete: tutorialWaveStartedRef.current || battle.phase !== 'build' },
      { id: 'kill', label: '观察首次击杀', complete: tutorialFirstKillRef.current || battle.enemies.some((enemy) => enemy.dead) },
    ]
    const contextual: Record<number, TutorialStep[]> = {
      3: [{ id: 'shutter', label: '让光束通过光闸，再关闭并比较输出', complete: placed.has('shutter') }],
      4: [{ id: 'split', label: '用分束器为两个终端分别供光', complete: placed.has('splitter') && battle.placements.some((placement) => placement.kind === 'splitter' && (placement.outputTargetIds?.filter(Boolean).length ?? 0) >= 2) }],
      5: [{ id: 'mix', label: '合成双色光并触发点燃或冷热冲击', complete: placed.has('combiner') && battle.enemies.some((enemy) => enemy.status.burnSeconds > 0 || enemy.status.armorBrokenSeconds > 0) }],
      6: [{ id: 'prism', label: '将复色光送入棱镜，独立吸附 RGB 三路', complete: battle.placements.some((placement) => placement.kind === 'prism-splitter' && (placement.outputTargetIds?.filter(Boolean).length ?? 0) >= 3) }],
      7: [{ id: 'resistance', label: '用不同颜色应对抗性，并让收集器回收能量', complete: placed.has('collector') && network.collectorInputs.size > 0 }],
      8: [{ id: 'sensor', label: '把传感器附着到设备并控制光闸', complete: battle.placements.some((placement) => placement.hasSensor && placement.sensorTargetId) }],
      9: [{ id: 'white', label: '合成白光破盾，再尝试加速器或电容', complete: battle.enemies.some((enemy) => enemy.status.vulnerableSeconds > 0) || placed.has('accelerator') || placed.has('capacitor') }],
    }
    return contextual[level.id] ?? []
  }, [battle, level.id, network.collectorInputs.size, selectedTool])
  const tutorialComplete = tutorialSteps.length > 0 && tutorialSteps.every((step) => step.complete)
  const recommendedHoleIds = useMemo(() => level.id === 1 && tutorialOpen && !tutorialComplete
    ? [
        !battle.placements.some((placement) => placement.kind === 'source-red') ? 'h-0' : undefined,
        !battle.placements.some((placement) => placement.kind === 'mirror') ? 'h-2' : undefined,
        !battle.placements.some((placement) => placement.kind === 'bulb') ? 'h-16' : undefined,
        battle.placements.filter((placement) => placement.kind === 'source-red').length < 2 ? 'h-39' : undefined,
        battle.placements.filter((placement) => placement.kind === 'bulb').length < 2 ? 'h-40' : undefined,
      ].filter((holeId): holeId is string => Boolean(holeId))
    : [], [battle.placements, level.id, tutorialComplete, tutorialOpen])

  useEffect(() => {
    if (!writeOpticalSave(save)) setStorageWarning(true)
  }, [save])

  useEffect(() => {
    saveCustomConfig(customConfig)
  }, [customConfig])

  useEffect(() => {
    if (save.tutorial.dismissed || save.tutorial.completedLevels.includes(level.id) || !TUTORIAL_LEVELS.has(level.id)) return
    setTutorialOpen(true)
  }, [level.id, save.tutorial.completedLevels, save.tutorial.dismissed])

  useEffect(() => {
    if (!tutorialComplete || save.tutorial.completedLevels.includes(level.id)) return
    setSave((current) => ({
      ...current,
      tutorial: { ...current.tutorial, completedLevels: [...current.tutorial.completedLevels, level.id].sort((a, b) => a - b) },
    }))
  }, [level.id, save.tutorial.completedLevels, tutorialComplete])

  useEffect(() => {
    if (initialSave.save.tutorial.dismissed || initialSave.save.tutorial.completedLevels.includes(level.id)) return
    requestAnimationFrame(() => workspaceRef.current?.scrollIntoView({ behavior: save.settings.reduceMotion ? 'auto' : 'smooth', block: 'center' }))
  // This should run only for the first mounted level, not after every setting change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    if (!stageRef.current || builderOpen) return undefined
    let disposed = false
    let game: { destroy: (removeCanvas: boolean) => void } | null = null
    void import('./OpticalDefenseScene').then(({ OpticalDefenseScene, Phaser }) => {
      if (disposed || !stageRef.current || builderOpen) return
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
  }, [builderOpen, levelId])

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
    tutorialPlacementKindsRef.current.add(selectedTool)
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
      if (source?.kind === 'mirror' && target?.kind === 'bulb') tutorialSnappedRef.current = true
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
      const snapshot = { level, battle, network, selectedId, beamGlow: save.settings.beamGlow, reduceMotion: save.settings.reduceMotion, recommendedHoleIds }
    sceneSnapshotRef.current = snapshot
    sceneRef.current?.setSnapshot(snapshot)
  }, [battle, level, network, recommendedHoleIds, save.settings.beamGlow, save.settings.reduceMotion, selectedId])

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
      const next = advanceBattle(battleRef.current, level, delta * save.settings.gameSpeed)
      battleRef.current = next
      const nextNetwork = next.network ?? traceOpticalNetwork(
        level,
        next.placements,
        next.enemies.map((enemy) => ({ ...enemy, position: pointOnPath(level.paths?.[enemy.routeIndex ?? 0] ?? level.path, enemy.progress) })),
      )
      sceneRef.current?.setSnapshot({
        level, battle: next, network: nextNetwork, selectedId,
        beamGlow: save.settings.beamGlow, reduceMotion: save.settings.reduceMotion, recommendedHoleIds,
      })
      if (now - lastReactCommit >= 100 || next.phase !== previousPhase) {
        lastReactCommit = now
        setBattle(next)
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [battle.phase, level, recommendedHoleIds, save.settings.beamGlow, save.settings.gameSpeed, save.settings.reduceMotion, selectedId])

  useEffect(() => {
    const advance = (event: Event) => {
      const seconds = Math.max(0, Math.min(120, Number((event as CustomEvent<number>).detail) || 0))
      const advanced = advanceBattle(battleRef.current, level, seconds)
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
        tutorialFirstKillRef.current = true
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
    const isCustom = nextLevelId === CUSTOM_LEVEL_ID
    const targetLevel = isCustom ? buildCustomLevel(customConfig) : nextLevel
    setLevelId(nextLevelId)
    commitBattle(createBattleState(targetLevel))
    setSelectedTool(targetLevel.availableDevices[0])
    setSelectedId(null)
    setSnapOutput(null)
    setCompletedStars(0)
    tutorialPlacementKindsRef.current.clear()
    tutorialSnappedRef.current = false
    tutorialWaveStartedRef.current = false
    tutorialFirstKillRef.current = false
    setBuilderOpen(isCustom)
    setShowConsole(false)
    setResetMenuOpen(false)
    setShowLevels(false)
    setMessage(isCustom ? '第二十关：请先构建你的自定义地图，再进入实验台。' : `LEVEL ${String(nextLevelId).padStart(2, '0')} 光场已校准。`)
    window.sessionStorage.setItem('tjyz-optical-current-level', String(nextLevelId))
  }, [commitBattle, customConfig])

  useEffect(() => {
    if (builderOpen) return undefined
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
  }, [battle.phase, builderOpen, selectedId])

  const runControl = () => {
    const current = battleRef.current
    const next = current.phase === 'build' ? startWave(current) : togglePause(current)
    if (current.phase === 'build') tutorialWaveStartedRef.current = true
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
    tutorialPlacementKindsRef.current.clear()
    tutorialSnappedRef.current = false
    tutorialWaveStartedRef.current = false
    tutorialFirstKillRef.current = false
    setMessage('本关实验台已重置。')
  }

  const startCustomLevel = () => {
    const customLevel = buildCustomLevel(customConfig)
    commitBattle(createBattleState(customLevel))
    setSelectedTool(customLevel.availableDevices[0])
    setSelectedId(null)
    setSnapOutput(null)
    setCompletedStars(0)
    tutorialPlacementKindsRef.current.clear()
    setBuilderOpen(false)
    setMessage('第二十关实验台已就绪，可点击控制台实时调整参数。')
  }

  const resetCustomMap = () => {
    const fresh = createDefaultCustomConfig()
    setCustomConfig(fresh)
    setBuilderOpen(true)
    commitBattle(createBattleState(buildCustomLevel(fresh)))
    setSelectedId(null)
    setSnapOutput(null)
    setCompletedStars(0)
    setResetMenuOpen(false)
    setMessage('地图已重置为初始状态。')
  }

  const resetCustomLevel = () => {
    commitBattle(createBattleState(level))
    setSelectedId(null)
    setSnapOutput(null)
    setCompletedStars(0)
    tutorialPlacementKindsRef.current.clear()
    setResetMenuOpen(false)
    setMessage('本关实验台已重置，地图与参数保留。')
  }

  const resetCustomEnemies = () => {
    // 核心已失守时选择「重置敌人」：清空威胁、恢复核心并继续作战。
    commitBattle((current) => current.phase === 'defeat'
      ? { ...clearEnemies(current), phase: 'running', coreHealth: level.coreHealth }
      : clearEnemies(current))
    setResetMenuOpen(false)
    setMessage('在场敌人已全部清除。')
  }

  const continueCustomAfterCoreLoss = () => {
    commitBattle((current) => continueAfterCoreLoss(current, level))
    setMessage('核心生命已恢复，继续作战。')
  }

  const resetCustomTuning = () => {
    const fresh = createDefaultCustomConfig()
    applyCustomConfig({ ...customConfig, tuning: fresh.tuning })
    setMessage('第二十关调参已恢复默认。')
  }

  const runConfirm = (kind: ConfirmKind) => {
    if (kind === 'reset-level') resetLevel()
    else if (kind === 'reset-map') resetCustomMap()
    else if (kind === 'reset-custom-level') resetCustomLevel()
    else if (kind === 'reset-enemies') resetCustomEnemies()
    else if (kind === 'reset-tuning') resetCustomTuning()
  }

  const applyCustomConfig = (next: CustomLevelConfig) => {
    setCustomConfig(next)
    commitBattle((current) => rebuildSpawnPlan({
      ...current,
      coins: next.startingCoins,
      capacityW: next.capacityW,
      coreHealth: next.coreHealth,
    }, buildCustomLevel(next)))
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
    { label: '光路', tools: TOOLS.filter((tool) => ['mirror', 'splitter', 'prism-splitter', 'combiner', 'filter', 'collector', 'shutter', 'photo-sensor'].includes(tool.kind)) },
    { label: '终端', tools: TOOLS.filter((tool) => ['bulb', 'laser-emitter', 'radiation-source', 'frost-tower', 'brazier', 'accelerator', 'capacitor'].includes(tool.kind)) },
  ], [])

  useEffect(() => setKeyboardHoleIndex(0), [levelId])

  // 键盘网格回调全部基于 ref 读取最新状态，保证可被 KeyboardGrid 稳定复用（减少战斗步进的重复渲染）。
  const onBoardActivate = useCallback((index: number) => {
    const holeId = `h-${index}`
    const placement = battleRef.current.placements.find((item) => item.holeId === holeId && !item.destroyed)
    if (placement) callbacksRef.current.onDevice(placement.id)
    else callbacksRef.current.onHole(holeId)
  }, [])

  const onBoardFocus = useCallback((index: number) => {
    setKeyboardHoleIndex(index)
  }, [])

  const onBoardKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const holeId = `h-${index}`
      const placement = battleRef.current.placements.find((item) => item.holeId === holeId && !item.destroyed)
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
    const origin = levelRef.current.holes[index]
    const next = levelRef.current.holes.map((point, holeIndex) => {
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
  }, [])

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
        {!builderOpen && <div className="optical-defense__meters" aria-label="战斗资源">
          <div><Zap aria-hidden="true" /><span>功率</span><strong data-testid="power-meter">{battle.usedPowerW}/{battle.capacityW}W</strong></div>
          <div><Coins aria-hidden="true" /><span>金币</span><strong>{battle.coins}</strong></div>
          <div><HeartPulse aria-hidden="true" /><span>核心</span><strong>{battle.coreHealth}/{level.coreHealth}</strong></div>
          <div><Waves aria-hidden="true" /><span>击败</span><strong>{defeatedEnemies}/{battle.spawnPlan.length}</strong></div>
        </div>}
        <div className="optical-defense__top-actions">
          {levelId === CUSTOM_LEVEL_ID && !builderOpen && <button type="button" className="optical-defense__console-button" onClick={() => setShowConsole(true)} data-testid="open-console"><SlidersHorizontal aria-hidden="true" /><span>控制台</span></button>}
          <div className="optical-defense__speed" aria-label="战斗倍速" data-testid="game-speed"><Gauge aria-hidden="true" />{([1, 2, 3] as const).map((speed) => <button key={speed} type="button" className={save.settings.gameSpeed === speed ? 'is-active' : ''} aria-pressed={save.settings.gameSpeed === speed} onClick={() => setGameSpeed(speed)}>{speed}×</button>)}</div>
          <div className="optical-defense__reset-wrap">
            <button type="button" onClick={() => {
              if (levelId === CUSTOM_LEVEL_ID) {
                if (builderOpen) setConfirmState('reset-map')
                else setResetMenuOpen((open) => !open)
              } else {
                setConfirmState('reset-level')
              }
            }} aria-label="重置" title={levelId === CUSTOM_LEVEL_ID ? (builderOpen ? '重置地图' : '重置地图 / 重置关卡 / 重置敌人') : '重置本关'} aria-haspopup={levelId === CUSTOM_LEVEL_ID && !builderOpen ? 'menu' : undefined}><RefreshCw aria-hidden="true" /></button>
            {resetMenuOpen && levelId === CUSTOM_LEVEL_ID && <div className="optical-defense__reset-menu" role="menu" aria-label="重置选项">
              <button type="button" role="menuitem" onClick={() => { setResetMenuOpen(false); setConfirmState('reset-map') }}><RotateCw aria-hidden="true" /><span><strong>重置地图</strong><small>恢复到初始状态</small></span></button>
              <button type="button" role="menuitem" onClick={() => { setResetMenuOpen(false); setConfirmState('reset-custom-level') }}><RefreshCw aria-hidden="true" /><span><strong>重置关卡</strong><small>保留地图，清空敌人与仪器</small></span></button>
              <button type="button" role="menuitem" onClick={() => { setResetMenuOpen(false); setConfirmState('reset-enemies') }}><Trash2 aria-hidden="true" /><span><strong>重置敌人</strong><small>清除所有在场敌人</small></span></button>
            </div>}
          </div>
          <button type="button" onClick={() => setShowHelp(true)} aria-label="打开游戏说明" title="说明" data-testid="open-help"><HelpCircle aria-hidden="true" /></button>
          <button type="button" onClick={() => setShowSettings(true)} aria-label="打开设置" title="设置" data-testid="open-settings"><Settings aria-hidden="true" /></button>
          <button className="is-primary" type="button" onClick={runControl} disabled={builderOpen || battle.phase === 'victory' || battle.phase === 'defeat'} data-testid="wave-control">
            {battle.phase === 'running' ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            <span>{battle.phase === 'build' ? '启动波次' : battle.phase === 'running' ? '暂停' : '继续'}</span>
          </button>
        </div>
      </header>

      {!builderOpen && <div className="optical-defense__mission">
        <div><span>LEVEL {String(level.id).padStart(2, '0')}</span><strong>{level.title}</strong></div>
        <p>{level.lesson}</p>
        <div className="optical-defense__threats" aria-label="本关敌人编成">{Object.entries(enemyRoster).map(([kind, count]) => <span key={kind} className={`is-${kind}`}>{({ normal: '常规', fast: '高速', armored: '重甲', resistant: '抗性', boss: '首领' } as Record<string, string>)[kind]} ×{count}</span>)}</div>
        <i style={{ width: `${Math.min(100, waveProgress * 100)}%` }} />
      </div>}

      {tutorialOpen && tutorialSteps.length > 0 && <aside className={`optical-defense__tutorial${tutorialComplete ? ' is-complete' : ''}`} aria-label="本关实战教学" data-testid="tutorial-bar">
        <div><BookOpen aria-hidden="true" /><span><strong>{tutorialComplete ? '本关教学完成' : `LEVEL ${String(level.id).padStart(2, '0')} 实战任务`}</strong><small>自由操作，任务不会锁定仪器或安装孔</small></span></div>
        <ol>{tutorialSteps.map((step) => <li key={step.id} className={step.complete ? 'is-complete' : ''}><Check aria-hidden="true" /><span>{step.label}</span></li>)}</ol>
        <div className="optical-defense__tutorial-actions"><button type="button" onClick={() => { setShowHelp(true); setManualTab('快速上手') }}>打开手册</button><button type="button" aria-label="关闭教学" title="关闭全部自动教学，可从手册重播" onClick={() => { setTutorialOpen(false); setSave((current) => ({ ...current, tutorial: { ...current.tutorial, dismissed: true } })) }}><X /></button></div>
      </aside>}

      {builderOpen && levelId === CUSTOM_LEVEL_ID
        ? <CustomLevelBuilder config={customConfig} onChange={setCustomConfig} onStart={startCustomLevel} />
        : <div className="optical-defense__workspace">
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
            <KeyboardGrid
              holes={level.holes}
              placements={battle.placements}
              placementSignature={battle.placements.filter((placement) => !placement.destroyed).map((placement) => `${placement.holeId}:${placement.kind}`).sort().join('|')}
              keyboardHoleIndex={keyboardHoleIndex}
              toolName={TOOLS.find((tool) => tool.kind === selectedTool)?.name ?? ''}
              onActivate={onBoardActivate}
              onFocusIndex={onBoardFocus}
              onBoardKeyDown={onBoardKeyDown}
            />
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
            recoveredPower={network.collectorInputs.get(selectedPlacement.id)}
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
        </div>}

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

      {showConsole && levelId === CUSTOM_LEVEL_ID && <CustomLevelConsole config={customConfig} onChange={applyCustomConfig} onClose={() => setShowConsole(false)} onResetTuning={() => setConfirmState('reset-tuning')} />}

      {showHelp && <div className="optical-defense__overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowHelp(false)}>
        <section className="optical-defense__modal optical-defense__help" role="dialog" aria-modal="true" aria-labelledby="optical-help-title" data-testid="help-dialog">
          <header><div><span>FIELD MANUAL</span><h3 id="optical-help-title">游戏说明</h3></div><button onClick={() => setShowHelp(false)} aria-label="关闭游戏说明"><X /></button></header>
          <nav className="optical-defense__manual-tabs" aria-label="说明章节" role="tablist">{MANUAL_TABS.map((tab) => <button key={tab} type="button" role="tab" aria-selected={manualTab === tab} className={manualTab === tab ? 'is-active' : ''} onClick={() => setManualTab(tab)}>{tab}</button>)}</nav>
          <ManualPage tab={manualTab} />
          <footer className="optical-defense__manual-footer"><span>当前关卡：LEVEL {String(level.id).padStart(2, '0')} · {level.lesson}</span><button type="button" onClick={() => { setTutorialOpen(true); setShowHelp(false); setSave((current) => ({ ...current, tutorial: { ...current.tutorial, dismissed: false, completedLevels: current.tutorial.completedLevels.filter((id) => id !== level.id) } })) }}>重播本关教学</button></footer>
        </section>
      </div>}

      {battle.phase === 'victory' && completedStars > 0 && <div className="optical-defense__overlay">
        <section className="optical-defense__modal optical-defense__result" role="dialog" aria-modal="true" aria-labelledby="optical-result-title">
          <Sparkles aria-hidden="true" /><span>MISSION COMPLETE</span><h3 id="optical-result-title">光路稳定</h3><div className="optical-defense__stars">{'★'.repeat(completedStars)}{'☆'.repeat(3 - completedStars)}</div>
          <dl><div><dt>核心生命</dt><dd>{battle.coreHealth}/{level.coreHealth}</dd></div><div><dt>通关时间</dt><dd>{battle.elapsedSeconds.toFixed(1)}s</dd></div><div><dt>功率效率</dt><dd>{Math.round((1 - battle.usedPowerW / battle.capacityW) * 100)}%</dd></div></dl>
          <div><button onClick={resetLevel}><RefreshCw />重试</button>{level.id < OPTICAL_DEFENSE_LEVELS.length && <button className="is-primary" onClick={() => selectLevel(level.id + 1)}>下一关<ChevronRight /></button>}</div>
        </section>
      </div>}

      {battle.phase === 'defeat' && (levelId === CUSTOM_LEVEL_ID ? (
        <div className="optical-defense__overlay">
          <section className="optical-defense__modal optical-defense__result optical-defense__defeat-custom" role="dialog" aria-modal="true" aria-labelledby="optical-defeat-title">
            <Shield aria-hidden="true" /><span>CORE OFFLINE</span><h3 id="optical-defeat-title">核心失守</h3>
            <p className="optical-defense__defeat-hint">选择如何继续这场自定义实验：</p>
            <div className="optical-defense__defeat-options">
              <button onClick={continueCustomAfterCoreLoss} data-testid="defeat-continue"><HeartPulse aria-hidden="true" /><span><strong>继续游戏</strong><small>核心生命回满，不扣除血量</small></span></button>
              <button onClick={resetCustomEnemies}><Trash2 aria-hidden="true" /><span><strong>重置敌人</strong><small>清除所有在场敌人</small></span></button>
              <button onClick={resetCustomLevel}><RefreshCw aria-hidden="true" /><span><strong>重置关卡</strong><small>保留地图，清空敌人与仪器</small></span></button>
              <button onClick={resetCustomMap}><RotateCw aria-hidden="true" /><span><strong>重置地图</strong><small>回到关卡构建</small></span></button>
            </div>
          </section>
        </div>
      ) : (
        <div className="optical-defense__overlay">
          <section className="optical-defense__modal optical-defense__result" role="dialog" aria-modal="true" aria-labelledby="optical-defeat-title"><Shield aria-hidden="true" /><span>CORE OFFLINE</span><h3 id="optical-defeat-title">核心失守</h3><button className="is-primary" onClick={resetLevel}><RefreshCw />重新校准</button></section>
        </div>
      ))}

      {confirmState && <ConfirmDialog
        title={CONFIRM_META[confirmState].title}
        message={CONFIRM_META[confirmState].message}
        confirmLabel={CONFIRM_META[confirmState].confirmLabel}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          const kind = confirmState
          setConfirmState(null)
          runConfirm(kind)
        }}
      />}
    </section>
  )
}

function ManualPage({ tab }: { tab: ManualTab }) {
  if (tab === '快速上手') return <div className="optical-defense__manual-page" role="tabpanel">
    <article><h4>三步形成火力</h4><ol><li>先选光源并放入安装孔。光源不花金币，但占用关卡功率容量。</li><li>放置镜面或光路仪器，选中设备后点“吸附输出”，再点目标仪器。</li><li>把光送入灯泡、激光等攻击终端，确认面板显示实际输入后启动波次。</li></ol></article>
    <article><h4>运行中也能调整</h4><p>战斗不会锁定建造。可随时暂停、旋转、升级、出售或改换吸附目标。裸光束只造成终端伤害的 22%，状态强度也只有 25%，所以必须让终端承担主要输出。</p></article>
    <article><h4>输入方式</h4><p>鼠标或触控点击安装孔；键盘可用方向键切换孔位，Enter 放置或选择，Space 启动/暂停，R 旋转，Delete 出售。</p></article>
  </div>
  if (tab === '颜色与反应') return <div className="optical-defense__manual-page" role="tabpanel">
    <article><h4>单色状态</h4><dl><div><dt>红</dt><dd>中毒 4 秒，基础 2.2 DPS</dd></div><div><dt>绿</dt><dd>燃烧 4 秒，基础 3 DPS；可触发状态反应</dd></div><div><dt>蓝</dt><dd>辐射积累；4 层爆发 18 伤害</dd></div></dl></article>
    <article><h4>复色反应</h4><dl><div><dt>黄（红+绿）</dt><dd>附加燃烧但不附毒；点燃已有中毒，最多 14 伤害，冷却 1 秒</dd></div><div><dt>橙</dt><dd>基础伤害 ×1.25，强化燃烧</dd></div><div><dt>紫</dt><dd>伤害与辐射积累均 ×1.25</dd></div><div><dt>青（绿+蓝）</dt><dd>冻结 1.8 秒，速度最低 ×0.55；冷/热冲击 12 伤害，冷却 1.2 秒</dd></div><div><dt>白（RGB）</dt><dd>专门破盾，不同时叠加单色状态；破盾后制造 4 秒易伤</dd></div></dl></article>
    <article><h4>判色阈值</h4><p>通道功率至少占总功率 10% 才参与光谱判定，微量杂色不会误触发白光。辐射在 1.5 秒未受蓝光后，以每秒 0.6 层衰减。</p></article>
  </div>
  if (tab === '光路仪器') return <div className="optical-defense__manual-page" role="tabpanel">
    <article><h4>传输与守恒</h4><p>镜面传输 92%，普通分束器与棱镜分束器传输 96%；合束、滤光、光闸和收集器为 100%。所有分束比例会自动归一化，总输出不会超过输入。</p></article>
    <article><h4>棱镜分束器</h4><p>输入含至少两个有效 RGB 通道时，自动输出红、绿、蓝三路，各路保留原输入对应通道并乘 96%；三路可独立吸附。单色输入时按普通 2/3 路分束器工作。</p></article>
    <article><h4>收集与控制</h4><p>收集器 L1/L2/L3 回收附近范围终端输入的 10%/15%/20%，多台合计封顶 30%，且回收量会从原终端可用输入扣除。可指定输出红、绿或蓝。传感器附着在已有设备上，可按通道和阈值控制光闸。</p></article>
  </div>
  if (tab === '攻击终端') return <div className="optical-defense__manual-page" role="tabpanel">
    <article><h4>连续终端</h4><dl><div><dt>灯泡</dt><dd>125 范围，全体连续攻击，光谱伤害 ×0.85</dd></div><div><dt>激光</dt><dd>300 范围，单体连续攻击，光谱伤害 ×1.65</dd></div><div><dt>辐射源</dt><dd>150 范围，全体攻击，输入转为蓝光，伤害 ×0.55</dd></div></dl></article>
    <article><h4>周期终端</h4><dl><div><dt>寒冰</dt><dd>360° 全体脉冲，每 1.25 秒；1.5 + 0.04W 伤害并固定冻结</dd></div><div><dt>火焰</dt><dd>360° 全体脉冲，每 1.10 秒；2 + 0.05W 伤害并固定燃烧</dd></div></dl><p>升级后伤害每级 +20%，间隔依次乘 0.86/0.74，范围每级 +8%。</p></article>
    <article><h4>高级终端</h4><p>加速器至少需要 90W，充满后沿方向贯穿 360px、总宽 20px，伤害为 20 + 0.16×消耗焦耳。电容最大 450J，引爆伤害 15 + 0.18J，半径 90 + 330√充能比例，引爆后销毁。</p></article>
  </div>
  if (tab === '敌人') return <div className="optical-defense__manual-page" role="tabpanel">
    <article><h4>重甲与护盾</h4><p>重甲未破甲时生命伤害 ×0.55。重甲护盾至少 30，Boss 护盾至少 120；有盾时非白光生命伤害保留 70%，且几乎不能削盾。护盾减伤与护甲减伤不叠加。</p></article>
    <article><h4>白光破盾</h4><p>白光以原始伤害 ×2.5 消耗护盾。破盾后敌人获得 4 秒易伤，所有伤害 ×1.25。冻结目标受到攻击还会获得 2 秒破甲。</p></article>
    <article><h4>抗性与速度</h4><p>抗性敌人对应 RGB 通道只承受 30% 伤害；高速敌人生命较少但移动快。Boss 拥有更高生命、护盾和核心伤害，后期必须组合颜色与状态。</p></article>
  </div>
  return <div className="optical-defense__manual-page" role="tabpanel">
    <article><h4>基础伤害</h4><p>每秒光谱伤害 = 0.060R + 0.018G + 0.025B。橙光与紫光的基础伤害再 ×1.25；白光对护盾造成原始伤害 ×2.5 的破盾量。数值按 1/30 秒固定步长结算，1×/2×/3× 不丢失模拟时间。</p></article>
    <article><h4>设备价格</h4><p>镜面 18、分束 32、棱镜 46、合束 34、滤光 22、收集 44、灯泡 30、激光 46、辐射 50、寒冰/火焰 52、加速器 82、光闸 20、传感器 28、电容 68。</p></article>
    <article><h4>容量奖励</h4><p>普通与高速敌人返还 1W；重甲与抗性返还 2W，Boss 返还 20W。奖励会提高本关可用功率容量，不会直接增强现有光束。</p></article>
  </div>
}

const KeyboardGrid = memo(function KeyboardGrid({
  holes, placements, placementSignature, keyboardHoleIndex, toolName, onActivate, onFocusIndex, onBoardKeyDown,
}: {
  holes: Point[]
  placements: DevicePlacement[]
  placementSignature: string
  keyboardHoleIndex: number
  toolName: string
  onActivate: (index: number) => void
  onFocusIndex: (index: number) => void
  onBoardKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => void
}) {
  return (
    <div className="optical-defense__keyboard-grid" role="grid" aria-label="可键盘操作的仪器安装孔">
      {holes.map((point, index) => {
        const holeId = `h-${index}`
        const placement = placements.find((item) => item.holeId === holeId && !item.destroyed)
        const name = placement ? TOOLS.find((tool) => tool.kind === placement.kind)?.name : null
        return <button
          key={holeId}
          type="button"
          role="gridcell"
          tabIndex={index === keyboardHoleIndex ? 0 : -1}
          aria-label={placement ? `${holeId.toUpperCase()}，已安装${name}，按回车选择` : `${holeId.toUpperCase()}，空安装孔，按回车放置${toolName}`}
          data-board-hole={index}
          style={{ left: `${point.x / LAB_WIDTH * 100}%`, top: `${point.y / LAB_HEIGHT * 100}%` }}
          onFocus={() => onFocusIndex(index)}
          onKeyDown={(event) => onBoardKeyDown(event, index)}
          onClick={() => onActivate(index)}
        />
      })}
    </div>
  )
}, (prev, next) => (
  // 战斗步进只改变 placements 数组引用，孔位与类型签名不变时不重渲染，避免大地图每步重建数百个按钮。
  prev.holes === next.holes
  && prev.placementSignature === next.placementSignature
  && prev.keyboardHoleIndex === next.keyboardHoleIndex
  && prev.toolName === next.toolName
))

function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="optical-defense__overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="optical-defense__modal optical-defense__confirm" role="dialog" aria-modal="true" aria-labelledby="optical-confirm-title" data-testid="confirm-dialog">
        <header><div><Shield aria-hidden="true" /><span><strong id="optical-confirm-title">{title}</strong></span></div><button onClick={onCancel} aria-label="取消"><X /></button></header>
        <p className="optical-defense__confirm-message">{message}</p>
        <div className="optical-defense__confirm-actions">
          <button type="button" onClick={onCancel}>取消</button>
          <button type="button" className="is-danger" onClick={onConfirm} data-testid="confirm-ok">{confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}

function DeviceInspector({
  placement, placements, phase, inputPower, recoveredPower, sensorTriggered, shutterOpen,
  onRotate, onSetRotation, onUpgrade, onSell, onPatch, onDetonate, snappingOutput, onSnap,
}: {
  placement: DevicePlacement
  placements: DevicePlacement[]
  phase: BattleState['phase']
  inputPower?: RgbPower
  recoveredPower?: RgbPower
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
  const sourceInput = placement.kind.startsWith('source-') ? sourceRgb(placement.kind as 'source-red' | 'source-green' | 'source-blue') : undefined
  const input = sourceInput ?? (placement.kind === 'collector' ? recoveredPower : inputPower) ?? { r: 0, g: 0, b: 0 }
  const transmission = OPTICAL_TRANSMISSION[placement.kind] ?? 1
  const transmitted = scaleRgb(input, transmission)
  const outputs = placement.kind === 'splitter'
    ? splitPower(transmitted, ratios)
    : placement.kind === 'prism-splitter'
      ? prismSplitPower(transmitted, ratios)
      : [transmitted]
  const outputWatts = outputs.reduce((sum, output) => sum + totalPower(output), 0)
  const transmissionLoss = Math.max(0, totalPower(input) - outputWatts)
  const attackProfile = TERMINAL_ATTACK_PROFILES[placement.kind]
  const upgradeCost = deviceUpgradeCost(placement)
  const acceleratorMaximum = ACCELERATOR_MAX_CHARGE_J * (1 + (deviceLevel(placement) - 1) * 0.2)
  const capacitorMaximum = 450
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
      <div><dt>传输损耗</dt><dd>{transmissionLoss > 0.05 ? `${Math.round(transmissionLoss * 10) / 10}W · ${Math.round((1 - transmission) * 100)}%` : '0W'}</dd></div>
      <div><dt>输出功率</dt><dd>{attackProfile || placement.kind === 'capacitor' ? '由终端消耗' : `${Math.round(outputWatts * 10) / 10}W`}</dd></div>
      {attackProfile && <div><dt>攻击周期</dt><dd>{placement.kind === 'accelerator' ? '充满后贯穿' : attackProfile.periodS ? `${(attackProfile.periodS * [1, 0.86, 0.74][deviceLevel(placement) - 1]).toFixed(2)}s` : '连续'}</dd></div>}
      <div><dt>角度</dt><dd>{placement.rotationDeg.toFixed(1)}°</dd></div>
    </dl>
    {placement.kind === 'mirror' && <fieldset><legend>镜面控制</legend>
      <div className="optical-defense__segments"><button className={(placement.mirrorMode ?? 'fixed') === 'fixed' ? 'is-active' : ''} onClick={() => onPatch({ mirrorMode: 'fixed' })} disabled={!editable}>固定方向</button><button className={placement.mirrorMode === 'auto' ? 'is-active' : ''} onClick={() => onPatch({ mirrorMode: 'auto' })} disabled={!editable}>自动攻击</button></div>
      <label><span>目标策略</span><select value={placement.targetStrategy ?? 'first'} disabled={!editable} onChange={(event) => onPatch({ targetStrategy: event.target.value as TargetStrategy })}>{TARGET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="optical-defense__switch-row"><span>15° 角度吸附</span><input type="checkbox" checked={placement.rotationSnap !== false} disabled={!editable} onChange={(event) => onPatch({ rotationSnap: event.target.checked })} /></label>
      <div className="optical-defense__angle-control"><button type="button" aria-label="角度减一度" onClick={() => onRotate(-1)} disabled={!editable}><Minus /></button><input type="number" min="0" max="359.9" step={placement.rotationSnap === false ? 1 : 15} value={Number(placement.rotationDeg.toFixed(1))} disabled={!editable} onChange={(event) => onSetRotation(Number(event.target.value))} aria-label="镜面角度" /><button type="button" aria-label="角度加一度" onClick={() => onRotate(1)} disabled={!editable}><Plus /></button></div>
      <input type="range" min="0" max="359" step={placement.rotationSnap === false ? 1 : 15} value={placement.rotationDeg} disabled={!editable} onChange={(event) => onSetRotation(Number(event.target.value))} aria-label="镜面角度滑杆" />
    </fieldset>}
    {(placement.kind === 'splitter' || placement.kind === 'prism-splitter') && <fieldset><legend>{placement.kind === 'prism-splitter' ? '单色分束配置' : '分光比例'}</legend><div className="optical-defense__segments"><button className={ratios.length === 2 ? 'is-active' : ''} onClick={() => onPatch({ splitRatios: [0.5, 0.5] })} disabled={!editable}>2 路</button><button className={ratios.length === 3 ? 'is-active' : ''} onClick={() => onPatch({ splitRatios: [0.34, 0.33, 0.33] })} disabled={!editable}>3 路</button></div>{ratios.map((ratio, index) => <label key={index}><span>输出 {index + 1}<output>{Math.round(ratio * 100)}%</output></span><input type="range" min="0" max="1" step="0.05" value={ratio} disabled={!editable} onChange={(event) => setRatio(index, Number(event.target.value))} /></label>)}{placement.kind === 'prism-splitter' && <small>复色输入自动切换为 RGB 三路色散，比例滑杆仅用于单色输入。</small>}</fieldset>}
    {placement.kind === 'collector' && <fieldset className="optical-defense__collector"><legend>能量回收</legend><strong>收集效率 {10 + (deviceLevel(placement) - 1) * 5}% · 当前 {Math.round(totalPower(recoveredPower ?? { r: 0, g: 0, b: 0 }) * 10) / 10}W</strong><small>回收量从附近范围终端输入中扣除，多台总计封顶 30%。</small><label><span>输出颜色</span><select value={placement.collectorColor ?? 'r'} disabled={!editable} onChange={(event) => onPatch({ collectorColor: event.target.value as 'r' | 'g' | 'b' })}><option value="r">红</option><option value="g">绿</option><option value="b">蓝</option></select></label></fieldset>}
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
    {(['source-red', 'source-green', 'source-blue', 'mirror', 'splitter', 'prism-splitter', 'combiner', 'filter', 'collector', 'shutter'] as DeviceKind[]).includes(placement.kind) && Array.from({ length: splitterOutputCount(placement, input) }, (_, outputIndex) => <button key={outputIndex} className={`optical-defense__snap-action${snappingOutput === outputIndex ? ' is-active' : ''}`} onClick={() => onSnap(outputIndex)} disabled={!editable} data-testid={placement.kind === 'mirror' ? 'snap-mirror' : `snap-output-${outputIndex}`}><Link2 />{snappingOutput === outputIndex ? '取消吸附' : placement.outputTargetIds?.[outputIndex] || (outputIndex === 0 && placement.snapTargetId) ? `重设输出 ${outputIndex + 1}` : `吸附输出 ${outputIndex + 1}`}</button>)}
    <div className="optical-defense__device-actions"><button onClick={onUpgrade} disabled={!editable || upgradeCost === null}><Sparkles />{upgradeCost === null ? '已满级' : `升级 ¤${upgradeCost}`}</button><button onClick={onSell} disabled={!editable}><Trash2 />出售</button></div>
    {placement.kind !== 'mirror' && <button className="optical-defense__snap-action" onClick={() => onRotate(15)} disabled={!editable}><RotateCw />旋转 15°</button>}
  </div>
}

export default OpticalDefenseGame
