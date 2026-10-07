import Phaser from 'phaser'

import type { OpticalNetwork } from './optics'
import { ACCELERATOR_MAX_CHARGE_J, pointOnPath, terminalAttackRange } from './simulation'
import type { BattleEvent, BattleState } from './simulation'
import type { DeviceKind, DevicePlacement, EnemyState, LevelConfig, Point } from './types'
import { totalPower } from './rules'
import type { OpticalColorMode } from './colorMode'
import type { OpticalSoundCue } from './sound'
import { CORE_SPRITE, DEVICE_SPRITES, ENEMY_SPRITES, PIXEL_INK, SPECTRUM, pixelRuns, sourceAccent, spectrumColor } from './pixelArt'

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
  onSound?: (cue: OpticalSoundCue) => void
  onEvent?: (event: BattleEvent) => void
}

const LAB_WIDTH = 1200
const LAB_HEIGHT = 700
const WHITE = 0xf5f5f5
const GREY = 0x888888
const LABELS: Record<DeviceKind, string> = {
  'source-red': 'R', 'source-green': 'G', 'source-blue': 'B', mirror: 'M', splitter: 'SPL',
  'prism-splitter': 'PR', combiner: 'MIX', filter: 'FLT', collector: 'COL', bulb: 'L',
  'laser-emitter': 'LAS', 'radiation-source': 'RAD', 'frost-tower': 'ICE', brazier: 'FIR',
  accelerator: 'ACC', shutter: 'SH', 'photo-sensor': 'SEN', capacitor: 'CAP',
}

const q = (value: number, unit = 2) => Math.round(value / unit) * unit
const numericColor = (hex: string) => Number.parseInt(hex.slice(1), 16)
const pointFor = (level: LevelConfig, placement: DevicePlacement) => level.holes[Number(placement.holeId.slice(2))] ?? { x: 0, y: 0 }

function emissionColor(placement: DevicePlacement, network: OpticalNetwork): number {
  if (placement.kind.startsWith('source-')) return numericColor(sourceAccent(placement.kind))
  if (placement.kind === 'frost-tower') return SPECTRUM.cyan
  if (placement.kind === 'brazier') return SPECTRUM.orange
  const input = network.deviceInputs.get(placement.id)
  return input && totalPower(input) > 0.01 ? spectrumColor(input) : GREY
}

function drawSprite(g: Phaser.GameObjects.Graphics, rows: readonly string[], unit: number, accent: number, x = 0, y = 0) {
  // Row runs avoid one graphics command per pixel, even on dense custom maps.
  const inks = new Map<string, number>(Object.entries(PIXEL_INK).map(([key, value]) => [key, numericColor(value)]))
  inks.set('c', accent)
  const runs = pixelRuns(rows)
  for (const [ink, color] of inks) {
    g.fillStyle(color, 1)
    for (const run of runs) {
      if (run.ink === ink) g.fillRect(x + (run.x - 8) * unit, y + (run.y - 8) * unit, run.width * unit, unit)
    }
  }
}

function brackets(g: Phaser.GameObjects.Graphics, x: number, y: number, half: number, color: number, alpha = 1, length = 8) {
  g.fillStyle(color, alpha)
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const px = q(x + sx * half)
    const py = q(y + sy * half)
    g.fillRect(px - (sx > 0 ? length - 2 : 0), py, length, 2)
    g.fillRect(px, py - (sy > 0 ? length - 2 : 0), 2, length)
  }
}

/** Rectangular samples keep curves and diagonal glass visibly on the pixel grid. */
function pixelRing(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, color: number, alpha = 1, fraction = 1, unit = 3) {
  const samples = Math.min(160, Math.max(24, Math.ceil(radius * 1.2)))
  g.fillStyle(color, alpha)
  for (let i = 0; i < samples * fraction; i++) {
    const angle = i / samples * Math.PI * 2 - Math.PI / 2
    g.fillRect(q(x + Math.cos(angle) * radius, unit), q(y + Math.sin(angle) * radius, unit), unit, unit)
  }
}

function pixelLine(g: Phaser.GameObjects.Graphics, start: Point, end: Point, color: number, width = 2, alpha = 1) {
  g.fillStyle(color, alpha)
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (Math.abs(dy) < 0.5) {
    g.fillRect(q(Math.min(start.x, end.x)), q(start.y - width / 2), Math.max(width, q(Math.abs(dx))), width)
  } else if (Math.abs(dx) < 0.5) {
    g.fillRect(q(start.x - width / 2), q(Math.min(start.y, end.y)), width, Math.max(width, q(Math.abs(dy))))
  } else {
    // Phaser's non-antialiased raster produces a crisp stepped diagonal.
    g.lineStyle(width, color, alpha)
    g.lineBetween(q(start.x), q(start.y), q(end.x), q(end.y))
  }
}

function visualTarget(enemies: EnemyState[], strategy: DevicePlacement['targetStrategy']) {
  if (!enemies.length) return undefined
  if (strategy === 'last') return enemies.reduce((best, enemy) => enemy.progress < best.progress ? enemy : best)
  if (strategy === 'highest-health') return enemies.reduce((best, enemy) => enemy.health > best.health ? enemy : best)
  if (strategy === 'lowest-health') return enemies.reduce((best, enemy) => enemy.health < best.health ? enemy : best)
  if (strategy === 'boss-first') return enemies.find((enemy) => enemy.kind === 'boss') ?? enemies[0]
  if (strategy === 'status-first') return enemies.find((enemy) => Object.values(enemy.status).some((value) => value > 0)) ?? enemies[0]
  return enemies[0]
}

type DeviceDrawing = { graphics: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; signature: string }
type EnemyDrawing = { graphics: Phaser.GameObjects.Graphics; signature: string; health: number; shield: number }

export class OpticalDefenseScene extends Phaser.Scene {
  private callbacks: OpticalSceneCallbacks
  private snapshot: SceneSnapshot | null = null
  private board!: Phaser.GameObjects.Graphics
  private holes!: Phaser.GameObjects.Graphics
  private ranges!: Phaser.GameObjects.Graphics
  private beams!: Phaser.GameObjects.Graphics
  private attacks!: Phaser.GameObjects.Graphics
  private entities!: Phaser.GameObjects.Container
  private core!: Phaser.GameObjects.Graphics
  private deviceObjects = new Map<string, DeviceDrawing>()
  private enemyObjects = new Map<string, EnemyDrawing>()
  private transientObjects = new Set<Phaser.GameObjects.GameObject>()
  private lastBoard = ''
  private lastHoles = '\u0000'
  private lastRange = '\u0000'
  private lastCoreHealth = -1
  private handledEventId = 0
  private lastElapsed = 0
  private lastEntityId = 0

  constructor(callbacks: OpticalSceneCallbacks) {
    super({ key: 'optical-defense' })
    this.callbacks = callbacks
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0b0b')
    this.board = this.add.graphics()
    this.holes = this.add.graphics()
    this.ranges = this.add.graphics()
    this.beams = this.add.graphics()
    this.attacks = this.add.graphics()
    this.entities = this.add.container()
    this.core = this.add.graphics().setDepth(2)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const bounds = this.game.canvas.getBoundingClientRect()
      const nativeEvent = pointer.event as PointerEvent & { changedTouches?: TouchList }
      const source = nativeEvent.changedTouches?.[0] ?? nativeEvent
      const clientX = 'clientX' in source ? Number(source.clientX) : bounds.left + pointer.x
      const clientY = 'clientY' in source ? Number(source.clientY) : bounds.top + pointer.y
      this.handlePointer((clientX - bounds.left) * LAB_WIDTH / bounds.width, (clientY - bounds.top) * LAB_HEIGHT / bounds.height)
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
    const selected = snapshot.battle.placements.find((placement) => {
      const point = pointFor(snapshot.level, placement)
      return Math.hypot(point.x - x, point.y - y) <= 25
    })
    if (selected) { this.callbacks.onDevice(selected.id); return }
    const closest = snapshot.level.holes.map((point, index) => ({ index, distance: Math.hypot(point.x - x, point.y - y) }))
      .filter(({ distance }) => distance <= Math.min(36, snapshot.level.grid.cellSize * 0.42))
      .sort((a, b) => a.distance - b.distance)[0]
    if (closest) this.callbacks.onHole(`h-${closest.index}`)
  }

  private drawBoard(level: LevelConfig) {
    const g = this.board.clear()
    const { cellSize, columns, rows, originX, originY } = level.grid
    g.fillStyle(0x0b0b0b)
    g.fillRect(0, 0, LAB_WIDTH, LAB_HEIGHT)
    g.fillStyle(0x141414)
    g.fillRect(originX, originY, columns * cellSize, rows * cellSize)
    g.fillStyle(0x333333)
    for (let col = 0; col <= columns; col++) for (let row = 0; row <= rows; row++) {
      g.fillRect(q(originX + col * cellSize), q(originY + row * cellSize), 2, 2)
    }
    g.fillStyle(0x292929)
    level.routeCells.forEach((point) => g.fillRect(point.x - cellSize / 2, point.y - cellSize / 2, cellSize, cellSize))
    const paths = level.paths ?? [level.path]
    paths.forEach((route) => {
      for (let i = 1; i < route.length; i++) {
        const start = route[i - 1]
        const end = route[i]
        pixelLine(g, start, end, 0x292929, cellSize)
        const distance = Math.hypot(end.x - start.x, end.y - start.y)
        const dx = (end.x - start.x) / (distance || 1)
        const dy = (end.y - start.y) / (distance || 1)
        g.fillStyle(0x5b5b5b)
        for (let d = cellSize * 0.5; d < distance; d += cellSize) {
          const x = q(start.x + dx * d)
          const y = q(start.y + dy * d)
          for (let k = 0; k < 3; k++) {
            g.fillRect(q(x + dx * k * 3 - dy * (k - 1) * 3), q(y + dy * k * 3 + dx * (k - 1) * 3), 3, 3)
            g.fillRect(q(x + dx * k * 3 + dy * (k - 1) * 3), q(y + dy * k * 3 - dx * (k - 1) * 3), 3, 3)
          }
        }
      }
      const edge = route[0]
      const next = route[1] ?? edge
      const dx = Math.sign(next.x - edge.x)
      const dy = Math.sign(next.y - edge.y)
      for (let i = 0; i < 3; i++) {
        const x = edge.x + dx * (12 + i * 9)
        const y = edge.y + dy * (12 + i * 9)
        pixelLine(g, { x: x - dy * 8 - dx * 4, y: y + dx * 8 - dy * 4 }, { x, y }, WHITE, 3)
        pixelLine(g, { x: x + dy * 8 - dx * 4, y: y - dx * 8 - dy * 4 }, { x, y }, WHITE, 3)
      }
    })
    g.fillStyle(0x555555)
    g.fillRect(0, 0, LAB_WIDTH, 2)
    g.fillRect(0, LAB_HEIGHT - 2, LAB_WIDTH, 2)
  }

  private drawHoles(snapshot: SceneSnapshot) {
    const g = this.holes.clear()
    const occupied = new Set(snapshot.battle.placements.filter((p) => !p.destroyed).map((p) => p.holeId))
    const recommended = new Set(snapshot.recommendedHoleIds)
    const half = Math.min(25, snapshot.level.grid.cellSize * 0.3)
    snapshot.level.holes.forEach((point, index) => {
      const used = occupied.has(`h-${index}`)
      brackets(g, point.x, point.y, half, used ? 0x777777 : 0x3b3b3b, 1, used ? 5 : 4)
      if (!used) {
        g.fillStyle(0x424242)
        g.fillRect(q(point.x) - 2, q(point.y) - 2, 4, 4)
      }
      if (!used && recommended.has(`h-${index}`)) {
        brackets(g, point.x, point.y, half + 4, WHITE, 0.85, 9)
        g.fillStyle(0x999999)
        g.fillRect(q(point.x) - 6, q(point.y) - 1, 12, 2)
        g.fillRect(q(point.x) - 1, q(point.y) - 6, 2, 12)
      }
    })
  }

  private drawBeams(snapshot: SceneSnapshot) {
    const g = this.beams.clear()
    const phase = snapshot.reduceMotion ? 0.5 : (snapshot.battle.elapsedSeconds * 1.2) % 1
    snapshot.network.segments.forEach((segment) => {
      const color = spectrumColor(segment.power)
      const width = Math.max(2, Math.min(6, Math.ceil(totalPower(segment.power) / 36) * 2))
      if (snapshot.beamGlow) {
        pixelLine(g, segment.start, segment.end, color, width + 12, 0.07)
        pixelLine(g, segment.start, segment.end, color, width + 6, 0.17)
      }
      pixelLine(g, segment.start, segment.end, color, width, 1)
      const distance = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y)
      const count = Math.max(1, Math.floor(distance / 94))
      g.fillStyle(color === SPECTRUM.blue ? 0xc6d2ff : WHITE, 0.85)
      for (let i = 0; i < count; i++) {
        const t = (i + phase) / count
        g.fillRect(q(segment.start.x + (segment.end.x - segment.start.x) * t) - 1, q(segment.start.y + (segment.end.y - segment.start.y) * t) - 1, 3, 3)
      }
      // A small squared bloom marks an optical interaction without washing out the beam.
      if (snapshot.beamGlow) {
        g.fillStyle(color, 0.16)
        g.fillRect(q(segment.end.x) - 7, q(segment.end.y) - 7, 14, 14)
      }
    })
  }

  private drawRange(snapshot: SceneSnapshot) {
    const placement = snapshot.battle.placements.find((p) => p.id === snapshot.selectedId && terminalAttackRange(p) > 0)
    const signature = placement ? [placement.id, placement.upgradeLevel, placement.rotationDeg, emissionColor(placement, snapshot.network)].join(':') : ''
    if (signature === this.lastRange) return
    this.lastRange = signature
    const g = this.ranges.clear()
    if (!placement) return
    const radius = terminalAttackRange(placement)
    const point = pointFor(snapshot.level, placement)
    const color = emissionColor(placement, snapshot.network)
    if (placement.kind === 'accelerator') {
      const angle = placement.rotationDeg * Math.PI / 180
      for (const offset of [-5, 5]) pixelLine(g, { x: point.x - Math.sin(angle) * offset, y: point.y + Math.cos(angle) * offset },
        { x: point.x + Math.cos(angle) * radius - Math.sin(angle) * offset, y: point.y + Math.sin(angle) * radius + Math.cos(angle) * offset }, color, 1, 0.25)
    } else {
      g.fillStyle(color, 0.025)
      for (let y = -radius; y <= radius; y += 8) {
        const width = q(Math.sqrt(Math.max(0, radius * radius - y * y)), 8)
        g.fillRect(q(point.x) - width, q(point.y + y), width * 2, 8)
      }
      pixelRing(g, point.x, point.y, radius, color, 0.48, 1, 3)
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        g.fillStyle(WHITE, 0.6)
        g.fillRect(q(point.x + dx * radius) - 3, q(point.y + dy * radius) - 3, 6, 6)
      }
    }
  }

  private drawAttacks(snapshot: SceneSnapshot) {
    const g = this.attacks.clear()
    const { battle, network, level } = snapshot
    const moving = !snapshot.reduceMotion
    const time = moving ? battle.elapsedSeconds : 0
    const alive = battle.enemies.filter((e) => !e.dead && !e.escaped).sort((a, b) => b.progress - a.progress)
    const sounding = battle.phase === 'running'
    battle.placements.forEach((placement) => {
      const radius = terminalAttackRange(placement)
      if (!radius) return
      const point = pointFor(level, placement)
      const color = emissionColor(placement, network)
      if (placement.kind === 'accelerator') {
        if (placement.acceleratorPhase !== 'cooldown') return
        const maxCooldown = Math.max(1.4, 2.4 - ((placement.upgradeLevel ?? 1) - 1) * 0.35)
        const elapsed = maxCooldown - (placement.acceleratorCooldownS ?? maxCooldown)
        if (elapsed < 0 || elapsed > 0.62) return
        const progress = moving ? elapsed / 0.62 : 0.4
        const angle = placement.rotationDeg * Math.PI / 180
        if (sounding && elapsed < 0.12) this.callbacks.onSound?.('focus')
        for (let i = 0; i < 22; i++) {
          const distance = radius * Math.min(1, progress + (i % 6) * 0.015)
          const side = ((i * 7) % 13 - 6) * (0.5 + progress)
          const x = q(point.x + Math.cos(angle) * distance - Math.sin(angle) * side)
          const y = q(point.y + Math.sin(angle) * distance + Math.cos(angle) * side)
          g.fillStyle(color, 0.25)
          g.fillRect(x - 4, y - 4, 10, 10)
          g.fillStyle(i % 3 ? color : WHITE, 0.95)
          g.fillRect(x, y, 3, 3)
        }
        return
      }
      const candidates = alive.filter((enemy) => {
        const p = pointOnPath(level.paths?.[enemy.routeIndex ?? 0] ?? level.path, enemy.progress)
        return Math.hypot(p.x - point.x, p.y - point.y) <= radius
      })
      if (!network.poweredDeviceIds.has(placement.id) || !candidates.length) return
      const target = visualTarget(candidates, placement.targetStrategy)
      if (!target) return
      const targetPoint = pointOnPath(level.paths?.[target.routeIndex ?? 0] ?? level.path, target.progress)
      if (placement.kind === 'laser-emitter') {
        if (sounding) this.callbacks.onSound?.('laser')
        if (snapshot.beamGlow) pixelLine(g, point, targetPoint, color, 12, 0.18)
        pixelLine(g, point, targetPoint, color, 4)
        brackets(g, targetPoint.x, targetPoint.y, 11, color, 0.8, 5)
        g.fillStyle(WHITE)
        g.fillRect(q(targetPoint.x) - 2, q(targetPoint.y) - 2, 4, 4)
      } else if (placement.kind === 'frost-tower' || placement.kind === 'brazier') {
        const period = (placement.kind === 'frost-tower' ? 1.25 : 1.1) * [1, 0.86, 0.74][(placement.upgradeLevel ?? 1) - 1]
        const progress = moving ? 1 - Math.min(1, (placement.areaCooldownS ?? 0) / period) : 0.35
        const wave = Math.max(20, radius * progress)
        pixelRing(g, point.x, point.y, wave, color, 0.65 * (1 - progress), 1, 4)
        if (sounding && progress < 0.2) this.callbacks.onSound?.(placement.kind === 'frost-tower' ? 'freeze' : 'ignite')
        for (let i = 0; i < 8; i++) {
          const angle = i * Math.PI / 4
          const x = q(point.x + Math.cos(angle) * wave)
          const y = q(point.y + Math.sin(angle) * wave)
          g.fillStyle(color, 0.7 * (1 - progress))
          g.fillRect(x - 2, y - 2, 5, 5)
          if (placement.kind === 'frost-tower') {
            pixelLine(g, { x: x - 5, y }, { x: x + 5, y }, WHITE, 2, 0.6 * (1 - progress))
            pixelLine(g, { x, y: y - 5 }, { x, y: y + 5 }, WHITE, 2, 0.6 * (1 - progress))
          } else g.fillRect(x, y - 9, 3, 8)
        }
      } else if (placement.kind === 'bulb' || placement.kind === 'radiation-source') {
        const wave = 26 + (time * (placement.kind === 'bulb' ? 24 : 45) % 34)
        pixelRing(g, point.x, point.y, wave, color, 0.6 * (1 - (wave - 26) / 60), 1, 3)
        if (placement.kind === 'radiation-source' && sounding) this.callbacks.onSound?.('radiate')
        for (let i = 0; i < 8; i++) {
          const angle = i * Math.PI / 4
          g.fillStyle(color, 0.65)
          g.fillRect(q(point.x + Math.cos(angle) * 25), q(point.y + Math.sin(angle) * 25), 3, 3)
        }
      }
    })
  }

  private drawDevice(snapshot: SceneSnapshot, placement: DevicePlacement) {
    if (placement.destroyed) return
    const point = pointFor(snapshot.level, placement)
    const color = emissionColor(placement, snapshot.network)
    const powered = snapshot.network.poweredDeviceIds.has(placement.id) || placement.kind.startsWith('source-')
    const triggered = snapshot.network.sensorTriggeredIds.has(placement.id)
    const open = snapshot.network.shutterStates.get(placement.id) ?? placement.enabled !== false
    const unit = snapshot.level.grid.cellSize >= 65 ? 3 : snapshot.level.grid.cellSize > 38 ? 2 : 1
    const signature = [placement.kind, placement.rotationDeg, Math.floor((placement.chargeJ ?? 0) / 10),
      Math.floor((placement.acceleratorChargeJ ?? 0) / 10), placement.acceleratorPhase, placement.upgradeLevel,
      placement.id === snapshot.selectedId, color, powered, triggered, open, placement.hasSensor, snapshot.beamGlow].join(':')
    const cached = this.deviceObjects.get(placement.id)
    if (cached?.signature === signature) return
    const g = cached?.graphics ?? this.add.graphics()
    g.clear().setPosition(q(point.x), q(point.y))
    if (placement.id === snapshot.selectedId) brackets(g, 0, 0, unit * 8 + 5, WHITE, 1, 10)
    if (powered && snapshot.beamGlow) {
      g.fillStyle(color, 0.11)
      g.fillRect(-unit * 5, -unit * 5, unit * 10, unit * 10)
    }
    if (placement.kind === 'mirror') {
      const angle = placement.rotationDeg * Math.PI / 180
      g.fillStyle(0x444444)
      g.fillRect(-unit * 6, unit * 4, unit * 12, unit * 3)
      const size = unit * 7
      for (let d = -size; d <= size; d += 2) {
        const x = q(Math.cos(angle) * d)
        const y = q(Math.sin(angle) * d)
        g.fillStyle(0x888888)
        g.fillRect(x + q(-Math.sin(angle) * 3), y + q(Math.cos(angle) * 3), 3, 3)
        g.fillStyle(WHITE)
        g.fillRect(x, y, 3, 3)
      }
    } else {
      const accent = placement.kind === 'filter'
        ? SPECTRUM[placement.filterColor === 'g' ? 'green' : placement.filterColor === 'b' ? 'blue' : 'red']
        : placement.kind === 'collector'
          ? SPECTRUM[placement.collectorColor === 'g' ? 'green' : placement.collectorColor === 'b' ? 'blue' : 'red']
          : placement.kind === 'shutter' ? open ? WHITE : 0x444444 : powered ? color : 0x666666
      drawSprite(g, DEVICE_SPRITES[placement.kind], unit, accent)
    }
    const angle = placement.rotationDeg * Math.PI / 180
    if (!['bulb', 'radiation-source', 'frost-tower', 'brazier', 'capacitor', 'photo-sensor'].includes(placement.kind)) {
      g.fillStyle(powered ? color : WHITE, 0.9)
      g.fillRect(q(Math.cos(angle) * (unit * 8 + 2)) - 2, q(Math.sin(angle) * (unit * 8 + 2)) - 2, 4, 4)
    }
    const rank = placement.upgradeLevel ?? 1
    g.fillStyle(0xaaaaaa)
    for (let i = 0; i < rank; i++) g.fillRect(-rank * 3 + i * 6, unit * 8 + 3, 4, 2)
    if (placement.kind === 'capacitor' || placement.kind === 'accelerator') {
      const maximum = placement.kind === 'capacitor' ? 450 : ACCELERATOR_MAX_CHARGE_J * (1 + (rank - 1) * 0.2)
      const amount = placement.kind === 'capacitor' ? placement.chargeJ ?? 0 : placement.acceleratorChargeJ ?? 0
      g.fillStyle(0x333333)
      g.fillRect(-unit * 7, -unit * 8 - 5, unit * 14, 3)
      g.fillStyle(placement.acceleratorPhase === 'ready' ? WHITE : color)
      g.fillRect(-unit * 7, -unit * 8 - 5, q(Math.min(1, amount / maximum) * unit * 14), 3)
    }
    if (placement.hasSensor || placement.kind === 'photo-sensor') {
      g.fillStyle(0x080808)
      g.fillRect(unit * 5, -unit * 8, 9, 9)
      g.fillStyle(triggered ? SPECTRUM.green : GREY)
      g.fillRect(unit * 5 + 2, -unit * 8 + 2, 5, 5)
    }
    const label = cached?.label ?? this.add.text(q(point.x), q(point.y) + unit * 8 + 10, LABELS[placement.kind], {
      fontFamily: 'Consolas, monospace', fontSize: unit === 1 ? '7px' : '9px', color: '#999999', resolution: 2,
    }).setOrigin(0.5)
    if (!cached) { this.entities.add([g, label]); this.deviceObjects.set(placement.id, { graphics: g, label, signature }) }
    else cached.signature = signature
  }

  private drawEnemy(snapshot: SceneSnapshot, enemy: EnemyState) {
    if (enemy.dead || enemy.escaped) return
    const point = pointOnPath(snapshot.level.paths?.[enemy.routeIndex ?? 0] ?? snapshot.level.path, enemy.progress)
    const cached = this.enemyObjects.get(enemy.id)
    const g = cached?.graphics ?? this.add.graphics()
    g.setPosition(q(point.x), q(point.y))
    const unit = enemy.kind === 'boss' ? 3 : 2
    const half = unit * 8
    const shieldFraction = Math.min(1, enemy.status.shield / Math.max(1, enemy.kind === 'boss' ? enemy.maxHealth * 0.15 : enemy.maxHealth * 0.12))
    const signature = [enemy.kind, enemy.resistance, Math.ceil(enemy.health / enemy.maxHealth * 20), Math.ceil(shieldFraction * 12),
      enemy.status.freezeSeconds > 0, enemy.status.burnSeconds > 0, enemy.status.poisonSeconds > 0,
      Math.ceil(enemy.status.radiationStacks), enemy.status.armorBrokenSeconds > 0, enemy.status.vulnerableSeconds > 0].join(':')
    if (cached && cached.health > enemy.health && snapshot.battle.phase === 'running') this.callbacks.onSound?.('hit')
    if (cached && cached.shield > 0 && enemy.status.shield <= 0) {
      this.fragments(point, SPECTRUM.cyan, snapshot.reduceMotion ? 100 : 260, 8)
      this.callbacks.onSound?.('shield')
    }
    if (cached) { cached.health = enemy.health; cached.shield = enemy.status.shield }
    if (cached?.signature === signature) return
    g.clear()
    g.fillStyle(0x080808, 0.65)
    g.fillRect(-half + 3, half - 3, half * 2 - 6, 5)
    const resistColor = enemy.resistance === 'r' ? SPECTRUM.red : enemy.resistance === 'g' ? SPECTRUM.green : enemy.resistance === 'b' ? SPECTRUM.blue : WHITE
    drawSprite(g, ENEMY_SPRITES[enemy.kind], unit, resistColor)
    if (enemy.resistance) brackets(g, 0, 0, half + 2, resistColor, 1, 6)
    if (enemy.status.shield > 0) {
      pixelRing(g, 0, 0, half + 8, SPECTRUM.cyan, 0.22, 1, 3)
      pixelRing(g, 0, 0, half + 8, SPECTRUM.cyan, 0.9, shieldFraction, 3)
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        g.fillStyle(SPECTRUM.cyan, 0.12)
        g.fillRect(sx * (half - 3) - 4, sy * (half - 3) - 4, 8, 8)
      }
    }
    if (enemy.status.freezeSeconds > 0) {
      brackets(g, 0, 0, half + 4, SPECTRUM.cyan, 0.9, 10)
      g.fillStyle(SPECTRUM.blue, 0.2)
      g.fillRect(-half + 4, -half + 4, half * 2 - 8, half * 2 - 8)
    }
    if (enemy.status.burnSeconds > 0) {
      g.fillStyle(SPECTRUM.orange)
      for (let i = 0; i < 3; i++) {
        const x = -8 + i * 8
        g.fillRect(x, -half - 4, 4, 6)
        g.fillRect(x + 2, -half - 8 - (i % 2) * 3, 2, 5)
      }
    }
    if (enemy.status.poisonSeconds > 0) {
      g.fillStyle(SPECTRUM.green)
      g.fillRect(half - 2, -half + 2, 5, 5)
      g.fillRect(half + 3, -half - 3, 3, 3)
    }
    if (enemy.status.radiationStacks > 0) {
      g.fillStyle(SPECTRUM.magenta)
      for (let i = 0; i < Math.min(5, Math.ceil(enemy.status.radiationStacks)); i++) g.fillRect(-half - 5, -half + i * 6, 3, 4)
    }
    if (enemy.status.armorBrokenSeconds > 0) {
      pixelLine(g, { x: -half, y: -half }, { x: half, y: half }, SPECTRUM.yellow, 2)
      pixelLine(g, { x: -half, y: half }, { x: half, y: -half }, SPECTRUM.yellow, 2)
    }
    if (enemy.status.vulnerableSeconds > 0) brackets(g, 0, 0, half + 9, WHITE, 0.95, 5)
    g.fillStyle(0x080808)
    g.fillRect(-half, half + 9, half * 2, 4)
    g.fillStyle(enemy.health / enemy.maxHealth < 0.3 ? SPECTRUM.red : WHITE)
    g.fillRect(-half, half + 9, q(Math.max(0, enemy.health / enemy.maxHealth) * half * 2), 3)
    if (!cached) {
      this.entities.add(g)
      this.enemyObjects.set(enemy.id, { graphics: g, signature, health: enemy.health, shield: enemy.status.shield })
    } else cached.signature = signature
  }

  private fragments(point: Point, color: number, duration: number, count = 6) {
    if (this.transientObjects.size > 80) return
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2
      const shard = this.add.rectangle(q(point.x + Math.cos(angle) * 6), q(point.y + Math.sin(angle) * 6), i % 2 ? 3 : 5, 3, i % 3 ? color : WHITE).setDepth(3)
      this.transientObjects.add(shard)
      this.tweens.add({ targets: shard, x: q(point.x + Math.cos(angle) * 26), y: q(point.y + Math.sin(angle) * 26), alpha: 0,
        duration, ease: 'Cubic.Out', onComplete: () => { this.transientObjects.delete(shard); shard.destroy() } })
    }
  }

  private playEvents(snapshot: SceneSnapshot) {
    snapshot.battle.events.filter((event) => event.id > this.handledEventId).forEach((event) => {
      this.handledEventId = Math.max(this.handledEventId, event.id)
      this.callbacks.onEvent?.(event)
      if (event.type === 'kill') {
        this.fragments(event.point, WHITE, snapshot.reduceMotion ? 90 : 240)
        const label = this.add.text(q(event.point.x), q(event.point.y) - 24, `+${event.value}W`, {
          color: '#ffffff', fontFamily: 'Consolas, monospace', fontSize: '12px', resolution: 2,
        }).setOrigin(0.5).setDepth(4)
        this.transientObjects.add(label)
        this.tweens.add({ targets: label, y: label.y - (snapshot.reduceMotion ? 0 : 20), alpha: 0, duration: snapshot.reduceMotion ? 140 : 520,
          onComplete: () => { this.transientObjects.delete(label); label.destroy() } })
      } else if (event.type === 'escape') {
        this.fragments(event.point, SPECTRUM.red, snapshot.reduceMotion ? 90 : 250)
      } else {
        this.fragments(event.point, SPECTRUM.white, snapshot.reduceMotion ? 100 : 360, 12)
        const burst = this.add.graphics().setPosition(q(event.point.x), q(event.point.y)).setDepth(3)
        pixelRing(burst, 0, 0, 24, WHITE, 1, 1, 4)
        pixelRing(burst, 0, 0, 20, SPECTRUM.cyan, 0.8, 1, 3)
        pixelRing(burst, 0, 0, 16, SPECTRUM.magenta, 0.65, 1, 3)
        this.transientObjects.add(burst)
        this.tweens.add({ targets: burst, scale: event.radius / 24, alpha: 0,
          duration: snapshot.reduceMotion ? 120 : 420, ease: 'Cubic.Out',
          onComplete: () => { this.transientObjects.delete(burst); burst.destroy() } })
      }
    })
  }

  private drawCore(snapshot: SceneSnapshot) {
    if (this.lastCoreHealth === snapshot.battle.coreHealth) return
    this.lastCoreHealth = snapshot.battle.coreHealth
    const g = this.core.clear()
    const paths = snapshot.level.paths ?? [snapshot.level.path]
    const seen = new Set<string>()
    paths.forEach((path) => {
      const point = path.at(-2) ?? path.at(-1)
      if (!point || seen.has(`${point.x},${point.y}`)) return
      seen.add(`${point.x},${point.y}`)
      const unit = snapshot.level.grid.cellSize >= 65 ? 3 : 2
      const health = Math.max(0, snapshot.battle.coreHealth / snapshot.level.coreHealth)
      drawSprite(g, CORE_SPRITE, unit, health > 0.3 ? WHITE : SPECTRUM.red, q(point.x), q(point.y))
      g.fillStyle(0x080808)
      g.fillRect(point.x - 22, point.y + unit * 8 + 5, 44, 4)
      g.fillStyle(health > 0.3 ? WHITE : SPECTRUM.red)
      g.fillRect(point.x - 22, point.y + unit * 8 + 5, q(44 * health), 3)
    })
  }

  private resetVisuals() {
    this.deviceObjects.forEach(({ graphics, label }) => { graphics.destroy(); label.destroy() })
    this.enemyObjects.forEach(({ graphics }) => graphics.destroy())
    this.transientObjects.forEach((object) => { this.tweens.killTweensOf(object); object.destroy() })
    this.deviceObjects.clear()
    this.enemyObjects.clear()
    this.transientObjects.clear()
    this.lastHoles = '\u0000'
    this.lastRange = '\u0000'
    this.lastCoreHealth = -1
    this.handledEventId = 0
  }

  private drawSnapshot() {
    const snapshot = this.snapshot
    if (!snapshot) return
    const boardKey = `${snapshot.level.id}:${JSON.stringify(snapshot.level.grid)}:${JSON.stringify(snapshot.level.paths ?? snapshot.level.path)}`
    const restarted = snapshot.battle.elapsedSeconds + 1e-6 < this.lastElapsed || snapshot.battle.nextEntityId < this.lastEntityId
    if (boardKey !== this.lastBoard || restarted) {
      this.resetVisuals()
      if (boardKey !== this.lastBoard) this.drawBoard(snapshot.level)
      this.lastBoard = boardKey
    }
    this.lastElapsed = snapshot.battle.elapsedSeconds
    this.lastEntityId = snapshot.battle.nextEntityId
    const holeKey = [...snapshot.battle.placements.filter((p) => !p.destroyed).map((p) => p.holeId), ...(snapshot.recommendedHoleIds ?? []).map((id) => `tip:${id}`)].sort().join('|')
    if (holeKey !== this.lastHoles) { this.drawHoles(snapshot); this.lastHoles = holeKey }
    this.drawRange(snapshot)
    this.drawBeams(snapshot)
    this.drawAttacks(snapshot)
    snapshot.battle.placements.forEach((placement) => this.drawDevice(snapshot, placement))
    snapshot.battle.enemies.forEach((enemy) => this.drawEnemy(snapshot, enemy))
    const deviceIds = new Set(snapshot.battle.placements.filter((p) => !p.destroyed).map((p) => p.id))
    this.deviceObjects.forEach(({ graphics, label }, id) => {
      if (!deviceIds.has(id)) { graphics.destroy(); label.destroy(); this.deviceObjects.delete(id) }
    })
    const enemyIds = new Set(snapshot.battle.enemies.filter((e) => !e.dead && !e.escaped).map((e) => e.id))
    this.enemyObjects.forEach(({ graphics }, id) => {
      if (!enemyIds.has(id)) { graphics.destroy(); this.enemyObjects.delete(id) }
    })
    this.drawCore(snapshot)
    this.playEvents(snapshot)
  }
}

export { LAB_HEIGHT, LAB_WIDTH, Phaser }
