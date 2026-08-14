import type { Tuning } from './tuning'

export type Point = { x: number; y: number }

export type RgbPower = { r: number; g: number; b: number }

export type SourceKind = 'source-red' | 'source-green' | 'source-blue'

export type DeviceKind =
  | SourceKind
  | 'mirror'
  | 'splitter'
  | 'prism-splitter'
  | 'combiner'
  | 'filter'
  | 'collector'
  | 'bulb'
  | 'laser-emitter'
  | 'radiation-source'
  | 'frost-tower'
  | 'brazier'
  | 'accelerator'
  | 'shutter'
  | 'photo-sensor'
  | 'capacitor'

export const ALL_DEVICE_KINDS: readonly DeviceKind[] = [
  'source-red', 'source-green', 'source-blue', 'mirror', 'splitter', 'prism-splitter', 'combiner', 'filter', 'collector',
  'bulb', 'laser-emitter', 'radiation-source', 'frost-tower', 'brazier', 'accelerator',
  'shutter', 'photo-sensor', 'capacitor',
]

export type TargetStrategy = 'first' | 'last' | 'highest-health' | 'lowest-health' | 'status-first' | 'boss-first'

export type SensorChannel = keyof RgbPower | 'any'

export type SensorAction = 'open-when-triggered' | 'close-when-triggered'

export type AcceleratorPhase = 'idle' | 'charging' | 'ready' | 'cooldown'

export type DevicePlacement = {
  id: string
  kind: DeviceKind
  holeId: string
  rotationDeg: number
  splitRatios?: number[]
  filterColor?: keyof RgbPower
  collectorColor?: keyof RgbPower
  targetStrategy?: TargetStrategy
  mirrorMode?: 'fixed' | 'auto'
  enabled?: boolean
  chargeJ?: number
  destroyed?: boolean
  detonateQueued?: boolean
  snapTargetId?: string
  outputTargetIds?: Array<string | undefined>
  upgradeLevel?: 1 | 2 | 3
  rotationSnap?: boolean
  hasSensor?: boolean
  sensorTargetId?: string
  sensorThresholdW?: number
  sensorChannel?: SensorChannel
  sensorAction?: SensorAction
  acceleratorChargeJ?: number
  acceleratorCooldownS?: number
  acceleratorPhase?: AcceleratorPhase
  areaCooldownS?: number
}

export type EnemyKind = 'normal' | 'fast' | 'armored' | 'resistant' | 'boss'

export type EnemyStatus = {
  poisonSeconds: number
  poisonPotency: number
  burnSeconds: number
  burnPotency: number
  freezeSeconds: number
  freezeStrength: number
  radiationStacks: number
  armorBrokenSeconds: number
  shield: number
  vulnerableSeconds: number
  toxinIgnitionCooldownS: number
  thermalShockCooldownS: number
  radiationIdleSeconds: number
}

export type EnemyState = {
  id: string
  kind: EnemyKind
  health: number
  maxHealth: number
  speed: number
  progress: number
  rewardCoins: number
  rewardPowerW: number
  resistance?: keyof RgbPower
  status: EnemyStatus
  escaped?: boolean
  dead?: boolean
  routeIndex?: number
}

export type WaveEnemy = {
  kind: EnemyKind
  count: number
  intervalSeconds: number
  health: number
  speed: number
  rewardCoins: number
  rewardPowerW: number
  resistance?: keyof RgbPower
  routeIndex?: number
}

export type LevelWave = {
  delaySeconds: number
  enemies: WaveEnemy[]
}

export type LevelConfig = {
  id: number
  title: string
  lesson: string
  capacityW: number
  startingCoins: number
  coreHealth: number
  board: { width: number; height: number }
  grid: { columns: number; rows: number; cellSize: number; originX: number; originY: number }
  path: Point[]
  paths?: Point[][]
  routeCells: Point[]
  holes: Point[]
  waves: LevelWave[]
  availableDevices: DeviceKind[]
  recommended: DeviceKind[]
  /** 第二十关调参。缺省时各系统使用 DEFAULT_TUNING。 */
  tuning?: Tuning
}

export type SaveData = {
  version: 3
  unlockedLevel: number
  stars: Record<number, number>
  unlockedDevices: DeviceKind[]
  settings: {
    sound: boolean
    reduceMotion: boolean
    beamGlow: boolean
    gameSpeed: 1 | 2 | 3
  }
  tutorial: {
    dismissed: boolean
    completedLevels: number[]
  }
}

export type CapacitorState = {
  chargeJ: number
  maxChargeJ: number
  destroyed: boolean
}

export type ExplosionResult = {
  radius: number
  damage: number
  destroyed: boolean
  chargeSpentJ: number
}

export const EMPTY_RGB: RgbPower = { r: 0, g: 0, b: 0 }

export const EMPTY_STATUS: EnemyStatus = {
  poisonSeconds: 0,
  poisonPotency: 0,
  burnSeconds: 0,
  burnPotency: 0,
  freezeSeconds: 0,
  freezeStrength: 0,
  radiationStacks: 0,
  armorBrokenSeconds: 0,
  shield: 0,
  vulnerableSeconds: 0,
  toxinIgnitionCooldownS: 0,
  thermalShockCooldownS: 0,
  radiationIdleSeconds: 0,
}
