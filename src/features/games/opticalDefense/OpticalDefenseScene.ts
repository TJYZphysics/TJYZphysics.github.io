import Phaser from 'phaser'

import type { OpticalNetwork } from './optics'
import { pointOnPath, terminalAttackRange } from './simulation'
import type { BattleState } from './simulation'
import type { DeviceKind, DevicePlacement, LevelConfig, Point, RgbPower } from './types'
import { totalPower, visibleColor } from './rules'
import type { OpticalColorMode } from './colorMode'

export type SceneSnapshot = {
  level: LevelConfig
  battle: BattleState
  network: OpticalNetwork
  selectedId: string | null
  beamGlow: boolean
  reduceMotion: boolean
  recommendedHoleIds?: string[]
  colorMode: OpticalColorMode
}

export type OpticalSceneCallbacks = {
  onHole: (holeId: string) => void
  onDevice: (placementId: string) => void
  onReady?: () => void
}

const LAB_WIDTH = 1200
const LAB_HEIGHT = 700

const DEVICE_LABELS: Record<DeviceKind, string> = {
  'source-red': 'R', 'source-green': 'G', 'source-blue': 'B', mirror: 'M', splitter: 'S', combiner: 'C',
  'prism-splitter': 'PR',
  filter: 'F', collector: 'COL', bulb: 'L', 'laser-emitter': 'LX', 'radiation-source': 'RX', 'frost-tower': 'ICE',
  brazier: 'FIR', accelerator: 'ACC', shutter: 'SH', 'photo-sensor': 'PS', capacitor: 'CAP',
}

const DEVICE_COLORS: Record<DeviceKind, number> = {
  'source-red': 0xff4f58, 'source-green': 0x3ee68d, 'source-blue': 0x4ea7ff, mirror: 0xdaf7ff,
  splitter: 0x69d3ff, 'prism-splitter': 0xf4f8ff, combiner: 0xffd166, filter: 0x66f2ce, collector: 0xffc857, bulb: 0xffe7a3,
  'laser-emitter': 0xff696d, 'radiation-source': 0xd477ff, 'frost-tower': 0x62e3ff, brazier: 0xff9b4a,
  accelerator: 0xffee85, shutter: 0xa8b4c8,
  'photo-sensor': 0x6df6b8, capacitor: 0xffca62,
}

// 亮色模式：黑色阳极氧化机身的「光学实验台」，每台仪器用一枚高饱和的
// 功能色环标识。色相取暗色版的同族（冷色光具 + 暖色能量终端），浓度与
// 明度调高，让亮色底上的范围圈呈现干净明快的浅色晕染。
const LIGHT_DEVICE_COLORS: Record<DeviceKind, number> = {
  'source-red': 0xdd2f3a, 'source-green': 0x0f9d57, 'source-blue': 0x1f6feb, mirror: 0x3a6bcf,
  splitter: 0x0ba5cd, 'prism-splitter': 0x5b43cf, combiner: 0xd08b0c, filter: 0x0f9d8b, collector: 0xd9930a, bulb: 0xd98610,
  'laser-emitter': 0xe3383e, 'radiation-source': 0x9b47d6, 'frost-tower': 0x2f7fd6, brazier: 0xe0631f,
  accelerator: 0xc79b10, shutter: 0x38445a,
  'photo-sensor': 0x1f9d6a, capacitor: 0xcf8608,
}

const SCENE_PALETTES = {
  dark: {
    background: '#0b100f', board: 0x111918, grid: 0x51615c, gridAlpha: 0.18, frame: 0x64736c, frameAlpha: 0.72,
    route: 0x292620, routeBorder: 0xa68d61, routeBorderAlpha: 0.24, routeLine: 0xe4c27a, routeLineAlpha: 0.3,
    routeArrow: 0xf0d28d, routeArrowAlpha: 0.46, entranceFill: 0x5ee1a4, entranceLine: 0x63e9ad,
    coreFill: 0xd7a05f, coreLine: 0xe0ae6d, emptyCell: 0x142321, usedCell: 0x1b302e,
    emptyCellBorder: 0x42534e, usedCellBorder: 0x71a49b, emptyPlate: 0x182a28, usedPlate: 0x203b39,
    emptyPlateBorder: 0x3f6662, usedPlateBorder: 0x7bc0b4, emptySocket: 0x050908, usedSocket: 0x050908,
    emptySocketBorder: 0x5b817c, usedSocketBorder: 0xa4c9c2, recommended: 0x74f4e0, recommendedInner: 0xf7e897,
    beamCore: 0xffffff, deviceBody: 0x071013, selected: 0xffffff, deviceLabel: '#f6ffff', prismFill: 0xdaf7ff,
    enemyBacking: 0x050708, healthTrack: 0x172226,
  },
  light: {
    background: '#e4e7ed', board: 0xf7f8fb, grid: 0xb9c2d0, gridAlpha: 0.45, frame: 0x8b97a8, frameAlpha: 0.58,
    route: 0xe9e1cb, routeBorder: 0xb7a27a, routeBorderAlpha: 0.5, routeLine: 0xa18a5c, routeLineAlpha: 0.55,
    routeArrow: 0x8f7747, routeArrowAlpha: 0.65, entranceFill: 0x1e8f5a, entranceLine: 0x157a48,
    coreFill: 0xc98a06, coreLine: 0xa97404, emptyCell: 0xf0f2f7, usedCell: 0xe7eaf1,
    emptyCellBorder: 0xc3cad6, usedCellBorder: 0x9aa5b5, emptyPlate: 0xf1f4f8, usedPlate: 0xe7ebf2,
    emptyPlateBorder: 0xc6ccd9, usedPlateBorder: 0x96a2b4, emptySocket: 0xffffff, usedSocket: 0xffffff,
    emptySocketBorder: 0xb0b8c7, usedSocketBorder: 0x7e8ba0, recommended: 0x2453c7, recommendedInner: 0x5871c9,
    beamCore: 0xffffff, deviceBody: 0x232a35, selected: 0x1d3fa8, deviceLabel: '#f3f6fb', prismFill: 0x1b2530,
    enemyBacking: 0xffffff, healthTrack: 0xd2d8e2,
  },
} as const

function powerColor(power: RgbPower, colorMode: OpticalColorMode) {
  const color = visibleColor(power)
  const colors = colorMode === 'light'
    // 亮色底上需要高饱和中明度，颜色才不被「洗白」；白光/暗光用墨灰层次表达亮暗。
    ? { red: 0xdd2f3a, green: 0x0f9d57, blue: 0x1f6feb, yellow: 0xd08b0c, orange: 0xd95f1e, magenta: 0xc03bb6, cyan: 0x0b9cb8, white: 0x5a6473, dark: 0x8e97a8 }
    : { red: 0xff454f, green: 0x48ef8b, blue: 0x469dff, yellow: 0xffe36b, orange: 0xff9a3d, magenta: 0xff61e6, cyan: 0x54f2ff, white: 0xf5ffff, dark: 0x7d8a96 }
  return colors[color]
}

function deviceColor(kind: DeviceKind, colorMode: OpticalColorMode) {
  return colorMode === 'light' ? LIGHT_DEVICE_COLORS[kind] : DEVICE_COLORS[kind]
}

/** Terminal housings inherit the spectrum that actually reaches their input.
 * Keep the catalog accent as a fallback so an unpowered terminal still has a
 * readable identity while the player is wiring the optical network.
 */
function terminalVisualColor(placement: DevicePlacement, network: OpticalNetwork, colorMode: OpticalColorMode) {
  if (!['bulb', 'laser-emitter', 'radiation-source'].includes(placement.kind)) return deviceColor(placement.kind, colorMode)
  const input = network.deviceInputs.get(placement.id)
  return input && totalPower(input) > 0.01 ? powerColor(input, colorMode) : deviceColor(placement.kind, colorMode)
}

function pointFor(level: LevelConfig, placement: DevicePlacement) {
  return level.holes[Number(placement.holeId.replace('h-', ''))] ?? { x: 0, y: 0 }
}

function visualTarget(enemies: BattleState['enemies'], strategy: DevicePlacement['targetStrategy']) {
  if (!enemies.length) return undefined
  if (strategy === 'last') return enemies.reduce((best, enemy) => enemy.progress < best.progress ? enemy : best)
  if (strategy === 'highest-health') return enemies.reduce((best, enemy) => enemy.health > best.health ? enemy : best)
  if (strategy === 'lowest-health') return enemies.reduce((best, enemy) => enemy.health < best.health ? enemy : best)
  if (strategy === 'boss-first') return enemies.find((enemy) => enemy.kind === 'boss') ?? enemies.reduce((best, enemy) => enemy.progress > best.progress ? enemy : best)
  if (strategy === 'status-first') return enemies.find((enemy) => Object.values(enemy.status).some((value) => value > 0)) ?? enemies[0]
  return enemies.reduce((best, enemy) => enemy.progress > best.progress ? enemy : best)
}

export class OpticalDefenseScene extends Phaser.Scene {
  private callbacks: OpticalSceneCallbacks
  private snapshot: SceneSnapshot | null = null
  private board!: Phaser.GameObjects.Graphics
  private pathGraphics!: Phaser.GameObjects.Graphics
  private holeGraphics!: Phaser.GameObjects.Graphics
  private rangeGraphics!: Phaser.GameObjects.Graphics
  private beamGraphics!: Phaser.GameObjects.Graphics
  private attackGraphics!: Phaser.GameObjects.Graphics
  private entityLayer!: Phaser.GameObjects.Container
  private deviceObjects = new Map<string, { graphics: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; signature: string }>()
  private enemyObjects = new Map<string, { graphics: Phaser.GameObjects.Graphics; signature: string }>()
  private lastLevelId = -1
  private lastHoleSignature = '\u0000'
  private handledEventId = 0
  private lastBattleElapsedSeconds = 0
  private lastBattleEntityId = 0
  private colorMode: OpticalColorMode = 'dark'
  private palette: (typeof SCENE_PALETTES)[OpticalColorMode] = SCENE_PALETTES.dark
  private beamPulse: Phaser.Tweens.Tween | null = null
  private attackPulse: Phaser.Tweens.Tween | null = null

  constructor(callbacks: OpticalSceneCallbacks) {
    super({ key: 'optical-defense' })
    this.callbacks = callbacks
  }

  create() {
    this.colorMode = this.snapshot?.colorMode ?? 'dark'
    this.palette = SCENE_PALETTES[this.colorMode]
    this.cameras.main.setBackgroundColor(this.palette.background)
    this.board = new Phaser.GameObjects.Graphics(this)
    this.pathGraphics = new Phaser.GameObjects.Graphics(this)
    this.holeGraphics = new Phaser.GameObjects.Graphics(this)
    this.rangeGraphics = new Phaser.GameObjects.Graphics(this)
    this.beamGraphics = new Phaser.GameObjects.Graphics(this)
    this.attackGraphics = new Phaser.GameObjects.Graphics(this)
    this.entityLayer = new Phaser.GameObjects.Container(this)
    this.add.existing(this.board)
    this.add.existing(this.pathGraphics)
    this.add.existing(this.holeGraphics)
    this.add.existing(this.rangeGraphics)
    this.add.existing(this.beamGraphics)
    this.add.existing(this.attackGraphics)
    this.add.existing(this.entityLayer)
    this.applyBlendModes()
    this.applyPulseMode()
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const bounds = this.game.canvas.getBoundingClientRect()
      const nativeEvent = pointer.event as PointerEvent & { changedTouches?: TouchList }
      const source = nativeEvent.changedTouches?.[0] ?? nativeEvent
      const clientX = 'clientX' in source ? Number(source.clientX) : bounds.left + pointer.x
      const clientY = 'clientY' in source ? Number(source.clientY) : bounds.top + pointer.y
      this.handlePointer(
        (clientX - bounds.left) * LAB_WIDTH / bounds.width,
        (clientY - bounds.top) * LAB_HEIGHT / bounds.height,
      )
    })
    if (this.snapshot) this.drawSnapshot()
    this.callbacks.onReady?.()
  }

  setSnapshot(snapshot: SceneSnapshot) {
    this.snapshot = snapshot
    if (this.sys.isActive()) this.drawSnapshot()
  }

  /**
   * 光束与攻击特效的混合模式随配色切换：
   * 暗色用 ADD 叠加出辉光；亮色底上 ADD 会把颜色压成白色（亮上加亮恒为白），
   * 必须改用 NORMAL 才能保住光束本身的饱和色。
   */
  private applyBlendModes() {
    const blend = this.colorMode === 'light' ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD
    this.beamGraphics.setBlendMode(blend)
    this.attackGraphics.setBlendMode(blend)
  }

  /**
   * 光束/攻击层的整体透明度脉动只属于暗色辉光。亮色下用 NORMAL 混合时，
   * 整体 alpha<1 会让光束变成半透明粉色（亮底压不住），必须保持全不透明。
   */
  private applyPulseMode() {
    this.beamPulse?.remove()
    this.attackPulse?.remove()
    this.beamPulse = null
    this.attackPulse = null
    if (this.colorMode === 'light') {
      this.beamGraphics.setAlpha(1)
      this.attackGraphics.setAlpha(1)
    } else {
      this.beamPulse = this.tweens.add({ targets: this.beamGraphics, alpha: { from: 0.72, to: 1 }, duration: 760, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
      this.attackPulse = this.tweens.add({ targets: this.attackGraphics, alpha: { from: 0.45, to: 0.92 }, duration: 360, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    }
  }

  private handlePointer(x: number, y: number) {
    const snapshot = this.snapshot
    if (!snapshot) return
    const selectedDevice = snapshot.battle.placements
      .map((placement) => ({ placement, point: pointFor(snapshot.level, placement) }))
      .find(({ point }) => Math.hypot(point.x - x, point.y - y) <= 25)
    if (selectedDevice) {
      this.callbacks.onDevice(selectedDevice.placement.id)
      return
    }
    const closestHole = snapshot.level.holes
      .map((point, index) => ({ point, index, distance: Math.hypot(point.x - x, point.y - y) }))
      .filter(({ distance }) => distance <= Math.min(36, snapshot.level.grid.cellSize * 0.42))
      .sort((a, b) => a.distance - b.distance)[0]
    if (closestHole) this.callbacks.onHole(`h-${closestHole.index}`)
  }

  private fillEdgeExtension(path: Phaser.GameObjects.Graphics, grid: LevelConfig['grid'], edgePoint: Point) {
    const halfCell = grid.cellSize / 2
    if (edgePoint.x <= 1) {
      path.fillRect(0, edgePoint.y - halfCell, grid.originX, grid.cellSize)
      return
    }
    if (edgePoint.x >= LAB_WIDTH - 1) {
      path.fillRect(grid.originX + grid.columns * grid.cellSize, edgePoint.y - halfCell, LAB_WIDTH - grid.originX - grid.columns * grid.cellSize, grid.cellSize)
      return
    }
    const x = edgePoint.x - halfCell
    if (edgePoint.y <= 1) path.fillRect(x, 0, grid.cellSize, grid.originY)
    else path.fillRect(x, grid.originY + grid.rows * grid.cellSize, grid.cellSize, LAB_HEIGHT - grid.originY - grid.rows * grid.cellSize)
  }

  private drawEdgeEntrance(path: Phaser.GameObjects.Graphics, edgePoint: Point) {
    const isLeft = edgePoint.x <= 1
    const isRight = edgePoint.x >= LAB_WIDTH - 1
    const isTop = edgePoint.y <= 1
    path.fillStyle(this.palette.entranceFill, this.colorMode === 'light' ? 0.18 : 0.24)
    if (isLeft) path.fillRect(0, edgePoint.y - 18, 18, 36)
    else if (isRight) path.fillRect(LAB_WIDTH - 18, edgePoint.y - 18, 18, 36)
    else if (isTop) path.fillRect(edgePoint.x - 18, 0, 36, 18)
    else path.fillRect(edgePoint.x - 18, LAB_HEIGHT - 18, 36, 18)
    path.lineStyle(3, this.palette.entranceLine, 0.82)
    if (isLeft) path.lineBetween(17, edgePoint.y - 18, 17, edgePoint.y + 18)
    else if (isRight) path.lineBetween(LAB_WIDTH - 17, edgePoint.y - 18, LAB_WIDTH - 17, edgePoint.y + 18)
    else if (isTop) path.lineBetween(edgePoint.x - 18, 17, edgePoint.x + 18, 17)
    else path.lineBetween(edgePoint.x - 18, LAB_HEIGHT - 17, edgePoint.x + 18, LAB_HEIGHT - 17)
  }

  private drawBoard(level: LevelConfig) {
    const g = this.board
    g.clear()
    g.fillStyle(this.palette.board, 1)
    g.fillRect(0, 0, LAB_WIDTH, LAB_HEIGHT)

    const { cellSize, columns, rows, originX, originY } = level.grid
    for (let column = 0; column <= columns; column += 1) {
      const x = originX + column * cellSize
      g.lineStyle(1, this.palette.grid, this.palette.gridAlpha)
      g.lineBetween(x, originY, x, originY + rows * cellSize)
    }
    for (let row = 0; row <= rows; row += 1) {
      const y = originY + row * cellSize
      g.lineStyle(1, this.palette.grid, this.palette.gridAlpha)
      g.lineBetween(originX, y, originX + columns * cellSize, y)
    }
    g.lineStyle(2, this.palette.frame, this.palette.frameAlpha)
    g.strokeRoundedRect(5, 5, LAB_WIDTH - 10, LAB_HEIGHT - 10, 10)

    const path = this.pathGraphics
    path.clear()
    const halfCell = cellSize / 2
    path.fillStyle(this.palette.route, 1)
    level.routeCells.forEach((point) => {
      path.fillRect(point.x - halfCell, point.y - halfCell, cellSize, cellSize)
    })
    ;(level.paths ?? [level.path]).forEach((route) => {
      this.fillEdgeExtension(path, level.grid, route[0])
      this.fillEdgeExtension(path, level.grid, route.at(-1)!)
    })

    path.lineStyle(1, this.palette.routeBorder, this.palette.routeBorderAlpha)
    level.routeCells.forEach((point) => {
      path.strokeRect(point.x - halfCell, point.y - halfCell, cellSize, cellSize)
    })
    const paths = level.paths ?? [level.path]
    paths.forEach((route) => {
      path.lineStyle(3, this.palette.routeLine, this.palette.routeLineAlpha)
      path.beginPath()
      path.moveTo(route[0].x, route[0].y)
      route.slice(1).forEach((point) => path.lineTo(point.x, point.y))
      path.strokePath()
      path.lineStyle(2, this.palette.routeArrow, this.palette.routeArrowAlpha)
      route.slice(1, -1).forEach((point, index) => {
        if (index % 2 !== 0) return
        const next = route[index + 2] ?? point
        const length = Math.hypot(next.x - point.x, next.y - point.y) || 1
        const directionX = (next.x - point.x) / length
        const directionY = (next.y - point.y) / length
        const perpendicularX = -directionY
        const perpendicularY = directionX
        const tipX = point.x + directionX * 9
        const tipY = point.y + directionY * 9
        const backX = point.x - directionX * 6
        const backY = point.y - directionY * 6
        path.lineBetween(backX + perpendicularX * 6, backY + perpendicularY * 6, tipX, tipY)
        path.lineBetween(backX - perpendicularX * 6, backY - perpendicularY * 6, tipX, tipY)
      })
      this.drawEdgeEntrance(path, route[0])
    })
    const core = paths[0].at(-2) ?? level.routeCells.at(-1)!
    path.fillStyle(this.palette.coreFill, this.colorMode === 'light' ? 0.16 : 0.18)
    path.fillCircle(core.x, core.y, 26)
    path.lineStyle(3, this.palette.coreLine, 0.8)
    path.strokeCircle(core.x, core.y, 25)
    path.strokeCircle(core.x, core.y, 16)
  }

  private drawHoles(level: LevelConfig, placements: DevicePlacement[], recommendedHoleIds: readonly string[] = []) {
    const occupied = new Set(placements.map((placement) => placement.holeId))
    const recommended = new Set(recommendedHoleIds)
    const g = this.holeGraphics
    g.clear()
    const cellSize = level.grid.cellSize
    const halfCell = cellSize / 2
    const plate = Math.max(20, Math.min(cellSize - 6, 62))
    const scale = plate / 62
    // 小格地图（大地图）略去单元格底与内部圆，只画面板，显著减少绘制调用。
    const compact = cellSize <= 40
    const rows = level.holes.map((point, index) => {
      const id = `h-${index}`
      return { point, id, isOccupied: occupied.has(id), isRecommended: recommended.has(id) && !occupied.has(id) }
    })
    const empty = rows.filter((row) => !row.isOccupied)
    const used = rows.filter((row) => row.isOccupied)
    // 按样式分组批量绘制，让 Phaser 只切换少量批次（WebGL 下同风格图形合批为一次绘制）。
    if (!compact) {
      g.fillStyle(this.palette.emptyCell, 0.92)
      empty.forEach(({ point }) => g.fillRect(point.x - halfCell, point.y - halfCell, cellSize, cellSize))
      g.fillStyle(this.palette.usedCell, 0.92)
      used.forEach(({ point }) => g.fillRect(point.x - halfCell, point.y - halfCell, cellSize, cellSize))
      g.lineStyle(1, this.palette.emptyCellBorder, this.colorMode === 'light' ? 0.4 : 0.28)
      empty.forEach(({ point }) => g.strokeRect(point.x - halfCell, point.y - halfCell, cellSize, cellSize))
      g.lineStyle(1, this.palette.usedCellBorder, this.colorMode === 'light' ? 0.58 : 0.5)
      used.forEach(({ point }) => g.strokeRect(point.x - halfCell, point.y - halfCell, cellSize, cellSize))
    }
    g.fillStyle(this.palette.emptyPlate, 0.94)
    empty.forEach(({ point }) => g.fillRoundedRect(point.x - plate / 2, point.y - plate / 2, plate, plate, 7))
    g.fillStyle(this.palette.usedPlate, 0.94)
    used.forEach(({ point }) => g.fillRoundedRect(point.x - plate / 2, point.y - plate / 2, plate, plate, 7))
    g.lineStyle(1, this.palette.emptyPlateBorder, this.colorMode === 'light' ? 0.62 : 0.48)
    empty.forEach(({ point }) => g.strokeRoundedRect(point.x - plate / 2, point.y - plate / 2, plate, plate, 7))
    g.lineStyle(1, this.palette.usedPlateBorder, 0.72)
    used.forEach(({ point }) => g.strokeRoundedRect(point.x - plate / 2, point.y - plate / 2, plate, plate, 7))
    if (!compact) {
      g.fillStyle(this.palette.emptySocket, 0.92)
      empty.forEach(({ point }) => g.fillCircle(point.x, point.y, 9 * scale))
      g.fillStyle(this.palette.usedSocket, this.colorMode === 'light' ? 0.9 : 0.58)
      used.forEach(({ point }) => g.fillCircle(point.x, point.y, 13 * scale))
      g.lineStyle(1.5, this.palette.emptySocketBorder, 0.72)
      empty.forEach(({ point }) => g.strokeCircle(point.x, point.y, 11 * scale))
      g.lineStyle(1.5, this.palette.usedSocketBorder, 0.76)
      used.forEach(({ point }) => g.strokeCircle(point.x, point.y, 15 * scale))
    }
    rows.filter((row) => row.isRecommended).forEach(({ point }) => {
      const margin = plate / 2 + 4
      g.lineStyle(3, this.palette.recommended, 0.92)
      g.strokeRoundedRect(point.x - margin, point.y - margin, margin * 2, margin * 2, 8)
      g.lineStyle(1, this.palette.recommendedInner, 0.82)
      g.strokeCircle(point.x, point.y, 20 * scale)
    })
  }

  private drawBeams(snapshot: SceneSnapshot, network: OpticalNetwork) {
    const g = this.beamGraphics
    const light = this.colorMode === 'light'
    g.clear()
    network.segments.forEach((segment) => {
      const color = powerColor(segment.power, this.colorMode)
      const width = Math.max(1.2, Math.min(8, totalPower(segment.power) / 22))
      if (snapshot.beamGlow) {
        g.lineStyle(width + (light ? 9 : 12), color, light ? 0.12 : 0.08)
        g.lineBetween(segment.start.x, segment.start.y, segment.end.x, segment.end.y)
        g.lineStyle(width + (light ? 4 : 5), color, light ? 0.24 : 0.18)
        g.lineBetween(segment.start.x, segment.start.y, segment.end.x, segment.end.y)
      }
      g.lineStyle(width, color, light ? 1 : 0.92)
      g.lineBetween(segment.start.x, segment.start.y, segment.end.x, segment.end.y)
      if (light) {
        // 亮色模式：不再用白色光芯（会把颜色洗成白色），只给粗光束一条细白高光。
        if (width > 2.6) {
          g.lineStyle(0.9, this.palette.beamCore, 0.32)
          g.lineBetween(segment.start.x, segment.start.y, segment.end.x, segment.end.y)
        }
      } else {
        g.lineStyle(1, this.palette.beamCore, 0.85)
        g.lineBetween(segment.start.x, segment.start.y, segment.end.x, segment.end.y)
      }
    })
  }

  private lastRangeSignature: string | null = null

  private drawAttackRanges(snapshot: SceneSnapshot, network: OpticalNetwork) {
    const ranges = this.rangeGraphics
    const attacks = this.attackGraphics
    // Attack radius is contextual information. Keep the board calm until a
    // terminal is selected (newly placed terminals are selected by the UI).
    const selectedTerminal = snapshot.battle.placements.find((placement) =>
      placement.id === snapshot.selectedId && terminalAttackRange(placement) > 0,
    )
    if (!selectedTerminal) {
      if (this.lastRangeSignature !== '') {
        ranges.clear()
        this.lastRangeSignature = ''
      }
    }
    const alive = snapshot.battle.enemies.filter((enemy) => !enemy.dead && !enemy.escaped).sort((left, right) => right.progress - left.progress)

    // 静态范围圈：仅当设备构成/升级/选中态变化时重绘。避免每帧重建大半径圆
    // （30 台终端 × 大圆会产生大量 WebGL 顶点，是大地图卡顿的主因）。
    const rangeSignature = selectedTerminal ? snapshot.battle.placements.filter((placement) => placement.id === selectedTerminal.id).map((placement) => {
      if (!terminalAttackRange(placement)) return ''
      const terminalTint = ['bulb', 'laser-emitter', 'radiation-source'].includes(placement.kind)
        ? terminalVisualColor(placement, snapshot.network, this.colorMode)
        : ''
      return `${placement.holeId}:${placement.kind}:${placement.upgradeLevel ?? 1}:${placement.rotationDeg.toFixed(2)}:${placement.id === snapshot.selectedId}:${terminalTint}`
    }).join('|') : ''
    if (rangeSignature !== this.lastRangeSignature) {
      this.lastRangeSignature = rangeSignature
      ranges.clear()
      const light = this.colorMode === 'light'
      selectedTerminal && snapshot.battle.placements.filter((placement) => placement.id === selectedTerminal.id).forEach((placement) => {
        const radius = terminalAttackRange(placement)
        if (!radius) return
        const point = pointFor(snapshot.level, placement)
        const color = terminalVisualColor(placement, snapshot.network, this.colorMode)
        const selected = placement.id === snapshot.selectedId
        if (placement.kind === 'accelerator') {
          // Accelerators have no circular attack area. Their only preview is a
          // clear firing vector, matching the one-shot particle discharge.
          const angle = placement.rotationDeg * Math.PI / 180
          const direction = { x: Math.cos(angle), y: Math.sin(angle) }
          const perpendicular = { x: -direction.y, y: direction.x }
          const end = { x: point.x + direction.x * radius, y: point.y + direction.y * radius }
          ranges.lineStyle(4, color, 0.82)
          ranges.lineBetween(point.x, point.y, end.x, end.y)
          ranges.lineStyle(1, this.palette.beamCore, 0.84)
          ranges.lineBetween(point.x, point.y, end.x, end.y)
          ranges.fillStyle(color, 0.95)
          ranges.fillTriangle(
            end.x, end.y,
            end.x - direction.x * 18 + perpendicular.x * 8,
            end.y - direction.y * 18 + perpendicular.y * 8,
            end.x - direction.x * 18 - perpendicular.x * 8,
            end.y - direction.y * 18 - perpendicular.y * 8,
          )
          return
        }
        ranges.fillStyle(color, selected ? (light ? 0.07 : 0.055) : (light ? 0.045 : 0.022))
        ranges.fillCircle(point.x, point.y, radius)
        ranges.lineStyle(selected ? 2.2 : 1.2, color, selected ? (light ? 0.6 : 0.55) : (light ? 0.32 : 0.25))
        ranges.strokeCircle(point.x, point.y, radius)
        ranges.lineStyle(1, color, light ? 0.22 : 0.18)
        ranges.strokeCircle(point.x, point.y, radius * 0.5)
        if (light) {
          // 亮色底上补一圈细白描边，让浅色晕染范围更有「实验室图纸」的干净边缘。
          ranges.lineStyle(1.2, this.palette.beamCore, 0.85)
          ranges.strokeCircle(point.x, point.y, radius)
        }
      })
    }

    attacks.clear()
    const pulseTime = this.time.now * 0.001
    snapshot.battle.placements.forEach((placement) => {
      const radius = terminalAttackRange(placement)
      if (!radius) return
      const point = pointFor(snapshot.level, placement)
      const color = terminalVisualColor(placement, snapshot.network, this.colorMode)
      if (placement.kind === 'accelerator') {
        const phase = placement.acceleratorPhase ?? 'idle'
        if (phase === 'cooldown') {
          // The simulation enters cooldown exactly once after a full charge is
          // discharged. Render a dense, short-lived salvo rather than a beam.
          const maxCooldown = Math.max(1.4, 2.4 - ((placement.upgradeLevel ?? 1) - 1) * 0.35)
          const elapsed = maxCooldown - Math.max(0, placement.acceleratorCooldownS ?? maxCooldown)
          const burst = Math.max(0, Math.min(1, elapsed / 0.62))
          const angle = placement.rotationDeg * Math.PI / 180
          const perpendicular = { x: -Math.sin(angle), y: Math.cos(angle) }
          const packetCount = 34
          attacks.fillStyle(color, 0.2 * (1 - burst * 0.35))
          attacks.fillCircle(point.x, point.y, 12 + burst * 10)
          for (let index = 0; index < packetCount; index += 1) {
            const jitter = ((index * 17) % packetCount) / packetCount - 0.5
            const travel = Math.min(1, burst * 1.12 + (index % 5) * 0.008)
            const distance = radius * travel
            const spread = jitter * (5 + travel * 12)
            const px = point.x + Math.cos(angle) * distance + perpendicular.x * spread
            const py = point.y + Math.sin(angle) * distance + perpendicular.y * spread
            attacks.fillStyle(this.palette.beamCore, 0.92 * (1 - travel * 0.24))
            attacks.fillCircle(px, py, 1.6 + (index % 3) * 0.7)
            attacks.fillStyle(color, 0.78 * (1 - travel * 0.3))
            attacks.fillCircle(px, py, 3.2 + (index % 2) * 1.1)
          }
          const muzzleX = point.x + Math.cos(angle) * 22
          const muzzleY = point.y + Math.sin(angle) * 22
          attacks.lineStyle(3, this.palette.beamCore, 0.9 * (1 - burst * 0.3))
          attacks.strokeCircle(muzzleX, muzzleY, 8 + burst * 6)
        }
        return
      } else if (placement.kind === 'laser-emitter' && placement.id === snapshot.selectedId && !network.poweredDeviceIds.has(placement.id)) {
        const angle = placement.rotationDeg * Math.PI / 180
        attacks.lineStyle(2, color, 0.32)
        attacks.lineBetween(point.x, point.y, point.x + Math.cos(angle) * radius, point.y + Math.sin(angle) * radius)
      }
      const candidates = alive.filter((enemy) => {
        const path = snapshot.level.paths?.[enemy.routeIndex ?? 0] ?? snapshot.level.path
        const enemyPoint = pointOnPath(path, enemy.progress)
        return Math.hypot(enemyPoint.x - point.x, enemyPoint.y - point.y) <= radius
      })
      if (!network.poweredDeviceIds.has(placement.id) || !candidates.length) return
      if (placement.kind === 'frost-tower' || placement.kind === 'brazier') {
        const basePeriod = placement.kind === 'frost-tower' ? 1.25 : 1.1
        const period = basePeriod * [1, 0.86, 0.74][(placement.upgradeLevel ?? 1) - 1]
        const pulseProgress = 1 - Math.min(1, (placement.areaCooldownS ?? 0) / period)
        const pulseRadius = Math.max(20, radius * pulseProgress)
        if (placement.kind === 'frost-tower') {
          attacks.lineStyle(4 - pulseProgress * 2, color, 0.72 * (1 - pulseProgress * 0.75))
          attacks.strokeCircle(point.x, point.y, pulseRadius)
          attacks.lineStyle(1.5, this.palette.beamCore, 0.5 * (1 - pulseProgress))
          attacks.strokeCircle(point.x, point.y, Math.max(14, pulseRadius - 8))
          // Six crystal shards radiate from the cryogenic emitter.
          for (let index = 0; index < 6; index += 1) {
            const angle = index * Math.PI / 3 + pulseProgress * 0.2
            const inner = Math.max(8, pulseRadius - 18)
            attacks.fillStyle(color, 0.74 * (1 - pulseProgress * 0.45))
            attacks.fillTriangle(
              point.x + Math.cos(angle) * inner,
              point.y + Math.sin(angle) * inner,
              point.x + Math.cos(angle - 0.14) * pulseRadius,
              point.y + Math.sin(angle - 0.14) * pulseRadius,
              point.x + Math.cos(angle + 0.14) * pulseRadius,
              point.y + Math.sin(angle + 0.14) * pulseRadius,
            )
          }
        } else {
          // Flame terminals use stacked rising tongues instead of a generic ring.
          attacks.lineStyle(3, color, 0.48 * (1 - pulseProgress * 0.65))
          attacks.strokeCircle(point.x, point.y, pulseRadius)
          const flameScale = Math.max(0.35, 1 - pulseProgress * 0.55)
          for (let index = 0; index < 5; index += 1) {
            const baseX = point.x + (index - 2) * 5
            const baseY = point.y + pulseRadius * 0.38
            attacks.fillStyle(index % 2 ? this.palette.beamCore : color, 0.76 * flameScale)
            attacks.fillTriangle(baseX - 4, baseY + 8, baseX + 4, baseY + 8, baseX + Math.sin(pulseTime * 3 + index) * 4, baseY - 17 * flameScale)
          }
        }
        return
      }
      const target = visualTarget(candidates, placement.targetStrategy)
      if (!target) return
      const targetPath = snapshot.level.paths?.[target.routeIndex ?? 0] ?? snapshot.level.path
      const targetPoint = pointOnPath(targetPath, target.progress)
      if (placement.kind === 'laser-emitter') {
        const dx = targetPoint.x - point.x
        const dy = targetPoint.y - point.y
        const length = Math.hypot(dx, dy) || 1
        const nx = -dy / length
        const ny = dx / length
        attacks.lineStyle(10, color, 0.16)
        attacks.lineBetween(point.x, point.y, targetPoint.x, targetPoint.y)
        attacks.lineStyle(3.5, color, 0.78)
        attacks.lineBetween(point.x, point.y, targetPoint.x, targetPoint.y)
        attacks.lineStyle(1.2, this.palette.beamCore, 0.96)
        attacks.lineBetween(point.x, point.y, targetPoint.x, targetPoint.y)
        // Fine split rails sell the laser's coherence and keep the impact readable.
        attacks.lineStyle(1, this.palette.beamCore, 0.46)
        attacks.lineBetween(point.x + nx * 3, point.y + ny * 3, targetPoint.x + nx * 3, targetPoint.y + ny * 3)
        attacks.lineBetween(point.x - nx * 3, point.y - ny * 3, targetPoint.x - nx * 3, targetPoint.y - ny * 3)
        attacks.lineStyle(2, color, 0.95)
        attacks.strokeCircle(targetPoint.x, targetPoint.y, 9 + Math.sin(pulseTime * 5) * 2)
        attacks.lineBetween(targetPoint.x - 13, targetPoint.y, targetPoint.x + 13, targetPoint.y)
        attacks.lineBetween(targetPoint.x, targetPoint.y - 13, targetPoint.x, targetPoint.y + 13)
      } else if (placement.kind === 'radiation-source') {
        const burstRadius = 52
        const wave = Math.min(radius, burstRadius) * (0.82 + Math.sin(pulseTime * 4) * 0.12)
        attacks.lineStyle(3, color, 0.78)
        attacks.strokeCircle(point.x, point.y, wave)
        attacks.lineStyle(1.2, color, 0.42)
        attacks.strokeCircle(point.x, point.y, Math.min(radius, burstRadius * 1.55))
        for (let index = 0; index < 8; index += 1) {
          const angle = index * Math.PI / 4 + pulseTime * 0.22
          const inner = 14 + Math.sin(pulseTime * 3 + index) * 4
          attacks.lineStyle(2, color, 0.7)
          attacks.lineBetween(point.x + Math.cos(angle) * inner, point.y + Math.sin(angle) * inner, point.x + Math.cos(angle) * (wave + 12), point.y + Math.sin(angle) * (wave + 12))
        }
        attacks.fillStyle(color, 0.9)
        attacks.fillCircle(point.x, point.y, 7 + Math.sin(pulseTime * 6) * 1.5)
      } else if (placement.kind === 'bulb') {
        const pulse = 1 + Math.sin(pulseTime * 5) * 0.08
        attacks.lineStyle(2, color, 0.58)
        attacks.strokeCircle(point.x, point.y, 24 * pulse)
        attacks.lineStyle(1, color, 0.34)
        attacks.strokeCircle(point.x, point.y, 34 * pulse)
        for (let index = 0; index < 12; index += 1) {
          const angle = index * Math.PI / 6 + pulseTime * 0.05
          attacks.lineBetween(point.x + Math.cos(angle) * 22, point.y + Math.sin(angle) * 22, point.x + Math.cos(angle) * 30, point.y + Math.sin(angle) * 30)
        }
      }
    })
  }

  private drawDevice(level: LevelConfig, placement: DevicePlacement, selectedId: string | null, network: OpticalNetwork) {
    const point = pointFor(level, placement)
    const input = network.deviceInputs.get(placement.id)
    const inputTint = ['bulb', 'laser-emitter', 'radiation-source'].includes(placement.kind) && input && totalPower(input) > 0.01
      ? powerColor(input, this.colorMode)
      : ''
    const signature = [
      placement.kind, placement.rotationDeg.toFixed(2), Math.round(placement.chargeJ ?? 0),
      Math.round(placement.acceleratorChargeJ ?? 0), placement.acceleratorPhase ?? '', placement.enabled,
      placement.upgradeLevel ?? 1, placement.id === selectedId, inputTint,
    ].join(':')
    const existing = this.deviceObjects.get(placement.id)
    if (existing?.signature === signature) {
      existing.graphics.setPosition(point.x, point.y)
      existing.label.setPosition(point.x, point.y + (placement.kind === 'mirror' ? 11 : 0))
      return
    }
    existing?.graphics.destroy(true)
    existing?.label.destroy(true)
    const color = terminalVisualColor(placement, network, this.colorMode)
    const g = this.add.graphics()
    if (placement.id === selectedId) {
      g.lineStyle(2, this.palette.selected, 0.9)
      g.strokeCircle(0, 0, 25)
      g.fillStyle(color, 0.13)
      g.fillCircle(0, 0, 24)
    }
    g.fillStyle(this.palette.deviceBody, 0.96)
    g.fillCircle(0, 0, 19)
    g.lineStyle(2.4, color, 0.95)
    if (placement.kind === 'mirror') {
      const angle = placement.rotationDeg * Math.PI / 180
      const ux = Math.cos(angle)
      const uy = Math.sin(angle)
      const vx = -uy
      const vy = ux
      g.lineStyle(6, color, 0.18)
      g.lineBetween(-ux * 19, -uy * 19, ux * 19, uy * 19)
      g.lineStyle(2.6, color, 0.98)
      g.lineBetween(-ux * 19, -uy * 19, ux * 19, uy * 19)
      g.lineStyle(1, this.palette.beamCore, 0.9)
      g.lineBetween(-ux * 16 + vx * 3, -uy * 16 + vy * 3, ux * 16 + vx * 3, uy * 16 + vy * 3)
      g.fillStyle(this.palette.deviceBody, 1)
      g.fillRect(-ux * 21 - 3, -uy * 21 - 3, 6, 6)
      g.fillRect(ux * 21 - 3, uy * 21 - 3, 6, 6)
      g.fillStyle(color, 0.92)
      g.fillTriangle(ux * 23, uy * 23, ux * 14 + vx * 5, uy * 14 + vy * 5, ux * 14 - vx * 5, uy * 14 - vy * 5)
      g.fillTriangle(-ux * 23, -uy * 23, -ux * 14 + vx * 5, -uy * 14 + vy * 5, -ux * 14 - vx * 5, -uy * 14 - vy * 5)
    } else if (placement.kind === 'splitter') {
      // A three-port optical manifold: one rear input, three unmistakable
      // forward output arrows, and a central prism hub.
      const angle = placement.rotationDeg * Math.PI / 180
      const forward = { x: Math.cos(angle), y: Math.sin(angle) }
      const side = { x: -forward.y, y: forward.x }
      g.strokeCircle(0, 0, 14)
      g.fillStyle(color, 0.72)
      g.fillCircle(0, 0, 5)
      g.lineStyle(2.2, color, 0.92)
      g.lineBetween(-forward.x * 21, -forward.y * 21, -forward.x * 4, -forward.y * 4)
      ;[-0.34, 0, 0.34].forEach((spread) => {
        const direction = {
          x: forward.x * Math.cos(spread) - side.x * Math.sin(spread),
          y: forward.y * Math.cos(spread) - side.y * Math.sin(spread),
        }
        const end = { x: direction.x * 23, y: direction.y * 23 }
        g.lineBetween(direction.x * 4, direction.y * 4, end.x, end.y)
        g.fillStyle(this.palette.beamCore, 0.88)
        g.fillTriangle(end.x, end.y, end.x - direction.x * 9 + side.x * 4, end.y - direction.y * 9 + side.y * 4, end.x - direction.x * 9 - side.x * 4, end.y - direction.y * 9 - side.y * 4)
      })
    } else if (placement.kind === 'prism-splitter') {
      const angle = placement.rotationDeg * Math.PI / 180
      const forward = { x: Math.cos(angle), y: Math.sin(angle) }
      const side = { x: -forward.y, y: forward.x }
      g.fillStyle(this.palette.prismFill, this.colorMode === 'light' ? 0.08 : 0.1)
      g.fillTriangle(forward.x * 18, forward.y * 18, -forward.x * 10 + side.x * 16, -forward.y * 10 + side.y * 16, -forward.x * 10 - side.x * 16, -forward.y * 10 - side.y * 16)
      g.strokeTriangle(forward.x * 18, forward.y * 18, -forward.x * 10 + side.x * 16, -forward.y * 10 + side.y * 16, -forward.x * 10 - side.x * 16, -forward.y * 10 - side.y * 16)
      g.lineStyle(1, this.palette.beamCore, 0.7)
      g.lineBetween(-forward.x * 10 + side.x * 7, -forward.y * 10 + side.y * 7, forward.x * 17, forward.y * 17)
      g.lineBetween(-forward.x * 10 - side.x * 7, -forward.y * 10 - side.y * 7, forward.x * 17, forward.y * 17)
      ;[this.colorMode === 'light' ? 0xdd2f3a : 0xff4f58, this.colorMode === 'light' ? 0x0f9d57 : 0x3ee68d, this.colorMode === 'light' ? 0x1f6feb : 0x4ea7ff].forEach((beamColor, index) => {
        const beamAngle = angle + (index - 1) * 0.36
        g.lineStyle(2, beamColor, 0.9)
        g.lineBetween(Math.cos(beamAngle) * 5, Math.sin(beamAngle) * 5, Math.cos(beamAngle) * 22, Math.sin(beamAngle) * 22)
      })
      g.fillStyle(this.palette.beamCore, 0.9)
      g.fillTriangle(forward.x * 24, forward.y * 24, forward.x * 13 + side.x * 5, forward.y * 13 + side.y * 5, forward.x * 13 - side.x * 5, forward.y * 13 - side.y * 5)
    } else if (placement.kind === 'filter') {
      const angle = placement.rotationDeg * Math.PI / 180
      const forward = { x: Math.cos(angle), y: Math.sin(angle) }
      const side = { x: -forward.y, y: forward.x }
      g.fillStyle(color, 0.22)
      g.fillTriangle(
        forward.x * 16 + side.x * 11, forward.y * 16 + side.y * 11,
        forward.x * 16 - side.x * 11, forward.y * 16 - side.y * 11,
        -forward.x * 16, -forward.y * 16,
      )
      g.lineStyle(2.2, color, 0.95)
      g.lineBetween(side.x * 15, side.y * 15, -side.x * 15, -side.y * 15)
      g.fillStyle(this.palette.beamCore, 0.92)
      g.fillTriangle(forward.x * 23, forward.y * 23, forward.x * 13 + side.x * 5, forward.y * 13 + side.y * 5, forward.x * 13 - side.x * 5, forward.y * 13 - side.y * 5)
    } else if (placement.kind === 'shutter') {
      const angle = placement.rotationDeg * Math.PI / 180
      const forward = { x: Math.cos(angle), y: Math.sin(angle) }
      const side = { x: -forward.y, y: forward.x }
      g.lineStyle(2.4, color, 0.95)
      g.lineBetween(side.x * 15, side.y * 15, -side.x * 15, -side.y * 15)
      g.lineStyle(1.2, this.palette.beamCore, 0.8)
      g.lineBetween(side.x * 10 + forward.x * 4, side.y * 10 + forward.y * 4, -side.x * 10 + forward.x * 4, -side.y * 10 + forward.y * 4)
      g.fillStyle(this.palette.beamCore, 0.9)
      g.fillTriangle(forward.x * 23, forward.y * 23, forward.x * 13 + side.x * 5, forward.y * 13 + side.y * 5, forward.x * 13 - side.x * 5, forward.y * 13 - side.y * 5)
    } else if (placement.kind === 'combiner') {
      const angle = placement.rotationDeg * Math.PI / 180
      const directionX = Math.cos(angle)
      const directionY = Math.sin(angle)
      const perpendicularX = -directionY
      const perpendicularY = directionX
      g.strokeCircle(0, 0, 16)
      g.lineStyle(3, color, 0.95)
      g.lineBetween(directionX * 8, directionY * 8, directionX * 23, directionY * 23)
      g.lineBetween(directionX * 23, directionY * 23, directionX * 16 + perpendicularX * 5, directionY * 16 + perpendicularY * 5)
      g.lineBetween(directionX * 23, directionY * 23, directionX * 16 - perpendicularX * 5, directionY * 16 - perpendicularY * 5)
      g.lineStyle(1.6, color, 0.62)
      g.lineBetween(-directionX * 10 + perpendicularX * 7, -directionY * 10 + perpendicularY * 7, -directionX * 20 + perpendicularX * 13, -directionY * 20 + perpendicularY * 13)
      g.lineBetween(-directionX * 10 - perpendicularX * 7, -directionY * 10 - perpendicularY * 7, -directionX * 20 - perpendicularX * 13, -directionY * 20 - perpendicularY * 13)
      g.fillStyle(this.palette.beamCore, 0.9)
      g.fillCircle(directionX * 12, directionY * 12, 2.5)
      g.fillTriangle(directionX * 24, directionY * 24, directionX * 14 + perpendicularX * 5, directionY * 14 + perpendicularY * 5, directionX * 14 - perpendicularX * 5, directionY * 14 - perpendicularY * 5)
    } else if (placement.kind === 'capacitor') {
      g.strokeRoundedRect(-15, -13, 30, 26, 5)
      g.lineStyle(1.2, color, 0.55)
      g.lineBetween(-11, -9, -11, 9)
      g.lineBetween(11, -9, 11, 9)
      const fraction = Math.min(1, (placement.chargeJ ?? 0) / 450)
      g.fillStyle(color, 0.82)
      g.fillRoundedRect(-10, 9 - fraction * 18, 20, fraction * 18, 2)
      g.lineStyle(2, this.palette.beamCore, 0.78)
      g.lineBetween(-4, -18, -4, -12)
      g.lineBetween(4, 12, 4, 18)
    } else if (placement.kind === 'bulb') {
      // A sealed xenon capsule with an explicit filament and contact base.
      g.strokeRoundedRect(-11, -14, 22, 25, 8)
      g.fillStyle(color, this.colorMode === 'light' ? 0.62 : 0.48)
      g.fillCircle(0, -2, 8)
      g.lineStyle(1.4, this.palette.beamCore, 0.9)
      g.lineBetween(-4, -2, -2, 4)
      g.lineBetween(4, -2, 2, 4)
      g.lineBetween(-2, 4, 2, 4)
      g.fillStyle(this.palette.deviceBody, 1)
      g.fillRoundedRect(-7, 9, 14, 7, 2)
      g.lineStyle(1.4, color, 0.95)
      g.lineBetween(-5, 12, 5, 12)
      for (let index = 0; index < 8; index += 1) {
        const angle = index * Math.PI / 4
        g.lineBetween(Math.cos(angle) * 17, Math.sin(angle) * 17, Math.cos(angle) * 23, Math.sin(angle) * 23)
      }
    } else if (placement.kind === 'laser-emitter') {
      // Armored coherent-light chassis, rotated to match the optical output.
      g.strokeRoundedRect(-17, -10, 29, 20, 4)
      g.fillStyle(color, 0.18)
      g.fillRoundedRect(-12, -6, 17, 12, 2)
      g.lineStyle(1.2, this.palette.beamCore, 0.55)
      g.lineBetween(-9, -4, -9, 4)
      g.lineBetween(-4, -4, -4, 4)
      g.lineStyle(3, color, 0.95)
      g.lineBetween(10, 0, 22, 0)
      g.lineStyle(1.2, this.palette.beamCore, 0.92)
      g.strokeCircle(20, 0, 6)
      g.fillStyle(this.palette.beamCore, 0.92)
      g.fillTriangle(27, 0, 18, -5, 18, 5)
      g.lineStyle(1, color, 0.7)
      g.lineBetween(-13, -13, 1, -13)
      g.lineBetween(-13, 13, 1, 13)
      g.setRotation(placement.rotationDeg * Math.PI / 180)
    } else if (placement.kind === 'radiation-source') {
      // Three-lobed containment reactor, visually distinct from the laser.
      g.strokeCircle(0, 0, 17)
      g.strokeCircle(0, 0, 8)
      for (let index = 0; index < 3; index += 1) {
        const angle = index * Math.PI * 2 / 3
        g.fillStyle(color, 0.62)
        g.fillTriangle(Math.cos(angle) * 4, Math.sin(angle) * 4, Math.cos(angle - 0.34) * 16, Math.sin(angle - 0.34) * 16, Math.cos(angle + 0.34) * 16, Math.sin(angle + 0.34) * 16)
        g.lineStyle(1.2, this.palette.beamCore, 0.6)
        g.lineBetween(Math.cos(angle) * 8, Math.sin(angle) * 8, Math.cos(angle) * 18, Math.sin(angle) * 18)
      }
      g.fillStyle(color, 0.94)
      g.fillCircle(0, 0, 4)
    } else if (placement.kind === 'collector') {
      g.strokeCircle(0, 0, 16)
      g.strokeCircle(0, 0, 9)
      g.lineStyle(1.2, this.palette.beamCore, 0.7)
      g.strokeCircle(0, 0, 5)
      g.lineBetween(-20, -13, -13, -6)
      g.lineBetween(-20, 13, -13, 6)
      g.lineBetween(13, 0, 23, 0)
    } else if (placement.kind === 'frost-tower') {
      g.fillStyle(color, 0.16)
      const frostHex = [{ x: 0, y: -19 }, { x: 16, y: -9 }, { x: 16, y: 9 }, { x: 0, y: 19 }, { x: -16, y: 9 }, { x: -16, y: -9 }]
      g.fillPoints(frostHex, true, true)
      g.lineStyle(1.7, color, 0.98)
      g.strokePoints(frostHex, true, true)
      for (let index = 0; index < 3; index += 1) {
        const angle = index * Math.PI / 3
        g.lineBetween(-Math.cos(angle) * 15, -Math.sin(angle) * 15, Math.cos(angle) * 15, Math.sin(angle) * 15)
      }
      g.fillStyle(this.palette.beamCore, 0.92)
      g.fillCircle(0, 0, 3)
    } else if (placement.kind === 'brazier') {
      g.strokeRoundedRect(-15, 7, 30, 11, 3)
      g.fillStyle(color, 0.55)
      g.fillTriangle(-12, 7, 0, -19, 12, 7)
      g.fillStyle(this.palette.beamCore, 0.88)
      g.fillTriangle(-5, 6, 0, -11, 5, 6)
      g.lineStyle(1.3, color, 0.9)
      g.lineBetween(-11, 13, 11, 13)
      g.lineBetween(-8, 19, -4, 22)
      g.lineBetween(8, 19, 4, 22)
    } else if (placement.kind === 'accelerator') {
      // Compact cyclotron: nested ring, injector coil and a directional muzzle.
      g.strokeCircle(0, 0, 17)
      g.strokeCircle(0, 0, 10)
      g.lineStyle(1.2, color, 0.55)
      for (let index = 0; index < 8; index += 1) {
        const angle = index * Math.PI / 4
        g.lineBetween(Math.cos(angle) * 12, Math.sin(angle) * 12, Math.cos(angle) * 17, Math.sin(angle) * 17)
      }
      g.lineStyle(3, color, 0.9)
      g.lineBetween(9, 0, 23, 0)
      g.lineStyle(1.3, this.palette.beamCore, 0.92)
      g.strokeCircle(22, 0, 5)
      g.fillStyle(this.palette.beamCore, 0.92)
      g.fillTriangle(29, 0, 20, -5, 20, 5)
      g.setRotation(placement.rotationDeg * Math.PI / 180)
    } else {
      g.strokeCircle(0, 0, 17)
      g.strokeCircle(0, 0, 11)
      g.fillStyle(color, 0.32)
      g.fillCircle(0, 0, placement.kind.startsWith('source-') ? 10 : 7)
      g.lineStyle(1.2, color, 0.72)
      g.lineBetween(-21, 0, -15, 0)
      g.lineBetween(15, 0, 21, 0)
    }
    const label = this.add.text(0, placement.kind === 'mirror' ? 11 : 0, DEVICE_LABELS[placement.kind], {
      fontFamily: 'Arial, sans-serif', fontSize: placement.kind === 'mirror' ? '8px' : '7px', color: this.palette.deviceLabel, fontStyle: 'bold',
    }).setOrigin(0.5)
    g.setPosition(point.x, point.y)
    label.setPosition(point.x, point.y + (placement.kind === 'mirror' ? 11 : 0))
    this.entityLayer.add(g)
    this.entityLayer.add(label)
    this.deviceObjects.set(placement.id, { graphics: g, label, signature })
  }

  private drawEnemy(level: LevelConfig, enemy: BattleState['enemies'][number]) {
    if (enemy.dead || enemy.escaped) {
      this.enemyObjects.get(enemy.id)?.graphics.destroy(true)
      this.enemyObjects.delete(enemy.id)
      return
    }
    const path = level.paths?.[enemy.routeIndex ?? 0] ?? level.path
    const point = pointOnPath(path, enemy.progress)
    const color = this.colorMode === 'light'
      ? enemy.kind === 'boss' ? 0xc92f52 : enemy.kind === 'armored' ? 0x455b73 : enemy.kind === 'resistant' ? 0x8d3dbf : enemy.kind === 'fast' ? 0xd0890a : 0x3a4658
      : enemy.kind === 'boss' ? 0xff4967 : enemy.kind === 'armored' ? 0xa7b3c2 : enemy.kind === 'resistant' ? 0xd98bff : enemy.kind === 'fast' ? 0xffce59 : 0xf4f6f0
    const size = enemy.kind === 'boss' ? 22 : enemy.kind === 'armored' ? 17 : 13
    // 状态变化时才重建敌人图形（位置每帧 setPosition，血量按 5% 分档）。
    const healthBucket = Math.round(enemy.health / enemy.maxHealth * 20)
    const shieldBucket = enemy.status.shield > 0
      ? Math.round(Math.min(1, enemy.status.shield / Math.max(1, enemy.kind === 'boss' ? enemy.maxHealth * 0.15 : enemy.maxHealth * 0.12)) * 10)
      : 0
    const signature = [
      enemy.kind, enemy.resistance ?? '', healthBucket, shieldBucket,
      enemy.status.freezeSeconds > 0 ? 1 : 0,
      enemy.status.burnSeconds > 0 ? 1 : 0,
      enemy.status.poisonSeconds > 0 ? 1 : 0,
      Math.ceil(enemy.status.radiationStacks),
      enemy.status.armorBrokenSeconds > 0 ? 1 : 0,
      enemy.status.vulnerableSeconds > 0 ? 1 : 0,
    ].join(':')
    const cached = this.enemyObjects.get(enemy.id)
    const g = cached?.graphics ?? this.add.graphics()
    g.setPosition(point.x, point.y)
    if (cached && cached.signature === signature) return
    g.clear()
    const backingHull = [
      { x: size + 6, y: 0 }, { x: size * 0.42, y: -size - 4 }, { x: -size * 0.62, y: -size - 3 },
      { x: -size - 5, y: 0 }, { x: -size * 0.62, y: size + 3 }, { x: size * 0.42, y: size + 4 },
    ]
    g.fillStyle(this.palette.enemyBacking, this.colorMode === 'light' ? 0.76 : 0.72)
    g.fillPoints(backingHull, true, true)
    if (this.colorMode === 'light') {
      // A hull-shaped shadow keeps ships legible without reading as circular UI tokens.
      g.lineStyle(1.2, 0x8b96a8, 0.6)
      g.strokePoints(backingHull, true, true)
    }
    g.fillStyle(color, 1)
    // Each class is a different spacecraft silhouette rather than a generic
    // marker: scout, interceptor, frigate, drone and command cruiser.
    if (enemy.kind === 'fast') {
      g.fillPoints([
        { x: size * 1.35, y: 0 }, { x: size * 0.15, y: -size * 0.42 },
        { x: -size * 0.86, y: -size * 0.92 }, { x: -size * 0.62, y: -size * 0.14 },
        { x: -size * 0.62, y: size * 0.14 }, { x: -size * 0.86, y: size * 0.92 },
        { x: size * 0.15, y: size * 0.42 },
      ], true, true)
      g.lineStyle(1.4, this.palette.beamCore, 0.9)
      g.strokePoints([{ x: size * 1.35, y: 0 }, { x: size * 0.15, y: -size * 0.42 }, { x: -size * 0.86, y: -size * 0.92 }, { x: -size * 0.62, y: -size * 0.14 }, { x: -size * 0.62, y: size * 0.14 }, { x: -size * 0.86, y: size * 0.92 }, { x: size * 0.15, y: size * 0.42 }], true, true)
      g.fillStyle(this.palette.beamCore, 0.92)
      g.fillCircle(size * 0.38, 0, Math.max(2.5, size * 0.2))
      g.fillStyle(this.palette.enemyBacking, 0.65)
      g.fillCircle(-size * 0.58, -size * 0.48, Math.max(1.5, size * 0.12))
      g.fillCircle(-size * 0.58, size * 0.48, Math.max(1.5, size * 0.12))
    } else if (enemy.kind === 'armored') {
      const hull = [
        { x: -size * 0.9, y: -size * 0.7 }, { x: -size * 0.35, y: -size },
        { x: size * 0.82, y: -size * 0.78 }, { x: size * 1.02, y: 0 },
        { x: size * 0.82, y: size * 0.78 }, { x: -size * 0.35, y: size },
        { x: -size * 0.9, y: size * 0.7 }, { x: -size * 0.7, y: 0 },
      ]
      g.fillPoints(hull, true, true)
      g.lineStyle(1.8, this.palette.beamCore, 0.74)
      g.strokePoints(hull, true, true)
      g.lineStyle(1.5, color, 0.9)
      g.lineBetween(-size * 0.58, -size * 0.58, size * 0.58, -size * 0.58)
      g.lineBetween(-size * 0.58, size * 0.58, size * 0.58, size * 0.58)
      g.fillStyle(this.palette.beamCore, 0.86)
      g.fillCircle(size * 0.45, 0, Math.max(3, size * 0.2))
    } else if (enemy.kind === 'resistant') {
      const drone = [
        { x: size * 1.05, y: 0 }, { x: size * 0.52, y: -size * 0.78 },
        { x: -size * 0.44, y: -size * 0.78 }, { x: -size * 0.98, y: 0 },
        { x: -size * 0.44, y: size * 0.78 }, { x: size * 0.52, y: size * 0.78 },
      ]
      g.fillPoints(drone, true, true)
      g.lineStyle(1.5, this.palette.beamCore, 0.78)
      g.strokePoints(drone, true, true)
      g.lineStyle(1.2, color, 0.9)
      g.lineBetween(-size * 0.3, -size * 0.7, size * 0.3, size * 0.7)
      g.lineBetween(-size * 0.3, size * 0.7, size * 0.3, -size * 0.7)
      g.fillStyle(this.palette.beamCore, 0.9)
      g.fillCircle(0, 0, Math.max(3, size * 0.22))
    } else if (enemy.kind === 'boss') {
      const cruiser = [
        { x: size * 1.28, y: 0 }, { x: size * 0.4, y: -size * 0.65 },
        { x: size * 0.1, y: -size * 1.12 }, { x: -size * 0.48, y: -size * 0.78 },
        { x: -size * 1.02, y: -size * 0.9 }, { x: -size * 0.72, y: 0 },
        { x: -size * 1.02, y: size * 0.9 }, { x: -size * 0.48, y: size * 0.78 },
        { x: size * 0.1, y: size * 1.12 }, { x: size * 0.4, y: size * 0.65 },
      ]
      g.fillPoints(cruiser, true, true)
      g.lineStyle(2.2, this.palette.beamCore, 0.9)
      g.strokePoints(cruiser, true, true)
      g.lineStyle(2, color, 0.9)
      g.lineBetween(-size * 0.78, -size * 0.62, size * 0.72, -size * 0.2)
      g.lineBetween(-size * 0.78, size * 0.62, size * 0.72, size * 0.2)
      g.fillStyle(this.palette.beamCore, 0.95)
      g.fillCircle(size * 0.36, 0, Math.max(4, size * 0.22))
      g.fillStyle(color, 0.8)
      g.fillCircle(-size * 0.42, -size * 0.34, 2.2)
      g.fillCircle(-size * 0.42, size * 0.34, 2.2)
    } else {
      const scout = [
        { x: size * 1.05, y: 0 }, { x: size * 0.05, y: -size * 0.72 },
        { x: -size * 0.94, y: -size * 0.48 }, { x: -size * 0.58, y: 0 },
        { x: -size * 0.94, y: size * 0.48 }, { x: size * 0.05, y: size * 0.72 },
      ]
      g.fillPoints(scout, true, true)
      g.lineStyle(1.3, this.palette.beamCore, 0.82)
      g.strokePoints(scout, true, true)
      g.fillStyle(this.palette.beamCore, 0.9)
      g.fillCircle(size * 0.3, 0, Math.max(2.5, size * 0.2))
      g.lineStyle(1.5, color, 0.85)
      g.lineBetween(-size * 0.8, -size * 0.32, -size * 0.8, size * 0.32)
    }
    if (enemy.resistance) {
      g.lineStyle(3, enemy.resistance === 'r' ? (this.colorMode === 'light' ? 0xdd2f3a : 0xff4f58) : enemy.resistance === 'g' ? (this.colorMode === 'light' ? 0x0f9d57 : 0x3ee68d) : (this.colorMode === 'light' ? 0x1f6feb : 0x4ea7ff), 1)
      g.strokeCircle(0, 0, size + 2)
    }
    g.fillStyle(this.palette.healthTrack, 1)
    g.fillRoundedRect(-18, size + 7, 36, 4, 2)
    g.fillStyle(enemy.health / enemy.maxHealth < 0.3
      ? (this.colorMode === 'light' ? 0xcf3243 : 0xff5e67)
      : (this.colorMode === 'light' ? 0x1e8f5a : 0x5df1a6), 1)
    g.fillRoundedRect(-18, size + 7, 36 * (enemy.health / enemy.maxHealth), 4, 2)
    if (enemy.status.freezeSeconds > 0) {
      g.lineStyle(2, this.colorMode === 'light' ? 0x2f7fd6 : 0x69e9ff, 0.9)
      g.strokeCircle(0, 0, size + 6)
      g.lineStyle(1.6, this.colorMode === 'light' ? 0x2f7fd6 : 0x9af3ff, 0.85)
      for (let index = 0; index < 6; index += 1) {
        const angle = index * Math.PI / 3
        const inner = size + 4
        const outer = size + 11
        g.lineBetween(Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle) * outer, Math.sin(angle) * outer)
        g.lineBetween(Math.cos(angle) * outer, Math.sin(angle) * outer, Math.cos(angle + 0.12) * (outer - 3), Math.sin(angle + 0.12) * (outer - 3))
      }
    }
    if (enemy.status.burnSeconds > 0) {
      const burnColor = this.colorMode === 'light' ? 0xe0631f : 0xff983d
      g.fillStyle(burnColor, 0.9)
      g.fillTriangle(size * 0.32, -size * 0.55, size * 0.75, -size * 0.9, size * 0.82, -size * 0.2)
      g.fillTriangle(-size * 0.15, -size * 0.75, size * 0.1, -size * 1.15, size * 0.38, -size * 0.55)
    }
    if (enemy.status.poisonSeconds > 0) {
      const poisonColor = this.colorMode === 'light' ? 0x1f9d6a : 0x56ed87
      g.fillStyle(poisonColor, 0.9)
      g.fillCircle(size * 0.65, -size * 0.65, 4)
      g.fillCircle(size * 0.18, -size * 0.95, 2.6)
      g.lineStyle(1.4, poisonColor, 0.8)
      g.lineBetween(-size * 0.7, size * 0.82, -size * 0.3, size * 1.15)
    }
    if (enemy.status.shield > 0) {
      g.lineStyle(2, this.colorMode === 'light' ? 0x1f6feb : 0x79b9ff, 0.9)
      g.strokeCircle(0, 0, size + 9)
      const shieldFraction = Math.min(1, enemy.status.shield / Math.max(1, enemy.kind === 'boss' ? enemy.maxHealth * 0.15 : enemy.maxHealth * 0.12))
      g.lineStyle(3, this.colorMode === 'light' ? 0x86a8ea : 0xd7f1ff, 0.9)
      g.beginPath()
      g.arc(0, 0, size + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * shieldFraction)
      g.strokePath()
    }
    if (enemy.status.radiationStacks > 0) {
      const radiationColor = this.colorMode === 'light' ? 0x8d3dbf : 0xe875ff
      g.fillStyle(radiationColor, 0.92)
      const stacks = Math.min(3, Math.ceil(enemy.status.radiationStacks))
      for (let index = 0; index < stacks; index += 1) {
        const angle = index * Math.PI * 2 / 3 - Math.PI / 2
        const cx = Math.cos(angle) * (size + 9)
        const cy = Math.sin(angle) * (size + 9)
        g.fillTriangle(cx, cy - 4, cx - 3.4, cy + 3, cx + 3.4, cy + 3)
      }
      g.lineStyle(1.4, radiationColor, 0.85)
      g.strokeCircle(0, 0, size + 14)
    }
    if (enemy.status.armorBrokenSeconds > 0) {
      g.lineStyle(2, this.colorMode === 'light' ? 0xc98a06 : 0xffd56a, 0.9)
      g.lineBetween(-size - 4, -size - 4, size + 4, size + 4)
      g.lineBetween(size + 4, -size - 4, -size - 4, size + 4)
    }
    if (enemy.status.vulnerableSeconds > 0) {
      g.lineStyle(2, this.palette.selected, 0.92)
      g.lineBetween(-size - 7, 0, -size - 2, -5)
      g.lineBetween(-size - 2, -5, 2, 4)
      g.lineBetween(2, 4, size + 7, -4)
    }
    if (!cached) {
      this.entityLayer.add(g)
      this.enemyObjects.set(enemy.id, { graphics: g, signature })
    } else {
      cached.signature = signature
    }
  }

  private playEvents(snapshot: SceneSnapshot) {
    snapshot.battle.events.filter((event) => event.id > this.handledEventId).forEach((event) => {
      this.handledEventId = Math.max(this.handledEventId, event.id)
      if (event.type === 'kill') {
        const text = this.add.text(event.point.x, event.point.y - 20, `+${event.value}W`, { color: this.colorMode === 'light' ? '#18754a' : '#7bffc0', fontFamily: 'Arial', fontSize: '14px', fontStyle: 'bold' }).setOrigin(0.5)
        this.tweens.add({ targets: text, y: text.y - 30, alpha: 0, duration: snapshot.reduceMotion ? 200 : 760, onComplete: () => text.destroy() })
      }
      if (event.type === 'explosion') {
        // Use one self-contained graphics burst so capacitor detonations are
        // visible even when the attack layer is being redrawn for a new tick.
        const burstColor = this.colorMode === 'light' ? 0xc98a06 : 0xffd36a
        const burst = this.add.graphics().setPosition(event.point.x, event.point.y)
        burst.fillStyle(burstColor, 0.18)
        burst.fillCircle(0, 0, 16)
        burst.lineStyle(4, this.palette.selected, 0.92)
        burst.strokeCircle(0, 0, 24)
        burst.lineStyle(1.6, burstColor, 0.88)
        for (let index = 0; index < 12; index += 1) {
          const angle = index * Math.PI / 6
          burst.lineBetween(Math.cos(angle) * 27, Math.sin(angle) * 27, Math.cos(angle) * 40, Math.sin(angle) * 40)
        }
        const scale = event.radius / 24
        this.tweens.add({ targets: burst, scale, alpha: 0, duration: snapshot.reduceMotion ? 260 : 850, ease: 'Cubic.Out', onComplete: () => burst.destroy() })
        this.cameras.main.shake(snapshot.reduceMotion ? 50 : 260, snapshot.reduceMotion ? 0.001 : 0.008)
      }
    })
  }

  private drawSnapshot() {
    const snapshot = this.snapshot
    if (!snapshot) return
    const battleRestarted = snapshot.battle.elapsedSeconds + 1e-6 < this.lastBattleElapsedSeconds
      || snapshot.battle.nextEntityId < this.lastBattleEntityId
    if (battleRestarted) this.handledEventId = 0
    this.lastBattleElapsedSeconds = snapshot.battle.elapsedSeconds
    this.lastBattleEntityId = snapshot.battle.nextEntityId
    const colorModeChanged = this.colorMode !== snapshot.colorMode
    if (colorModeChanged) {
      this.colorMode = snapshot.colorMode
      this.palette = SCENE_PALETTES[this.colorMode]
      this.cameras.main.setBackgroundColor(this.palette.background)
      this.applyBlendModes()
      this.applyPulseMode()
    }
    if (this.lastLevelId !== snapshot.level.id || colorModeChanged) {
      this.drawBoard(snapshot.level)
      this.lastLevelId = snapshot.level.id
      this.lastHoleSignature = '\u0000'
      this.lastRangeSignature = null
      this.handledEventId = 0
      this.deviceObjects.forEach(({ graphics, label }) => { graphics.destroy(true); label.destroy(true) })
      this.enemyObjects.forEach(({ graphics }) => graphics.destroy(true))
      this.deviceObjects.clear()
      this.enemyObjects.clear()
    }
    const holeSignature = [
      ...snapshot.battle.placements.filter((placement) => !placement.destroyed).map((placement) => placement.holeId),
      ...(snapshot.recommendedHoleIds ?? []).map((holeId) => `recommended:${holeId}`),
    ].sort().join('|')
    if (holeSignature !== this.lastHoleSignature) {
      this.drawHoles(snapshot.level, snapshot.battle.placements, snapshot.recommendedHoleIds)
      this.lastHoleSignature = holeSignature
    }
    const network = snapshot.network
    this.drawAttackRanges(snapshot, network)
    this.drawBeams(snapshot, network)
    snapshot.battle.placements.forEach((placement) => this.drawDevice(snapshot.level, placement, snapshot.selectedId, network))
    snapshot.battle.enemies.forEach((enemy) => this.drawEnemy(snapshot.level, enemy))
    const placementIds = new Set(snapshot.battle.placements.map((placement) => placement.id))
    this.deviceObjects.forEach(({ graphics, label }, id) => {
      if (placementIds.has(id)) return
      graphics.destroy(true)
      label.destroy(true)
      this.deviceObjects.delete(id)
    })
    const enemyIds = new Set(snapshot.battle.enemies.filter((enemy) => !enemy.dead && !enemy.escaped).map((enemy) => enemy.id))
    this.enemyObjects.forEach(({ graphics }, id) => {
      if (enemyIds.has(id)) return
      graphics.destroy(true)
      this.enemyObjects.delete(id)
    })
    this.playEvents(snapshot)
  }
}

export { LAB_HEIGHT, LAB_WIDTH, Phaser }
