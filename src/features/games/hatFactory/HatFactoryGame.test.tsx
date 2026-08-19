import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HatFactoryGame } from './HatFactoryGame'

describe('HatFactoryGame flow', () => {
  it('returns the factory to the viewport when entering a new phase', () => {
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    render(<HatFactoryGame />)
    fireEvent.click(screen.getByRole('button', { name: /进入工厂/ }))
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' })
    requestAnimationFrame.mockRestore()
    Element.prototype.scrollIntoView = originalScrollIntoView
  })

  it('requires a size before starting and exposes a 20-step quiz', () => {
    render(<HatFactoryGame />)
    fireEvent.click(screen.getByRole('button', { name: /进入工厂/ }))
    expect(screen.getByRole('button', { name: /请先选择工厂尺码/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: /大号帽子/ }))
    expect(screen.getByRole('button', { name: /启动大号帽子生产线/ })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /启动大号帽子生产线/ }))
    expect(screen.getByLabelText('工序 01/20')).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(4)
  })

  it('finishes without exposing numerical personality scores', () => {
    vi.useFakeTimers()
    render(<HatFactoryGame />)
    fireEvent.click(screen.getByRole('button', { name: /进入工厂/ }))
    fireEvent.click(screen.getByRole('radio', { name: /小号帽子/ }))
    fireEvent.click(screen.getByRole('button', { name: /启动小号帽子生产线/ }))
    for (let index = 0; index < 20; index += 1) {
      fireEvent.click(screen.getAllByRole('radio')[0])
      act(() => vi.advanceTimersByTime(220))
    }
    expect(screen.getAllByText('本厂建议为你生产').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/分数|百分比|\/ 100/)).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
