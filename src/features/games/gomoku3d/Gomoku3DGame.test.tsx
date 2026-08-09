import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Gomoku3DGame } from './Gomoku3DGame'

describe('Gomoku3DGame controls', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the game controls available when WebGL cannot start', () => {
    render(<Gomoku3DGame />)

    expect(screen.getByRole('heading', { name: '三维五子' })).toBeInTheDocument()
    expect(screen.getByText('三维棋盘暂时不可用')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '人机' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '中等' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '悔棋' })).toBeDisabled()
  })

  it('switches play and visibility modes through segmented controls', () => {
    render(<Gomoku3DGame />)

    fireEvent.click(screen.getByRole('button', { name: '双人' }))
    expect(screen.getByRole('button', { name: '双人' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '中等' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '只看黑色' }))
    expect(screen.getByRole('button', { name: '只看黑色' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '双方' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('lets the player choose white and makes the computer open with black', async () => {
    render(<Gomoku3DGame />)

    fireEvent.click(screen.getByRole('button', { name: '执白' }))
    expect(screen.getByRole('button', { name: '执白' })).toHaveAttribute('aria-pressed', 'true')

    const blackReadout = screen.getByText('黑子').closest('div')
    const whiteReadout = screen.getByText('白子').closest('div')
    expect(blackReadout).not.toBeNull()
    expect(whiteReadout).not.toBeNull()

    await waitFor(() => {
      expect(within(blackReadout!).getByText('01')).toBeInTheDocument()
      expect(within(whiteReadout!).getByText('00')).toBeInTheDocument()
      expect(screen.getAllByText('你落子')).not.toHaveLength(0)
    })
  })

  it('confirms an exact move through the layered placement assistant', () => {
    render(<Gomoku3DGame />)
    fireEvent.click(screen.getByRole('button', { name: '双人' }))

    const assistToggle = screen.getByRole('button', { name: /辅助落子/ })
    fireEvent.click(assistToggle)
    expect(assistToggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('application')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: '确认落子' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Y 轴第 5 层' }))
    const gridCells = screen.getAllByRole('gridcell')
    expect(gridCells[0]).toHaveAccessibleName('X 1，Y 5，Z 1，空位')
    expect(gridCells.at(-1)).toHaveAccessibleName('X 8，Y 5，Z 8，空位')
    fireEvent.click(screen.getByRole('gridcell', { name: 'X 3，Y 5，Z 4，空位' }))
    expect(screen.getByText('X3 · Y5 · Z4')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '确认落子' }))
    const blackReadout = screen.getByText('黑子').closest('div')
    expect(blackReadout).not.toBeNull()
    expect(within(blackReadout!).getByText('01')).toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: 'X 3，Y 5，Z 4，黑子' })).toBeDisabled()

    fireEvent.click(assistToggle)
    expect(assistToggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('application')).toHaveAttribute('aria-disabled', 'false')
  })
})
