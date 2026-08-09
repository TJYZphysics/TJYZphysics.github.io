import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ElectromagneticGuideGame, sampleParticleRenderFrame } from './ElectromagneticGuideGame'
import { ElectromagneticCanvas } from '../../experiments/electromagneticCanvas/ElectromagneticCanvas'

describe('electromagnetic particle rendering', () => {
  it('interpolates between sampled physics points during level playback', () => {
    const frame = sampleParticleRenderFrame({ path: [{ x: 0, y: 0 }, { x: 10, y: 4 }] }, false, 0.25)

    expect(frame.completedIndex).toBe(0)
    expect(frame.position).toEqual({ x: 2.5, y: 1 })
  })

  it('uses the live physics position between sandbox path samples', () => {
    const frame = sampleParticleRenderFrame({
      path: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      position: { x: 1.4, y: 1.25 },
    }, true, 1)

    expect(frame.completedIndex).toBe(1)
    expect(frame.position).toEqual({ x: 1.4, y: 1.25 })
  })
})

describe('ElectromagneticGuideGame sandbox', () => {
  let callbacks: Map<number, FrameRequestCallback>
  let nextFrame: number

  beforeEach(() => {
    callbacks = new Map()
    nextFrame = 0

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(performance, 'now').mockReturnValue(100)
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextFrame
      callbacks.set(id, callback)
      return id
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => callbacks.delete(id)))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const runNextFrame = (timestamp: number) => {
    const entry = [...callbacks.entries()].at(-1)
    if (!entry) throw new Error('Expected a pending animation frame')
    callbacks.delete(entry[0])
    act(() => entry[1](timestamp))
  }

  it('keeps rendering when the first animation timestamp is not ahead of performance.now()', () => {
    render(<ElectromagneticGuideGame />)

    fireEvent.click(screen.getByRole('button', { name: '25' }))
    fireEvent.click(screen.getByRole('button', { name: '发射粒子' }))

    expect(() => runNextFrame(100)).not.toThrow()
    expect(() => runNextFrame(116)).not.toThrow()
    expect(screen.getByRole('button', { name: '暂停' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '无界电磁实验室' })).toBeInTheDocument()
  })

  it('renders level 25 as the standalone electromagnetic canvas', () => {
    render(<ElectromagneticCanvas />)

    expect(screen.getByRole('heading', { name: '电磁画布' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '搭建你的电磁世界' })).toBeInTheDocument()
    expect(screen.getByText('在无限画布上布置电荷与场，自由观察粒子的运动轨迹。')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '选择电磁指南关卡' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '24' })).not.toBeInTheDocument()
    expect(screen.queryByText('LEVEL')).not.toBeInTheDocument()
    expect(screen.queryByText('SANDBOX')).not.toBeInTheDocument()
    expect(screen.queryByText('本关目标')).not.toBeInTheDocument()
    expect(screen.queryByText('让粒子沿你设计的轨道抵达收集器。')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '参考' })).not.toBeInTheDocument()
  })

  it('keeps sandbox wheel zoom independent from page scrolling', () => {
    render(<ElectromagneticGuideGame />)
    fireEvent.click(screen.getByRole('button', { name: '25' }))

    const canvas = screen.getByLabelText('电磁粒子轨迹画布')
    const sandboxWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 })
    act(() => canvas.dispatchEvent(sandboxWheel))

    expect(sandboxWheel.defaultPrevented).toBe(true)
    expect(screen.getByText('110%')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '24' }))
    const levelWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 })
    act(() => canvas.dispatchEvent(levelWheel))

    expect(levelWheel.defaultPrevented).toBe(false)
  })

  it('cancels the active animation when switching levels', () => {
    render(<ElectromagneticGuideGame />)
    fireEvent.click(screen.getByRole('button', { name: '25' }))
    fireEvent.click(screen.getByRole('button', { name: '发射粒子' }))
    expect(callbacks.size).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '24' }))
    expect(callbacks.size).toBe(0)
  })
})
