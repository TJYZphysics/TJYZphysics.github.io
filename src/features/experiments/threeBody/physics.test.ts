import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ThreeBodyLab } from './ThreeBodyLab'
import {
  centerOfMass,
  createPreset,
  isFiniteSystem,
  stepSystem,
  totalMomentum,
  type Body,
} from './physics'

function body(overrides: Partial<Body> = {}): Body {
  return {
    id: 'body',
    name: '天体',
    mass: 1,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    color: '#ffffff',
    ...overrides,
  }
}

describe('three-body Newtonian physics', () => {
  it('computes the mass-weighted center of mass', () => {
    const result = centerOfMass([
      body({ id: 'a', mass: 1, position: { x: -2, y: 1 } }),
      body({ id: 'b', mass: 3, position: { x: 2, y: -1 } }),
    ])

    expect(result.x).toBeCloseTo(1)
    expect(result.y).toBeCloseTo(-0.5)
  })

  it('uses softening to keep a close encounter finite without mutating the input', () => {
    const initial = [
      body({ id: 'a', position: { x: -1e-12, y: 0 } }),
      body({ id: 'b', position: { x: 1e-12, y: 0 } }),
      body({ id: 'c', position: { x: 0, y: 1e-12 } }),
    ]
    const snapshot = structuredClone(initial)

    const next = stepSystem(initial, 0.01, 1, 0.08)

    expect(isFiniteSystem(next)).toBe(true)
    expect(initial).toEqual(snapshot)
    expect(next).not.toBe(initial)
    expect(next[0]).not.toBe(initial[0])
  })

  it('keeps total linear momentum stable under pairwise gravity', () => {
    let current = createPreset('figure-eight')
    const before = totalMomentum(current)

    for (let index = 0; index < 2_000; index += 1) {
      current = stepSystem(current, 0.0025, 1, 0.025)
    }

    const after = totalMomentum(current)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
    expect(isFiniteSystem(current)).toBe(true)
  })

  it('returns deterministic, isolated body arrays for every preset', () => {
    const first = createPreset('lagrange-triangle')
    const second = createPreset('lagrange-triangle')

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first[0]).not.toBe(second[0])

    first[0].mass = 99
    first[0].position.x = 99
    expect(second[0].mass).not.toBe(99)
    expect(second[0].position.x).not.toBe(99)
  })
})

describe('ThreeBodyLab controls', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => null),
    })
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: class ResizeObserver {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    })
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true,
      value: vi.fn(() => 1),
    })
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => cleanup())

  it('exposes the complete simulation control loop with status feedback', () => {
    render(createElement(ThreeBodyLab))

    expect(screen.getByLabelText('轨道预设')).toHaveValue('figure-eight')
    expect(screen.getByLabelText('天体 A 质量')).toHaveValue('1')
    expect(screen.getByLabelText('时间尺度')).toHaveValue('1')
    expect(screen.getByLabelText('轨迹长度')).toHaveValue('260')
    expect(screen.getByRole('status', { name: '模拟状态' })).toHaveTextContent('已暂停')

    fireEvent.click(screen.getByRole('button', { name: '开始模拟' }))
    expect(screen.getByRole('status', { name: '模拟状态' })).toHaveTextContent('运行中')
    expect(screen.getByRole('button', { name: '暂停模拟' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '暂停模拟' }))
    fireEvent.click(screen.getByRole('button', { name: '单步演算' }))
    expect(screen.getByRole('status', { name: '模拟状态' })).toHaveTextContent('已完成单步演算')

    fireEvent.click(screen.getByRole('button', { name: '重置模拟' }))
    expect(screen.getByRole('status', { name: '模拟状态' })).toHaveTextContent('已恢复 8 字舞初始状态')
  })

  it('loads presets and accepts mass, time-scale and trail adjustments', () => {
    render(createElement(ThreeBodyLab))

    fireEvent.change(screen.getByLabelText('轨道预设'), {
      target: { value: 'lagrange-triangle' },
    })
    expect(screen.getByRole('status', { name: '模拟状态' })).toHaveTextContent('已载入 拉格朗日三角')

    fireEvent.change(screen.getByLabelText('天体 A 质量'), {
      target: { value: '1.8' },
    })
    fireEvent.change(screen.getByLabelText('时间尺度'), {
      target: { value: '1.5' },
    })
    fireEvent.change(screen.getByLabelText('轨迹长度'), {
      target: { value: '420' },
    })

    expect(screen.getByLabelText('天体 A 质量')).toHaveValue('1.8')
    expect(screen.getByLabelText('时间尺度')).toHaveValue('1.5')
    expect(screen.getByLabelText('轨迹长度')).toHaveValue('420')
  })
})
