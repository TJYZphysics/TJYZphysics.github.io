import Phaser from 'phaser'

import type { OpticalNetwork } from './optics'
import { pointOnPath, terminalAttackRange } from './simulation'
import type { BattleState } from './simulation'
import type { DeviceKind, DevicePlacement, LevelConfig, Point, RgbPower } from './types'
import { totalPower, visibleColor } from './rules'

export type SceneSnapshot = {
  level: LevelConfig
  battle: BattleState
  network: OpticalNetwork
  selectedId: string | null
  beamGlow: boolean
  reduceMotion: boolean
  recommendedHoleIds?: string[]
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

function powerColor(power: RgbPower) {
  const color = visibleColor(power)
  return ({ red: 0xff454f, green: 0x48ef8b, blue: 0x469dff, yellow: 0xffe36b, orange: 0xff9a3d, magenta: 0xff61e6, cyan: 0x54f2ff, white: 0xf5ffff, dark: 0x7d8a96 } as const)[color]
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

  constructor(callbacks: OpticalSceneCallbacks) {
    super({ key: 'optical-defense' })
    this.callbacks = callbacks
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b100f')
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
    this.beamGraphics.setBlendMode(Phaser.BlendModes.ADD)
    this.attackGraphics.setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({ targets: this.beamGraphics, alpha: { from: 0.72, to: 1 }, duration: 760, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    this.tweens.add({ targets: this.attackGraphics, alpha: { from: 0.45, to: 0.92 }, duration: 360, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
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
    path.fillStyle(0x5ee1a4, 0.24)
    if (isLeft) path.fillRect(0, edgePoint.y - 18, 18, 36)
    else if (isRight) path.fillRect(LAB_WIDTH - 18, edgePoint.y - 18, 18, 36)
    else if (isTop) path.fillRect(edgePoint.x - 18, 0, 36, 18)
    else path.fillRect(edgePoint.x - 18, LAB_HEIGHT - 18, 36, 18)
    path.lineStyle(3, 0x63e9ad, 0.82)
    if (isLeft) path.lineBetween(17, edgePoint.y - 18, 17, edgePoint.y + 18)
    else if (isRight) path.lineBetween(LAB_WIDTH - 17, edgePoint.y - 18, LAB_WIDTH - 17, edgePoint.y + 18)
    else if (isTop) path.lineBetween(edgePoint.x - 18, 17, edgePoint.x + 18, 17)
    else path.lineBetween(edgePoint.x - 18, LAB_HEIGHT - 17, edgePoint.x + 18, LAB_HEIGHT - 17)
  }

  private drawBoard(level: LevelConfig) {
    const g = this.board
    g.clear()
    g.fillStyle(0x111918, 1)
    g.fillRect(0, 0, LAB_WIDTH, LAB_HEIGHT)

    const { cellSize, columns, rows, originX, originY } = level.grid
    for (let column = 0; column <= columns; column += 1) {
      const x = originX + column * cellSize
      g.lineStyle(1, 0x51615c, 0.18)
      g.lineBetween(x, originY, x, originY + rows * cellSize)
    }
    for (let row = 0; row <= rows; row += 1) {
      const y = originY + row * cellSize
      g.lineStyle(1, 0x51615c, 0.18)
      g.lineBetween(originX, y, originX + columns * cellSize, y)
    }
    g.lineStyle(2, 0x64736c, 0.72)
    g.strokeRoundedRect(5, 5, LAB_WIDTH - 10, LAB_HEIGHT - 10, 10)

    const path = this.pathGraphics
    path.clear()
    const halfCell = cellSize / 2
    path.fillStyle(0x292620, 1)
    level.routeCells.forEach((point) => {
      path.fillRect(point.x - halfCell, point.y - halfCell, cellSize, cellSize)
    })
    ;(level.paths ?? [level.path]).forEach((route) => {
      this.fillEdgeExtension(path, level.grid, route[0])
      this.fillEdgeExtension(path, level.grid, route.at(-1)!)
    })

    path.lineStyle(1, 0xa68d61, 0.24)
    level.routeCells.forEach((point) => {
      path.strokeRect(point.x - halfCell, point.y - halfCell, cellSize, cellSize)
    })
    const paths = level.paths ?? [level.path]
    paths.forEach((route) => {
      path.lineStyle(3, 0xe4c27a, 0.3)
      path.beginPath()
      path.moveTo(route[0].x, route[0].y)
      route.slice(1).forEach((point) => path.lineTo(point.x, point.y))
      path.strokePath()
      path.lineStyle(2, 0xf0d28d, 0.46)
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
    path.fillStyle(0xd7a05f, 0.18)
    path.fillCircle(core.x, core.y, 26)
    path.lineStyle(3, 0xe0ae6d, 0.8)
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
      g.fillStyle(0x142321, 0.92)
      empty.forEach(({ point }) => g.fillRect(point.x - halfCell, point.y - halfCell, cellSize, cellSize))
      g.fillStyle(0x1b302e, 0.92)
      used.forEach(({ point }) => g.fillRect(point.x - halfCell, point.y - halfCell, cellSize, cellSize))
      g.lineStyle(1, 0x42534e, 0.28)
      empty.forEach(({ point }) => g.strokeRect(point.x - halfCell, point.y - halfCell, cellSize, cellSize))
      g.lineStyle(1, 0x71a49b, 0.5)
      used.forEach(({ point }) => g.strokeRect(point.x - halfCell, point.y - halfCell, cellSize, cellSize))
    }
    g.fillStyle(0x182a28, 0.94)
    empty.forEach(({ point }) => g.fillRoundedRect(point.x - plate / 2, point.y - plate / 2, plate, plate, 7))
    g.fillStyle(0x203b39, 0.94)
    used.forEach(({ point }) => g.fillRoundedRect(point.x - plate / 2, point.y - plate / 2, plate, plate, 7))
    g.lineStyle(1, 0x3f6662, 0.48)
    empty.forEach(({ point }) => g.strokeRoundedRect(point.x - plate / 2, point.y - plate / 2, plate, plate, 7))
    g.lineStyle(1, 0x7bc0b4, 0.72)
    used.forEach(({ point }) => g.strokeRoundedRect(point.x - plate / 2, point.y - plate / 2, plate, plate, 7))
    if (!compact) {
      g.fillStyle(0x050908, 0.92)
      empty.forEach(({ point }) => g.fillCircle(point.x, point.y, 9 * scale))
      g.fillStyle(0x050908, 0.58)
      used.forEach(({ point }) => g.fillCircle(point.x, point.y, 13 * scale))
      g.lineStyle(1.5, 0x5b817c, 0.72)
      empty.forEach(({ point }) => g.strokeCircle(point.x, point.y, 11 * scale))
      g.lineStyle(1.5, 0xa4c9c2, 0.76)
      used.forEach(({ point }) => g.strokeCircle(point.x, point.y, 15 * scale))
    }
    rows.filter((row) => row.isRecommended).forEach(({ point }) => {
      const margin = plate / 2 + 4
      g.lineStyle(3, 0x74f4e0, 0.92)
      g.strokeRoundedRect(point.x - margin, point.y - margin, margin * 2, margin * 2, 8)
      g.lineStyle(1, 0xf7e897, 0.82)
      g.strokeCircle(point.x, point.y, 20 * scale)
    })
  }

  private drawBeams(snapshot: SceneSnapshot, network: OpticalNetwork) {
    const g = this.beamGraphics
    g.clear()
    network.segments.forEach((segment) => {
      const color = powerColor(segment.power)
      const width = Math.max(1.2, Math.min(8, totalPower(segment.power) / 22))
      if (snapshot.beamGlow) {
        g.lineStyle(width + 12, color, 0.08)
        g.lineBetween(segment.start.x, segment.start.y, segment.end.x, segment.end.y)
        g.lineStyle(width + 5, color, 0.18)
        g.lineBetween(segment.start.x, segment.start.y, segment.end.x, segment.end.y)
      }
      g.lineStyle(width, color, 0.92)
      g.lineBetween(segment.start.x, segment.start.y, segment.end.x, segment.end.y)
      g.lineStyle(1, 0xffffff, 0.85)
      g.lineBetween(segment.start.x, segment.start.y, segment.end.x, segment.end.y)
    })
  }

  private lastRangeSignature: string | null = null

  private drawAttackRanges(snapshot: SceneSnapshot, network: OpticalNetwork) {
    const ranges = this.rangeGraphics
    const attacks = this.attackGraphics
    const alive = snapshot.battle.enemies.filter((enemy) => !enemy.dead && !enemy.escaped).sort((left, right) => right.progress - left.progress)

    // 静态范围圈：仅当设备构成/升级/选中态变化时重绘。避免每帧重建大半径圆
    // （30 台终端 × 大圆会产生大量 WebGL 顶点，是大地图卡顿的主因）。
    const rangeSignature = snapshot.battle.placements.map((placement) => {
      if (!terminalAttackRange(placement)) return ''
      return `${placement.holeId}:${placement.kind}:${placement.upgradeLevel ?? 1}:${placement.id === snapshot.selectedId}`
    }).join('|')
    if (rangeSignature !== this.lastRangeSignature) {
      this.lastRangeSignature = rangeSignature
      ranges.clear()
      snapshot.battle.placements.forEach((placement) => {
        const radius = terminalAttackRange(placement)
        if (!radius) return
        const point = pointFor(snapshot.level, placement)
        const color = DEVICE_COLORS[placement.kind]
        const selected = placement.id === snapshot.selectedId
        ranges.fillStyle(color, selected ? 0.055 : 0.022)
        ranges.fillCircle(point.x, point.y, radius)
        ranges.lineStyle(selected ? 2.2 : 1.2, color, selected ? 0.55 : 0.25)
        ranges.strokeCircle(point.x, point.y, radius)
        ranges.lineStyle(1, color, 0.18)
        ranges.strokeCircle(point.x, point.y, radius * 0.5)
      })
    }

    attacks.clear()
    snapshot.battle.placements.forEach((placement) => {
      const radius = terminalAttackRange(placement)
      if (!radius) return
      const point = pointFor(snapshot.level, placement)
      const color = DEVICE_COLORS[placement.kind]
      if (placement.kind === 'accelerator') {
        const angle = placement.rotationDeg * Math.PI / 180
        const chargeFraction = Math.min(1, (placement.acceleratorChargeJ ?? 0) / 360)
        attacks.lineStyle(2 + chargeFraction * 4, color, network.poweredDeviceIds.has(placement.id) ? 0.42 : 0.22)
        attacks.lineBetween(point.x, point.y, point.x + Math.cos(angle) * radius, point.y + Math.sin(angle) * radius)
        attacks.lineStyle(1, 0xffffff, 0.26 + chargeFraction * 0.32)
        attacks.lineBetween(point.x, point.y, point.x + Math.cos(angle) * radius, point.y + Math.sin(angle) * radius)
      } else if (placement.kind === 'laser-emitter' && !network.poweredDeviceIds.has(placement.id)) {
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
      if (placement.kind === 'accelerator') {
        if ((placement.acceleratorPhase ?? 'idle') !== 'cooldown') return
        const angle = placement.rotationDeg * Math.PI / 180
        const end = { x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius }
        attacks.lineStyle(11, color, 0.24)
        attacks.lineBetween(point.x, point.y, end.x, end.y)
        attacks.lineStyle(2, 0xffffff, 0.95)
        attacks.lineBetween(point.x, point.y, end.x, end.y)
        return
      }
      if (placement.kind === 'frost-tower' || placement.kind === 'brazier') {
        const basePeriod = placement.kind === 'frost-tower' ? 1.25 : 1.1
        const period = basePeriod * [1, 0.86, 0.74][(placement.upgradeLevel ?? 1) - 1]
        const pulseProgress = 1 - Math.min(1, (placement.areaCooldownS ?? 0) / period)
        const pulseRadius = Math.max(20, radius * pulseProgress)
        attacks.lineStyle(4 - pulseProgress * 2, color, 0.72 * (1 - pulseProgress * 0.75))
        attacks.strokeCircle(point.x, point.y, pulseRadius)
        attacks.lineStyle(1, 0xffffff, 0.36 * (1 - pulseProgress))
        attacks.strokeCircle(point.x, point.y, Math.max(14, pulseRadius - 8))
        return
      }
      const target = visualTarget(candidates, placement.targetStrategy)
      if (!target) return
      const targetPath = snapshot.level.paths?.[target.routeIndex ?? 0] ?? snapshot.level.path
      const targetPoint = pointOnPath(targetPath, target.progress)
      if (placement.kind === 'laser-emitter') {
        attacks.lineStyle(4, color, 0.28)
        attacks.lineBetween(point.x, point.y, targetPoint.x, targetPoint.y)
        attacks.lineStyle(1.5, 0xffffff, 0.9)
        attacks.lineBetween(point.x, point.y, targetPoint.x, targetPoint.y)
        attacks.fillStyle(0xffffff, 0.95)
        attacks.fillCircle(targetPoint.x, targetPoint.y, 5)
      } else {
        const burstRadius = placement.kind === 'radiation-source' ? 52 : 36
        attacks.lineStyle(3, color, 0.72)
        attacks.strokeCircle(point.x, point.y, Math.min(radius, burstRadius))
        attacks.lineStyle(1, color, 0.36)
        attacks.strokeCircle(point.x, point.y, Math.min(radius, burstRadius * 1.55))
      }
    })
  }

  private drawDevice(level: LevelConfig, placement: DevicePlacement, selectedId: string | null) {
    const point = pointFor(level, placement)
    const signature = [
      placement.kind, placement.rotationDeg.toFixed(2), Math.round(placement.chargeJ ?? 0),
      Math.round(placement.acceleratorChargeJ ?? 0), placement.acceleratorPhase ?? '', placement.enabled,
      placement.upgradeLevel ?? 1, placement.id === selectedId,
    ].join(':')
    const existing = this.deviceObjects.get(placement.id)
    if (existing?.signature === signature) {
      existing.graphics.setPosition(point.x, point.y)
      existing.label.setPosition(point.x, point.y + (placement.kind === 'mirror' ? 11 : 0))
      return
    }
    existing?.graphics.destroy(true)
    existing?.label.destroy(true)
    const color = DEVICE_COLORS[placement.kind]
    const g = this.add.graphics()
    if (placement.id === selectedId) {
      g.lineStyle(2, 0xffffff, 0.9)
      g.strokeCircle(0, 0, 25)
      g.fillStyle(color, 0.13)
      g.fillCircle(0, 0, 24)
    }
    g.fillStyle(0x071013, 0.96)
    g.fillCircle(0, 0, 19)
    g.lineStyle(2.4, color, 0.95)
    if (placement.kind === 'mirror') {
      const angle = placement.rotationDeg * Math.PI / 180
      g.lineBetween(-Math.cos(angle) * 20, -Math.sin(angle) * 20, Math.cos(angle) * 20, Math.sin(angle) * 20)
      g.lineStyle(5, color, 0.18)
      g.lineBetween(-Math.cos(angle) * 20, -Math.sin(angle) * 20, Math.cos(angle) * 20, Math.sin(angle) * 20)
    } else if (placement.kind === 'prism-splitter') {
      const angle = placement.rotationDeg * Math.PI / 180
      const forward = { x: Math.cos(angle), y: Math.sin(angle) }
      const side = { x: -forward.y, y: forward.x }
      g.fillStyle(0xdaf7ff, 0.1)
      g.fillTriangle(forward.x * 18, forward.y * 18, -forward.x * 10 + side.x * 16, -forward.y * 10 + side.y * 16, -forward.x * 10 - side.x * 16, -forward.y * 10 - side.y * 16)
      g.strokeTriangle(forward.x * 18, forward.y * 18, -forward.x * 10 + side.x * 16, -forward.y * 10 + side.y * 16, -forward.x * 10 - side.x * 16, -forward.y * 10 - side.y * 16)
      ;[0xff4f58, 0x3ee68d, 0x4ea7ff].forEach((beamColor, index) => {
        const beamAngle = angle + (index - 1) * 0.36
        g.lineStyle(2, beamColor, 0.9)
        g.lineBetween(Math.cos(beamAngle) * 5, Math.sin(beamAngle) * 5, Math.cos(beamAngle) * 22, Math.sin(beamAngle) * 22)
      })
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
    } else if (placement.kind === 'capacitor') {
      g.strokeRoundedRect(-14, -12, 28, 24, 4)
      const fraction = Math.min(1, (placement.chargeJ ?? 0) / 450)
      g.fillStyle(color, 0.82)
      g.fillRect(-10, 8 - fraction * 16, 20, fraction * 16)
    } else if (placement.kind === 'bulb') {
      g.strokeCircle(0, 0, 13)
      g.fillStyle(color, 0.4)
      g.fillCircle(0, 0, 8)
      for (let index = 0; index < 8; index += 1) {
        const angle = index * Math.PI / 4
        g.lineBetween(Math.cos(angle) * 15, Math.sin(angle) * 15, Math.cos(angle) * 20, Math.sin(angle) * 20)
      }
    } else if (placement.kind === 'laser-emitter') {
      g.strokeRoundedRect(-15, -8, 25, 16, 3)
      g.lineStyle(4, color, 0.9)
      g.lineBetween(8, 0, 22, 0)
    } else if (placement.kind === 'radiation-source') {
      g.strokeCircle(0, 0, 16)
      for (let index = 0; index < 3; index += 1) {
        const angle = index * Math.PI * 2 / 3
        g.fillStyle(color, 0.55)
        g.fillTriangle(Math.cos(angle) * 4, Math.sin(angle) * 4, Math.cos(angle - 0.35) * 15, Math.sin(angle - 0.35) * 15, Math.cos(angle + 0.35) * 15, Math.sin(angle + 0.35) * 15)
      }
    } else if (placement.kind === 'collector') {
      g.strokeCircle(0, 0, 16)
      g.strokeCircle(0, 0, 9)
      g.lineBetween(-20, -13, -13, -6)
      g.lineBetween(-20, 13, -13, 6)
      g.lineBetween(13, 0, 23, 0)
    } else if (placement.kind === 'frost-tower') {
      for (let index = 0; index < 3; index += 1) {
        const angle = index * Math.PI / 3
        g.lineBetween(-Math.cos(angle) * 16, -Math.sin(angle) * 16, Math.cos(angle) * 16, Math.sin(angle) * 16)
      }
    } else if (placement.kind === 'brazier') {
      g.strokeRoundedRect(-14, 7, 28, 10, 3)
      g.fillStyle(color, 0.55)
      g.fillTriangle(-11, 7, 0, -18, 11, 7)
    } else if (placement.kind === 'accelerator') {
      g.strokeCircle(0, 0, 16)
      g.strokeCircle(0, 0, 9)
      g.lineStyle(3, color, 0.9)
      g.lineBetween(9, 0, 23, 0)
    } else {
      g.strokeCircle(0, 0, 16)
      g.fillStyle(color, 0.32)
      g.fillCircle(0, 0, placement.kind.startsWith('source-') ? 10 : 7)
    }
    const label = this.add.text(0, placement.kind === 'mirror' ? 11 : 0, DEVICE_LABELS[placement.kind], {
      fontFamily: 'Arial, sans-serif', fontSize: placement.kind === 'mirror' ? '8px' : '7px', color: '#f6ffff', fontStyle: 'bold',
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
    const color = enemy.kind === 'boss' ? 0xff4967 : enemy.kind === 'armored' ? 0xa7b3c2 : enemy.kind === 'resistant' ? 0xd98bff : enemy.kind === 'fast' ? 0xffce59 : 0xf4f6f0
    const size = enemy.kind === 'boss' ? 22 : enemy.kind === 'armored' ? 17 : 13
    // 状态变化时才重建敌人图形（位置每帧 setPosition，血量按 5% 分档）。
    const healthBucket = Math.round(enemy.health / enemy.maxHealth * 20)
    const shieldBucket = enemy.status.shield > 0
      ? Math.round(Math.min(1, enemy.status.shield / Math.max(1, enemy.kind === 'boss' ? enemy.maxHealth * 0.15 : enemy.maxHealth * 0.12)) * 10)
      : 0
    const signature = [
      enemy.kind, enemy.resistance ?? '', healthBucket, shieldBucket,
      enemy.status.freezeSeconds > 0 ? 1 : 0,
      enemy.status.burnSeconds > 0 || enemy.status.poisonSeconds > 0 ? 1 : 0,
      Math.ceil(enemy.status.radiationStacks),
      enemy.status.armorBrokenSeconds > 0 ? 1 : 0,
      enemy.status.vulnerableSeconds > 0 ? 1 : 0,
    ].join(':')
    const cached = this.enemyObjects.get(enemy.id)
    const g = cached?.graphics ?? this.add.graphics()
    g.setPosition(point.x, point.y)
    if (cached && cached.signature === signature) return
    g.clear()
    g.fillStyle(0x050708, 0.88)
    g.fillCircle(0, 0, size + 4)
    g.fillStyle(color, 1)
    if (enemy.kind === 'armored') g.fillRoundedRect(-size, -size, size * 2, size * 2, 5)
    else if (enemy.kind === 'fast') g.fillTriangle(-size, -size * 0.75, size, 0, -size, size * 0.75)
    else g.fillCircle(0, 0, size)
    if (enemy.resistance) {
      g.lineStyle(3, enemy.resistance === 'r' ? 0xff4f58 : enemy.resistance === 'g' ? 0x3ee68d : 0x4ea7ff, 1)
      g.strokeCircle(0, 0, size + 2)
    }
    g.fillStyle(0x172226, 1)
    g.fillRoundedRect(-18, size + 7, 36, 4, 2)
    g.fillStyle(enemy.health / enemy.maxHealth < 0.3 ? 0xff5e67 : 0x5df1a6, 1)
    g.fillRoundedRect(-18, size + 7, 36 * (enemy.health / enemy.maxHealth), 4, 2)
    if (enemy.status.freezeSeconds > 0) {
      g.lineStyle(2, 0x69e9ff, 0.9)
      g.strokeCircle(0, 0, size + 6)
    }
    if (enemy.status.burnSeconds > 0 || enemy.status.poisonSeconds > 0) {
      g.fillStyle(enemy.status.burnSeconds > 0 ? 0xff983d : 0x56ed87, 0.9)
      g.fillCircle(size * 0.6, -size * 0.7, 4)
    }
    if (enemy.status.shield > 0) {
      g.lineStyle(2, 0x79b9ff, 0.9)
      g.strokeCircle(0, 0, size + 9)
      const shieldFraction = Math.min(1, enemy.status.shield / Math.max(1, enemy.kind === 'boss' ? enemy.maxHealth * 0.15 : enemy.maxHealth * 0.12))
      g.lineStyle(3, 0xd7f1ff, 0.9)
      g.beginPath()
      g.arc(0, 0, size + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * shieldFraction)
      g.strokePath()
    }
    if (enemy.status.radiationStacks > 0) {
      g.fillStyle(0xe875ff, 0.92)
      for (let index = 0; index < Math.min(3, Math.ceil(enemy.status.radiationStacks)); index += 1) g.fillCircle(-6 + index * 6, -size - 10, 2.2)
    }
    if (enemy.status.armorBrokenSeconds > 0) {
      g.lineStyle(2, 0xffd56a, 0.9)
      g.lineBetween(-size - 4, -size - 4, size + 4, size + 4)
      g.lineBetween(size + 4, -size - 4, -size - 4, size + 4)
    }
    if (enemy.status.vulnerableSeconds > 0) {
      g.lineStyle(2, 0xffffff, 0.92)
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
        const text = this.add.text(event.point.x, event.point.y - 20, `+${event.value}W`, { color: '#7bffc0', fontFamily: 'Arial', fontSize: '14px', fontStyle: 'bold' }).setOrigin(0.5)
        this.tweens.add({ targets: text, y: text.y - 30, alpha: 0, duration: snapshot.reduceMotion ? 200 : 760, onComplete: () => text.destroy() })
      }
      if (event.type === 'explosion') {
        const ring = this.add.circle(event.point.x, event.point.y, 24, 0xffd36a, 0.32).setStrokeStyle(4, 0xffffff, 0.9)
        const scale = event.radius / 24
        this.tweens.add({ targets: ring, scale, alpha: 0, duration: snapshot.reduceMotion ? 260 : 850, ease: 'Cubic.Out', onComplete: () => ring.destroy() })
        this.cameras.main.shake(snapshot.reduceMotion ? 50 : 260, snapshot.reduceMotion ? 0.001 : 0.008)
      }
    })
  }

  private drawSnapshot() {
    const snapshot = this.snapshot
    if (!snapshot) return
    if (this.lastLevelId !== snapshot.level.id) {
      this.drawBoard(snapshot.level)
      this.lastLevelId = snapshot.level.id
      this.lastHoleSignature = '\u0000'
      this.lastRangeSignature = null
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
    snapshot.battle.placements.forEach((placement) => this.drawDevice(snapshot.level, placement, snapshot.selectedId))
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
