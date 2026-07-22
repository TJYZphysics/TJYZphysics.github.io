import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PursuitLab } from './PursuitLab'

describe('PursuitLab', () => {
  let callbacks: Map<number, FrameRequestCallback>
  let nextFrameId: number

  beforeEach(() => {
    callbacks = new Map()
    nextFrameId = 0
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextFrameId
      callbacks.set(id, callback)
      return id
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => callbacks.delete(id)))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function runNextFrame(timestamp: number) {
    const entry = [...callbacks.entries()].at(-1)
    if (!entry) throw new Error('Expected a pending animation frame.')
    callbacks.delete(entry[0])
    act(() => entry[1](timestamp))
  }

  it('renders adjustable motion parameters and an analytic meeting prediction', () => {
    render(<PursuitLab />)

    expect(screen.getByRole('heading', { name: '追及与相遇实验台' })).toBeInTheDocument()
    expect(screen.getByLabelText('小车 A初速度方向')).toBeInTheDocument()
    expect(screen.getByLabelText('小车 B初速度方向')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: '初始距离' })).toHaveValue('40')
    expect(screen.getByText('首次相遇预测')).toBeInTheDocument()
    expect(screen.getByText(/t = 7\.32 s/)).toBeInTheDocument()
  })

  it('uses one simulation time for both chart scanlines', () => {
    render(<PursuitLab />)
    fireEvent.click(screen.getByRole('button', { name: '启动运行' }))
    runNextFrame(100)
    runNextFrame(600)

    const velocityScan = screen.getByTestId('pursuit-scanline-velocity')
    const positionScan = screen.getByTestId('pursuit-scanline-position')
    expect(velocityScan).toHaveAttribute('data-simulation-time', '0.1000')
    expect(positionScan).toHaveAttribute('data-simulation-time', '0.1000')
  })

  it('locks physical parameters while running but keeps playback speed available', () => {
    render(<PursuitLab />)
    fireEvent.click(screen.getByRole('button', { name: '启动运行' }))

    expect(screen.getByRole('slider', { name: '初始距离' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '2×' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '暂停' })).toBeEnabled()
  })

  it('restarts a completed run from zero without a reverse jump', () => {
    render(<PursuitLab />)
    fireEvent.click(screen.getByRole('button', { name: '启动运行' }))
    fireEvent.click(screen.getByRole('button', { name: '2×' }))
    runNextFrame(0)
    for (let index = 1; index <= 60; index += 1) {
      runNextFrame(index * 100)
      if (screen.queryByRole('button', { name: '再次运行' })) break
    }

    const restart = screen.getByRole('button', { name: '再次运行' })
    expect(restart).toBeInTheDocument()
    fireEvent.click(restart)
    runNextFrame(10_000)
    runNextFrame(10_100)

    expect(screen.getByTestId('pursuit-scanline-velocity')).toHaveAttribute('data-simulation-time', '0.2000')
    expect(screen.getByTestId('pursuit-scanline-position')).toHaveAttribute('data-simulation-time', '0.2000')
  })
})
