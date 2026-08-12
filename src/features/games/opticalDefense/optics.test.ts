import { describe, expect, it } from 'vitest'

import { getOpticalDefenseLevel } from './levels'
import { traceOpticalNetwork } from './optics'
import { visibleColor } from './rules'
import type { DevicePlacement, EnemyState, LevelConfig } from './types'
import { EMPTY_STATUS } from './types'

const level = getOpticalDefenseLevel(1)!

function holeIdAt(targetLevel: LevelConfig, column: number, row: number) {
  const x = targetLevel.grid.originX + column * targetLevel.grid.cellSize + targetLevel.grid.cellSize / 2
  const y = targetLevel.grid.originY + row * targetLevel.grid.cellSize + targetLevel.grid.cellSize / 2
  const index = targetLevel.holes.findIndex((hole) => hole.x === x && hole.y === y)
  if (index < 0) throw new Error(`Expected a buildable cell at ${column},${row}`)
  return `h-${index}`
}

function placement(id: string, kind: DevicePlacement['kind'], holeId: string, rotationDeg = 0): DevicePlacement {
  return { id, kind, holeId, rotationDeg, enabled: true }
}

function enemy(dead = false): EnemyState & { position: { x: number; y: number } } {
  return {
    id: 'blocker', kind: 'normal', health: dead ? 0 : 10, maxHealth: 10, speed: 1, progress: 0,
    rewardCoins: 1, rewardPowerW: 1, status: { ...EMPTY_STATUS }, dead, position: { x: 110, y: 56 },
  }
}

describe('optical network tracing', () => {
  it('continues from a 45 degree mirror into a perpendicular receiver', () => {
    const devices = [
      placement('source', 'source-red', holeIdAt(level, 0, 0)),
      placement('mirror', 'mirror', holeIdAt(level, 2, 0), 45),
      placement('bulb', 'bulb', holeIdAt(level, 2, 1)),
    ]
    const network = traceOpticalNetwork(level, devices)
    expect(network.segments).toHaveLength(2)
    expect(network.poweredDeviceIds.has('mirror')).toBe(true)
    expect(network.poweredDeviceIds.has('bulb')).toBe(true)
  })

  it('blocks a downstream receiver while the front enemy is alive and restores it after death', () => {
    const devices = [placement('source', 'source-red', holeIdAt(level, 0, 0)), placement('bulb', 'bulb', holeIdAt(level, 2, 0))]
    const blocked = traceOpticalNetwork(level, devices, [enemy(false)])
    expect(blocked.blockedHits.has('blocker')).toBe(true)
    expect(blocked.poweredDeviceIds.has('bulb')).toBe(false)
    const restored = traceOpticalNetwork(level, devices, [enemy(true)])
    expect(restored.poweredDeviceIds.has('bulb')).toBe(true)
  })

  it('creates at most three conserved splitter branches', () => {
    const splitter = { ...placement('split', 'splitter', holeIdAt(level, 2, 0)), splitRatios: [0.34, 0.33, 0.33] }
    const network = traceOpticalNetwork(level, [placement('source', 'source-red', holeIdAt(level, 0, 0)), splitter])
    expect(network.segments).toHaveLength(4)
    const output = network.segments.slice(1).reduce((sum, segment) => sum + segment.power.r, 0)
    expect(output).toBeCloseTo(50)
  })

  it('aims three splitter branches at independent targets without fixed angles', () => {
    const devices = [
      placement('source', 'source-red', holeIdAt(level, 0, 0)),
      { ...placement('split', 'splitter', holeIdAt(level, 1, 0)), splitRatios: [0.34, 0.33, 0.33], outputTargetIds: ['a', 'b', 'c'] },
      placement('a', 'bulb', holeIdAt(level, 3, 0)),
      placement('b', 'bulb', holeIdAt(level, 2, 1)),
      placement('c', 'bulb', holeIdAt(level, 4, 1)),
    ]
    const network = traceOpticalNetwork(level, devices)
    expect(['a', 'b', 'c'].every((id) => network.deviceInputs.has(id))).toBe(true)
    const total = ['a', 'b', 'c'].reduce((watts, id) => watts + (network.deviceInputs.get(id)?.r ?? 0), 0)
    expect(total).toBeCloseTo(50)
  })

  it('collects only powered area terminals within range and conserves recovery efficiency', () => {
    const collectorLevel: LevelConfig = {
      ...level,
      holes: [{ x: 50, y: 50 }, { x: 120, y: 50 }, { x: 190, y: 50 }, { x: 120, y: 140 }, { x: 500, y: 300 }],
      path: [{ x: 0, y: 350 }, { x: 700, y: 350 }],
      paths: [[{ x: 0, y: 350 }, { x: 700, y: 350 }]],
    }
    const devices: DevicePlacement[] = [
      placement('source-a', 'source-red', 'h-0'),
      placement('bulb', 'bulb', 'h-1'),
      { ...placement('collector', 'collector', 'h-3'), outputTargetIds: ['receiver'], upgradeLevel: 1 },
      placement('receiver', 'laser-emitter', 'h-2'),
      placement('far-radiation', 'radiation-source', 'h-4'),
    ]
    const network = traceOpticalNetwork(collectorLevel, devices)
    expect(network.deviceInputs.get('collector')?.r).toBeCloseTo(5)
    expect(network.deviceInputs.get('receiver')?.r).toBeCloseTo(5)
    expect(network.deviceInputs.has('far-radiation')).toBe(false)
  })

  it('combines only beams that actually reach the combiner', () => {
    const devices = [
      placement('red', 'source-red', holeIdAt(level, 0, 1)),
      placement('green', 'source-green', holeIdAt(level, 2, 0), 90),
      placement('blue-disconnected', 'source-blue', holeIdAt(level, 6, 0)),
      placement('combiner', 'combiner', holeIdAt(level, 2, 1)),
      placement('bulb', 'bulb', holeIdAt(level, 4, 1)),
    ]
    const network = traceOpticalNetwork(level, devices)
    const combinedOutput = network.segments.find((segment) => segment.targetDeviceId === 'bulb')

    expect(combinedOutput?.power).toEqual({ r: 50, g: 75, b: 0 })
    expect(network.deviceInputs.get('bulb')).toEqual({ r: 50, g: 75, b: 0 })
    expect(visibleColor(combinedOutput!.power)).toBe('yellow')
  })

  it('routes a filter output to an arbitrary snapped receiver without creating watts', () => {
    const devices = [
      placement('source', 'source-red', holeIdAt(level, 0, 0)),
      { ...placement('filter', 'filter', holeIdAt(level, 1, 0)), filterColor: 'r' as const, outputTargetIds: ['bulb'] },
      placement('bulb', 'bulb', holeIdAt(level, 2, 1)),
      placement('disconnected', 'laser-emitter', holeIdAt(level, 5, 1)),
    ]
    const network = traceOpticalNetwork(level, devices)
    expect(network.deviceInputs.get('bulb')).toEqual({ r: 50, g: 0, b: 0 })
    expect(network.deviceInputs.has('disconnected')).toBe(false)
  })

  it('lets an attached threshold and color-aware sensor open or close its linked shutter', () => {
    const sensor = {
      ...placement('sensor', 'filter', holeIdAt(level, 1, 0)), hasSensor: true,
      sensorTargetId: 'shutter', sensorThresholdW: 40, sensorChannel: 'r' as const,
      sensorAction: 'open-when-triggered' as const,
    }
    const shutter = placement('shutter', 'shutter', holeIdAt(level, 2, 0))
    const bulb = placement('bulb', 'bulb', holeIdAt(level, 3, 0))
    const source = placement('source', 'source-red', holeIdAt(level, 0, 0))
    const open = traceOpticalNetwork(level, [source, sensor, shutter, bulb])
    expect(open.sensorTriggeredIds.has('sensor')).toBe(true)
    expect(open.shutterStates.get('shutter')).toBe(true)
    expect(open.poweredDeviceIds.has('bulb')).toBe(true)

    const closed = traceOpticalNetwork(level, [source, { ...sensor, sensorChannel: 'b' }, shutter, bulb])
    expect(closed.sensorTriggeredIds.has('sensor')).toBe(false)
    expect(closed.shutterStates.get('shutter')).toBe(false)
    expect(closed.poweredDeviceIds.has('bulb')).toBe(false)
  })

  it('reports the strongest real incoming direction after a reflected pass-through path', () => {
    const passThroughLevel: LevelConfig = {
      ...level,
      board: { width: 500, height: 400 },
      holes: [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 150, y: 250 }],
      routeCells: [],
      path: [{ x: 0, y: 350 }, { x: 500, y: 350 }],
    }
    const network = traceOpticalNetwork(passThroughLevel, [
      placement('source', 'source-red', 'h-0'),
      placement('first-mirror', 'mirror', 'h-1', 45),
      placement('filter', 'filter', 'h-2'),
      placement('second-mirror', 'mirror', 'h-3', 0),
    ])
    expect(network.deviceIncomingDirections.get('second-mirror')?.x).toBeCloseTo(0, 4)
    expect(network.deviceIncomingDirections.get('second-mirror')?.y).toBeCloseTo(1, 4)
  })
})
