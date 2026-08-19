import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DevilsBalanceGame } from './DevilsBalanceGame'

describe('DevilsBalanceGame interactions', () => {
  beforeEach(() => {
    window.localStorage.setItem('tjyz-devils-balance-tutorial-seen', '1')
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('places the selected mineral when the player clicks a pan directly', () => {
    render(<DevilsBalanceGame />)

    const rightPan = screen.getByRole('button', { name: '把红色投放到A 右盘' })
    fireEvent.click(rightPan)

    expect(rightPan).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('已将红色方块放入A 右盘')
    expect(screen.getByRole('button', { name: /提交测量/ })).toHaveTextContent('1/3 已放')
  })

  it('keeps the submitted round visible until result settling finishes', () => {
    vi.useFakeTimers()
    render(<DevilsBalanceGame />)

    fireEvent.click(screen.getByRole('option', { name: '蓝色' }))
    fireEvent.click(screen.getByRole('button', { name: '把蓝色投放到A 左盘' }))
    fireEvent.click(screen.getByRole('option', { name: '绿色' }))
    fireEvent.click(screen.getByRole('button', { name: '把绿色投放到A 右盘' }))
    fireEvent.click(screen.getByRole('option', { name: '黄色' }))
    fireEvent.click(screen.getByRole('button', { name: '把黄色投放到B 左盘' }))
    fireEvent.click(screen.getByRole('button', { name: /提交测量/ }))

    expect(screen.getByTitle('当前状态')).toHaveTextContent('结算中')
    expect(screen.getByTitle('当前回合')).toHaveTextContent('01')
    expect(screen.getByLabelText('天平 A结果 <')).toBeInTheDocument()
    expect(screen.getByLabelText('天平 B结果 =')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /提交测量/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /提交测量/ })).toHaveTextContent('3/3 已放')

    act(() => vi.advanceTimersByTime(799))
    expect(screen.getByTitle('当前回合')).toHaveTextContent('01')

    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByTitle('当前状态')).toHaveTextContent('进行中')
    expect(screen.getByTitle('当前回合')).toHaveTextContent('02')
    expect(screen.getByLabelText('天平 A结果 待测量')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /提交测量/ })).toHaveTextContent('0/3 已放')
  })
})
