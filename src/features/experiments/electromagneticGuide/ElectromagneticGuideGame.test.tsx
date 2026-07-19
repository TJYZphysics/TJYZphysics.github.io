import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ElectromagneticGuideGame } from './ElectromagneticGuideGame'

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
})
