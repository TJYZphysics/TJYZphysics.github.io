import { DEFAULT_TUNING } from './tuning'
import type { Tuning } from './tuning'
import type { DeviceKind, EnemyKind, LevelConfig, LevelWave, Point, WaveEnemy } from './types'
import { ALL_DEVICE_KINDS } from './types'

export const CUSTOM_LEVEL_ID = 20
export const CUSTOM_LEVEL_TITLE = '自由实验'
export const CUSTOM_LEVEL_LESSON = '完全开放的自定义实验台：绘制路径、指定出入口，并可实时调节全部战斗参数。'

export const BOARD_WIDTH = 1200
export const BOARD_HEIGHT = 700

export const CUSTOM_GRID_LIMITS = {
  columns: { min: 5, max: 30 },
  rows: { min: 4, max: 25 },
} as const

export const MIN_STARTING_COINS = 100
export const MIN_CAPACITY_W = 50
export const MAX_TOTAL_ENEMIES = 5000

export type GridCell = readonly [column: number, row: number]

export type CustomEnemyStats = {
  health: number
  speed: number
  rewardCoins: number
  rewardPowerW: number
}

export type CustomWaveSpec = {
  delaySeconds: number
  totalCount: number
  /** 各类敌人的占比（0..1）。构建时按启用的类型归一化。 */
  distribution: Record<EnemyKind, number>
  /** 随机模式：波内每个敌人按占比随机取一类。 */
  random: boolean
  /** 波内敌人生成间隔（秒）。 */
  intervalSeconds: number
}

export type CustomGrid = {
  columns: number
  rows: number
  cellSize: number
  originX: number
  originY: number
}

export type CustomLevelConfig = {
  version: 1
  columns: number
  rows: number
  pathCells: GridCell[]
  entranceCell?: GridCell
  coreCell?: GridCell
  startingCoins: number
  capacityW: number
  coreHealth: number
  enabledKinds: EnemyKind[]
  enemies: Record<EnemyKind, CustomEnemyStats>
  waves: CustomWaveSpec[]
  /** 每个波次的强度倍率（作用于该波敌人的 HP 与速度）。 */
  waveStrengthCurve: number[]
  tuning: Tuning
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))
const clampColumns = (value: number) => clamp(Math.round(value) || CUSTOM_GRID_LIMITS.columns.min, CUSTOM_GRID_LIMITS.columns.min, CUSTOM_GRID_LIMITS.columns.max)
const clampRows = (value: number) => clamp(Math.round(value) || CUSTOM_GRID_LIMITS.rows.min, CUSTOM_GRID_LIMITS.rows.min, CUSTOM_GRID_LIMITS.rows.max)

export const cellKey = (cell: GridCell) => `${cell[0]}:${cell[1]}`

export function isEdgeCell(cell: GridCell | undefined, columns: number, rows: number) {
  if (!cell) return false
  return cell[0] === 0 || cell[0] === columns - 1 || cell[1] === 0 || cell[1] === rows - 1
}

/** 根据地图尺寸计算与 `buildCustomLevel` 完全一致的网格几何。 */
export function computeGrid(columns: number, rows: number): CustomGrid {
  const safeColumns = clampColumns(columns)
  const safeRows = clampRows(rows)
  const maxCell = Math.min((BOARD_WIDTH - 40) / safeColumns, (BOARD_HEIGHT - 40) / safeRows, 92)
  const cellSize = Math.max(20, Math.floor(maxCell))
  const gridWidth = safeColumns * cellSize
  const gridHeight = safeRows * cellSize
  return {
    columns: safeColumns,
    rows: safeRows,
    cellSize,
    originX: (BOARD_WIDTH - gridWidth) / 2,
    originY: (BOARD_HEIGHT - gridHeight) / 2,
  }
}

export const cellCenter = (grid: CustomGrid, cell: GridCell): Point => ({
  x: grid.originX + cell[0] * grid.cellSize + grid.cellSize / 2,
  y: grid.originY + cell[1] * grid.cellSize + grid.cellSize / 2,
})

export function cellFromPoint(grid: CustomGrid, x: number, y: number): GridCell | null {
  const column = Math.floor((x - grid.originX) / grid.cellSize)
  const row = Math.floor((y - grid.originY) / grid.cellSize)
  if (column < 0 || column >= grid.columns || row < 0 || row >= grid.rows) return null
  return [column, row]
}

/** 入口/核心所在边缘的延伸点（画布边界上）。 */
export function edgePointFor(grid: CustomGrid, cell: GridCell): Point {
  const center = cellCenter(grid, cell)
  if (cell[0] === 0) return { x: 0, y: center.y }
  if (cell[0] === grid.columns - 1) return { x: BOARD_WIDTH, y: center.y }
  if (cell[1] === 0) return { x: center.x, y: 0 }
  return { x: center.x, y: BOARD_HEIGHT }
}

function cloneTuning(source: Tuning): Tuning {
  return deepMergeNumbers(DEFAULT_TUNING, source) as Tuning
}

/** 递归合并普通数值对象：仅采纳有限数字字段，其余回退到 base。 */
function deepMergeNumbers(base: unknown, raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return base
  if (Array.isArray(base)) {
    const output: unknown[] = [...base]
    Object.entries(base).forEach(([key, baseValue]) => {
      const index = Number(key)
      const rawValue = (raw as unknown[])[index]
      if (typeof baseValue === 'number') {
        output[index] = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : baseValue
      }
    })
    return output
  }
  const output: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  Object.entries(base as Record<string, unknown>).forEach(([key, baseValue]) => {
    const rawValue = (raw as Record<string, unknown>)[key]
    if (typeof baseValue === 'object' && baseValue !== null && !Array.isArray(baseValue)) {
      output[key] = deepMergeNumbers(baseValue, rawValue)
    } else if (typeof baseValue === 'number') {
      output[key] = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : baseValue
    } else if (Array.isArray(baseValue)) {
      output[key] = Array.isArray(rawValue) ? rawValue.map((value, index) => typeof value === 'number' && Number.isFinite(value) ? value : baseValue[index]) : baseValue
    } else {
      output[key] = baseValue
    }
  })
  return output
}

const DEFAULT_ENEMIES: Record<EnemyKind, CustomEnemyStats> = {
  normal: { health: 90, speed: 48, rewardCoins: 7, rewardPowerW: 1 },
  fast: { health: 60, speed: 72, rewardCoins: 9, rewardPowerW: 1 },
  armored: { health: 260, speed: 36, rewardCoins: 14, rewardPowerW: 2 },
  resistant: { health: 200, speed: 44, rewardCoins: 14, rewardPowerW: 2 },
  boss: { health: 1000, speed: 26, rewardCoins: 110, rewardPowerW: 20 },
}

const DEFAULT_WAVES: CustomWaveSpec[] = [
  { delaySeconds: 0, totalCount: 12, distribution: { normal: 0.6, fast: 0.4, armored: 0, resistant: 0, boss: 0 }, random: false, intervalSeconds: 0.8 },
  { delaySeconds: 2, totalCount: 16, distribution: { normal: 0.4, fast: 0.3, armored: 0.3, resistant: 0, boss: 0 }, random: false, intervalSeconds: 0.7 },
  { delaySeconds: 2, totalCount: 20, distribution: { normal: 0.2, fast: 0.3, armored: 0.3, resistant: 0.2, boss: 0 }, random: false, intervalSeconds: 0.65 },
  { delaySeconds: 2, totalCount: 10, distribution: { normal: 0, fast: 0.1, armored: 0.3, resistant: 0.3, boss: 0.3 }, random: false, intervalSeconds: 0.9 },
]

const DEFAULT_PATH_CELLS: GridCell[] = [
  [0, 4], [2, 4], [2, 1], [6, 1], [6, 7], [11, 7], [11, 4], [15, 4],
]

export function createDefaultCustomConfig(): CustomLevelConfig {
  return {
    version: 1,
    columns: 16,
    rows: 9,
    pathCells: DEFAULT_PATH_CELLS.map((cell) => [...cell] as GridCell),
    entranceCell: [0, 4],
    coreCell: [15, 4],
    startingCoins: 300,
    capacityW: 200,
    coreHealth: 10,
    enabledKinds: ['normal', 'fast', 'armored', 'resistant', 'boss'],
    enemies: {
      normal: { ...DEFAULT_ENEMIES.normal },
      fast: { ...DEFAULT_ENEMIES.fast },
      armored: { ...DEFAULT_ENEMIES.armored },
      resistant: { ...DEFAULT_ENEMIES.resistant },
      boss: { ...DEFAULT_ENEMIES.boss },
    },
    waves: DEFAULT_WAVES.map((wave) => ({
      ...wave,
      distribution: { ...wave.distribution },
    })),
    waveStrengthCurve: [0.8, 0.95, 1.1, 1.25],
    tuning: cloneTuning(DEFAULT_TUNING),
  }
}

const ENEMY_KINDS: EnemyKind[] = ['normal', 'fast', 'armored', 'resistant', 'boss']

export function normalizeCustomConfig(raw: unknown): CustomLevelConfig {
  const fallback = createDefaultCustomConfig()
  if (raw === null || typeof raw !== 'object') return fallback
  const source = raw as Partial<CustomLevelConfig>
  const columns = clampColumns(typeof source.columns === 'number' ? source.columns : fallback.columns)
  const rows = clampRows(typeof source.rows === 'number' ? source.rows : fallback.rows)
  const inBounds = (cell: GridCell | undefined) => cell !== undefined && cell[0] >= 0 && cell[0] < columns && cell[1] >= 0 && cell[1] < rows
  const pathCells = Array.isArray(source.pathCells)
    ? source.pathCells.filter(inBounds).map((cell) => [...cell] as GridCell)
    : fallback.pathCells
  const pickStat = (kind: EnemyKind): CustomEnemyStats => {
    const rawStat = (source.enemies as Record<EnemyKind, Partial<CustomEnemyStats>> | undefined)?.[kind] ?? {}
    const base = DEFAULT_ENEMIES[kind]
    return {
      health: typeof rawStat.health === 'number' && Number.isFinite(rawStat.health) ? Math.max(1, rawStat.health) : base.health,
      speed: typeof rawStat.speed === 'number' && Number.isFinite(rawStat.speed) ? Math.max(1, rawStat.speed) : base.speed,
      rewardCoins: typeof rawStat.rewardCoins === 'number' && Number.isFinite(rawStat.rewardCoins) ? Math.max(0, rawStat.rewardCoins) : base.rewardCoins,
      rewardPowerW: typeof rawStat.rewardPowerW === 'number' && Number.isFinite(rawStat.rewardPowerW) ? Math.max(0, rawStat.rewardPowerW) : base.rewardPowerW,
    }
  }
  const enemies = Object.fromEntries(ENEMY_KINDS.map((kind) => [kind, pickStat(kind)])) as Record<EnemyKind, CustomEnemyStats>
  const enabledKinds = Array.isArray(source.enabledKinds)
    ? [...new Set(source.enabledKinds.filter((kind): kind is EnemyKind => ENEMY_KINDS.includes(kind as EnemyKind)))]
    : fallback.enabledKinds
  const validKinds = enabledKinds.length ? enabledKinds : ['normal' as EnemyKind]
  const waves = Array.isArray(source.waves) && source.waves.length
    ? source.waves.map((wave, index): CustomWaveSpec => {
        const baseWave = fallback.waves[index] ?? fallback.waves.at(-1)!
        const distribution: Record<EnemyKind, number> = { normal: 0, fast: 0, armored: 0, resistant: 0, boss: 0 }
        ENEMY_KINDS.forEach((kind) => {
          const value = (wave as Partial<CustomWaveSpec>)?.distribution?.[kind]
          distribution[kind] = typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1) : baseWave.distribution[kind]
        })
        return {
          delaySeconds: typeof wave.delaySeconds === 'number' && Number.isFinite(wave.delaySeconds) ? Math.max(0, wave.delaySeconds) : baseWave.delaySeconds,
          totalCount: typeof wave.totalCount === 'number' && Number.isFinite(wave.totalCount) ? Math.max(1, Math.round(wave.totalCount)) : baseWave.totalCount,
          distribution,
          random: Boolean(wave.random),
          intervalSeconds: typeof wave.intervalSeconds === 'number' && Number.isFinite(wave.intervalSeconds) ? Math.max(0.05, wave.intervalSeconds) : baseWave.intervalSeconds,
        }
      })
    : fallback.waves
  const curve = Array.isArray(source.waveStrengthCurve) && source.waveStrengthCurve.length
    ? source.waveStrengthCurve.map((value) => typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0.01, 20) : 1)
    : fallback.waveStrengthCurve
  return {
    version: 1,
    columns,
    rows,
    pathCells,
    entranceCell: inBounds(source.entranceCell) ? [...(source.entranceCell as GridCell)] : fallback.entranceCell,
    coreCell: inBounds(source.coreCell) ? [...(source.coreCell as GridCell)] : fallback.coreCell,
    startingCoins: typeof source.startingCoins === 'number' && Number.isFinite(source.startingCoins) ? Math.max(MIN_STARTING_COINS, Math.round(source.startingCoins)) : fallback.startingCoins,
    capacityW: typeof source.capacityW === 'number' && Number.isFinite(source.capacityW) ? Math.max(MIN_CAPACITY_W, Math.round(source.capacityW)) : fallback.capacityW,
    coreHealth: typeof source.coreHealth === 'number' && Number.isFinite(source.coreHealth) ? Math.max(1, Math.round(source.coreHealth)) : fallback.coreHealth,
    enabledKinds: [...validKinds],
    enemies,
    waves,
    waveStrengthCurve: curve,
    tuning: cloneTuning(source.tuning as Tuning),
  }
}

export function validateCustomLevel(config: CustomLevelConfig): string | null {
  if (!config.pathCells.length) return '请先绘制敌人路径。'
  const entrance = config.entranceCell
  const core = config.coreCell
  if (!entrance || !isEdgeCell(entrance, config.columns, config.rows)) return '请设置位于地图边缘的敌人入口。'
  if (!core || !isEdgeCell(core, config.columns, config.rows)) return '请设置位于地图边缘的核心位置。'
  if (cellKey(entrance) === cellKey(core)) return '入口与核心不能位于同一格。'
  if (!config.waves.length) return '至少需要 1 个波次。'
  if (config.enabledKinds.length === 0) return '至少启用一种敌人类型。'
  return null
}

const OPTICAL_CUSTOM_CONFIG_KEY = 'tjyz-optical-custom-level-v1'

export function loadCustomConfig(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
): CustomLevelConfig {
  if (!storage) return createDefaultCustomConfig()
  try {
    const raw = storage.getItem(OPTICAL_CUSTOM_CONFIG_KEY)
    if (!raw) return createDefaultCustomConfig()
    return normalizeCustomConfig(JSON.parse(raw))
  } catch {
    return createDefaultCustomConfig()
  }
}

export function saveCustomConfig(
  config: CustomLevelConfig,
  storage: Pick<Storage, 'setItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
) {
  try {
    storage?.setItem(OPTICAL_CUSTOM_CONFIG_KEY, JSON.stringify(config))
    return Boolean(storage)
  } catch {
    return false
  }
}

type WeightedKind = { kind: EnemyKind; weight: number }

function weightedKind(weights: WeightedKind[]): EnemyKind {
  const total = weights.reduce((sum, item) => sum + item.weight, 0)
  if (total <= 0) return weights[0]?.kind ?? 'normal'
  let roll = Math.random() * total
  for (const item of weights) {
    roll -= item.weight
    if (roll <= 0) return item.kind
  }
  return weights.at(-1)!.kind
}

const RESISTANCE_CYCLE = ['r', 'g', 'b'] as const

function enemyGroup(kind: EnemyKind, stats: CustomEnemyStats, strength: number, index: number, intervalSeconds: number, count = 1): WaveEnemy {
  return {
    kind,
    count,
    intervalSeconds,
    health: Math.max(1, Math.round(stats.health * strength)),
    speed: Math.max(1, Math.round(stats.speed * strength)),
    rewardCoins: stats.rewardCoins,
    rewardPowerW: stats.rewardPowerW,
    resistance: kind === 'resistant' ? RESISTANCE_CYCLE[index % 3] : undefined,
  }
}

function buildWaves(config: CustomLevelConfig): LevelWave[] {
  const enabled = config.enabledKinds.length ? config.enabledKinds : ['normal' as EnemyKind]
  const budget = { remaining: MAX_TOTAL_ENEMIES }
  return config.waves.map((spec, waveIndex) => {
    const strength = config.waveStrengthCurve[waveIndex] ?? config.waveStrengthCurve.at(-1) ?? 1
    const total = Math.max(1, Math.min(spec.totalCount, budget.remaining))
    budget.remaining = Math.max(0, budget.remaining - total)
    const weights: WeightedKind[] = enabled.map((kind) => ({ kind, weight: Math.max(0, spec.distribution[kind] ?? 0) }))
    const weightSum = weights.reduce((sum, item) => sum + item.weight, 0)
    const normalized = weightSum > 0 ? weights : enabled.map((kind) => ({ kind, weight: 1 }))
    let groupIndex = 0
    const groups: WaveEnemy[] = spec.random
      ? Array.from({ length: total }, () => {
          const kind = weightedKind(normalized)
          return enemyGroup(kind, config.enemies[kind], strength, groupIndex++, spec.intervalSeconds)
        })
      : normalized
        .map(({ kind, weight }) => ({
          kind,
          count: Math.round(total * weight / (normalized.reduce((sum, item) => sum + item.weight, 0))),
        }))
        .filter((group) => group.count > 0)
        .map(({ kind, count }) => enemyGroup(kind, config.enemies[kind], strength, groupIndex++, spec.intervalSeconds, count))
    if (!groups.length) groups.push(enemyGroup('normal', config.enemies.normal, strength, 0, spec.intervalSeconds, total))
    return { delaySeconds: spec.delaySeconds, enemies: groups }
  })
}

function buildPath(grid: CustomGrid, pathCells: readonly GridCell[], entrance?: GridCell, core?: GridCell): Point[] {
  const ordered: GridCell[] = []
  if (entrance) ordered.push(entrance)
  pathCells.forEach((cell) => {
    if (!entrance || cellKey(cell) !== cellKey(entrance)) {
      if (!core || cellKey(cell) !== cellKey(core)) ordered.push(cell)
    }
  })
  if (core && (!ordered.length || cellKey(ordered.at(-1)!) !== cellKey(core))) ordered.push(core)
  // 无路径（构建中/清空后）时返回安全的占位路径，避免 memo 重建崩溃。
  if (!ordered.length) return [{ x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 }]
  const path = ordered.map((cell) => cellCenter(grid, cell))
  const first = edgePointFor(grid, ordered[0])
  const last = edgePointFor(grid, ordered.at(-1)!)
  return [first, ...path, last]
}

export function buildCustomLevel(config: CustomLevelConfig): LevelConfig {
  const columns = clampColumns(config.columns)
  const rows = clampRows(config.rows)
  const grid = computeGrid(columns, rows)
  const board = { width: BOARD_WIDTH, height: BOARD_HEIGHT }
  // 保留绘制顺序（含自交/重叠重复格），road 覆盖由 routeKeys 去重，敌人沿折线顺序移动。
  const pathCells = config.pathCells
  const entrance = isEdgeCell(config.entranceCell, columns, rows) ? config.entranceCell! : pathCells.find((cell) => isEdgeCell(cell, columns, rows))
  const core = isEdgeCell(config.coreCell, columns, rows) && (!entrance || cellKey(config.coreCell!) !== cellKey(entrance))
    ? config.coreCell!
    : [...pathCells].reverse().find((cell) => isEdgeCell(cell, columns, rows) && (!entrance || cellKey(cell) !== cellKey(entrance)))
  const routeKeys = new Set(pathCells.map(cellKey))
  // 手动指定的入口/核心可能不在绘制路径中，必须视为道路格（不能成为安装孔）。
  if (entrance) routeKeys.add(cellKey(entrance))
  if (core) routeKeys.add(cellKey(core))
  const allCells: GridCell[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) allCells.push([column, row])
  }
  const holes = allCells.filter((cell) => !routeKeys.has(cellKey(cell))).map((cell) => cellCenter(grid, cell))
  const routeCells = [...routeKeys].map((key) => cellCenter(grid, key.split(':').map(Number) as unknown as GridCell))
  const path = buildPath(grid, pathCells, entrance, core)
  return {
    id: CUSTOM_LEVEL_ID,
    title: CUSTOM_LEVEL_TITLE,
    lesson: CUSTOM_LEVEL_LESSON,
    capacityW: config.capacityW,
    startingCoins: config.startingCoins,
    coreHealth: config.coreHealth,
    board,
    grid,
    path,
    paths: [path],
    routeCells,
    holes,
    waves: buildWaves(config),
    availableDevices: [...ALL_DEVICE_KINDS] as DeviceKind[],
    recommended: ['source-red', 'mirror', 'bulb'],
    tuning: config.tuning,
  }
}
