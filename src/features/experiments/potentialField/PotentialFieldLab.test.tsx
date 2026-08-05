import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PotentialFieldLab } from './PotentialFieldLab'

describe('PotentialFieldLab', () => {
  beforeEach(() => {
    // jsdom has no WebGL, and three.js throws rather than handing back a null
    // context — so this doubles as a regression test for the fallback path that
    // real browsers without WebGL 2 take.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('degrades to a readable fallback when no WebGL context is available', () => {
    render(<PotentialFieldLab />)

    expect(screen.getByRole('heading', { name: '电势曲面' })).toBeInTheDocument()
    expect(screen.getByText('无法启动 3D 视图')).toBeInTheDocument()
    // The console has to stay usable even with the viewport unavailable.
    expect(screen.getByRole('button', { name: '放置' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '清空' })).toBeEnabled()
  })

  it('opens on the dipole preset', () => {
    render(<PotentialFieldLab />)

    expect(screen.getByText('2 / 16')).toBeInTheDocument()
    // Equal and opposite charges, so the net is a signless zero.
    expect(screen.getByText('0.00')).toBeInTheDocument()
    expect(screen.getByText('在视图中点击任意电荷即可选中，然后拖动或手动输入坐标。')).toBeInTheDocument()
  })

  it('places a charge from the coordinate inputs and selects it', () => {
    render(<PotentialFieldLab />)

    fireEvent.change(screen.getByLabelText('X 坐标'), { target: { value: '1.5' } })
    fireEvent.change(screen.getByLabelText('Y 坐标'), { target: { value: '-2' } })
    fireEvent.change(screen.getByLabelText('电量 q'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: '放置' }))

    expect(screen.getByText('3 / 16')).toBeInTheDocument()
    expect(screen.getByText('已在 (1.50, -2.00) 放置 q = +3.00。')).toBeInTheDocument()
    // The new charge becomes the selection, so the coordinate editor opens on it.
    expect(screen.getByRole('button', { name: '删除该电荷' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('X 坐标')[1]).toHaveValue(1.5)
  })

  it('edits the selected charge through the coordinate fields', () => {
    render(<PotentialFieldLab />)

    fireEvent.click(screen.getByRole('button', { name: '放置' }))
    fireEvent.change(screen.getAllByLabelText('Y 坐标')[1], { target: { value: '4.25' } })

    expect(screen.getAllByLabelText('Y 坐标')[1]).toHaveValue(4.25)
    fireEvent.click(screen.getByRole('button', { name: '删除该电荷' }))
    expect(screen.getByText('2 / 16')).toBeInTheDocument()
  })

  it('refuses a zero charge', () => {
    render(<PotentialFieldLab />)

    fireEvent.change(screen.getByLabelText('电量 q'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '放置' }))

    expect(screen.getByText('电量不能为零：正数表示正电荷，负数表示负电荷。')).toBeInTheDocument()
    expect(screen.getByText('2 / 16')).toBeInTheDocument()
  })

  it('clears every charge', () => {
    render(<PotentialFieldLab />)

    fireEvent.click(screen.getByRole('button', { name: '清空' }))

    expect(screen.getByText('0 / 16')).toBeInTheDocument()
    expect(screen.getByText('已清空所有点电荷，曲面回到零势平面。')).toBeInTheDocument()
  })

  it('switches the quantity mapped onto the height axis', () => {
    render(<PotentialFieldLab />)

    const magnitude = screen.getByRole('button', { name: '场强 |E|' })
    expect(magnitude).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(magnitude)

    expect(magnitude).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/Z 轴为场强大小/)).toBeInTheDocument()
    expect(screen.getByText('|E| 峰值')).toBeInTheDocument()
  })

  it('loads a preset arrangement', () => {
    render(<PotentialFieldLab />)

    fireEvent.click(screen.getByRole('button', { name: '平行板' }))

    expect(screen.getByText('6 / 16')).toBeInTheDocument()
    expect(screen.getByText('已载入「平行板」构型。')).toBeInTheDocument()
  })
})
