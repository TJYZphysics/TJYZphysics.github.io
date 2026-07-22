import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ProjectileLab } from './ProjectileLab'
import {
  PROJECTILE_HEIGHT,
  equalTimeSamples,
  flightTime,
  horizontalRange,
  projectileStateAtTime,
} from './model'

describe('projectile motion model', () => {
  it('uses the analytic horizontal and vertical equations', () => {
    const state = projectileStateAtTime(1.5, { initialSpeed: 12, gravity: 9.8 })

    expect(state.x).toBeCloseTo(18)
    expect(state.y).toBeCloseTo(PROJECTILE_HEIGHT - 0.5 * 9.8 * 1.5 ** 2)
    expect(state.vx).toBeCloseTo(12)
    expect(state.vy).toBeCloseTo(-14.7)
    expect(state.landed).toBe(false)
  })

  it('computes the exact landing time and horizontal range', () => {
    const duration = flightTime(9.8)
    const range = horizontalRange(15, 9.8)
    const landing = projectileStateAtTime(duration, { initialSpeed: 15, gravity: 9.8 })

    expect(duration).toBeCloseTo(Math.sqrt(40 / 9.8), 10)
    expect(range).toBeCloseTo(15 * duration, 10)
    expect(landing.time).toBeCloseTo(duration, 12)
    expect(landing.x).toBeCloseTo(range, 12)
    expect(landing.y).toBe(0)
    expect(landing.landed).toBe(true)
  })

  it('clamps time and position precisely at the ground', () => {
    const duration = flightTime(6)
    const state = projectileStateAtTime(duration + 100, { initialSpeed: 8, gravity: 6 })

    expect(state.time).toBe(duration)
    expect(state.x).toBeCloseTo(8 * duration)
    expect(state.y).toBe(0)
    expect(state.vy).toBeCloseTo(-6 * duration)
  })

  it('supports a custom release height in every analytic quantity', () => {
    const parameters = { initialSpeed: 20, gravity: 10, height: 30 }
    const duration = flightTime(parameters.gravity, parameters.height)
    const state = projectileStateAtTime(1, parameters)

    expect(duration).toBeCloseTo(Math.sqrt(6), 10)
    expect(horizontalRange(parameters.initialSpeed, parameters.gravity, parameters.height)).toBeCloseTo(20 * Math.sqrt(6), 10)
    expect(state.y).toBeCloseTo(25)
  })

  it('creates equally spaced time samples including launch and landing', () => {
    const samples = equalTimeSamples({ initialSpeed: 10, gravity: 10 }, 6)
    const interval = samples[1].time - samples[0].time

    expect(samples).toHaveLength(6)
    expect(samples[0].time).toBe(0)
    expect(samples.at(-1)?.landed).toBe(true)
    for (let index = 2; index < samples.length; index += 1) {
      expect(samples[index].time - samples[index - 1].time).toBeCloseTo(interval, 12)
    }
  })
})

describe('ProjectileLab controls', () => {
  beforeAll(() => {
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

  it('exposes parameters, projection toggles, transport and live measurements', () => {
    render(<ProjectileLab />)

    expect(screen.getByLabelText('水平初速度')).toHaveValue('14')
    expect(screen.getByLabelText('重力加速度')).toHaveValue('9.8')
    expect(screen.getByLabelText('释放高度')).toHaveValue('20')
    expect(screen.getByLabelText('xy轴比例')).toHaveValue('1')
    expect(screen.getByText('20.0 m')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /小球在/ })).toHaveAttribute('data-axis-ratio', '1.00')
    expect(screen.getByRole('button', { name: '水平匀速投影' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '竖直自由落体投影' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '水平匀速投影' }))
    expect(screen.getByRole('button', { name: '水平匀速投影' })).toHaveAttribute('aria-pressed', 'false')

    expect(screen.queryByRole('button', { name: '运动残影' })).not.toBeInTheDocument()
    const launchTrail = screen.getByRole('button', { name: /运动残影 1：距地高度 20\.0 米，水平位移 0\.0 米，时间 0\.00 秒/ })
    fireEvent.click(launchTrail)
    expect(launchTrail).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('距地高度 20.0 m')).toBeInTheDocument()
    expect(screen.getByText('水平位移 0.0 m')).toBeInTheDocument()
    expect(screen.getByText('时间 0.00 s')).toBeInTheDocument()
    expect(screen.getAllByTestId(/projectile-trail-readout-/)).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: '开始运动' }))
    expect(screen.getByRole('status', { name: '运动状态' })).toHaveTextContent('运行中')
    fireEvent.click(screen.getByRole('button', { name: '暂停运动' }))
    expect(screen.getByRole('status', { name: '运动状态' })).toHaveTextContent('已暂停')
    fireEvent.click(screen.getByRole('button', { name: '复位运动' }))
    expect(screen.getByRole('status', { name: '运动状态' })).toHaveTextContent('等待发射')
  })

  it('recalculates the analytic readout after parameter changes', () => {
    render(<ProjectileLab />)

    fireEvent.change(screen.getByLabelText('水平初速度'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('重力加速度'), { target: { value: '10' } })

    const duration = Math.sqrt(4)
    expect(screen.getByTestId('projectile-flight-time')).toHaveTextContent(`${duration.toFixed(2)} s`)
    expect(screen.getByTestId('projectile-range')).toHaveTextContent('40.00 m')
    expect(screen.getByTestId('projectile-vx')).toHaveTextContent('20.00 m/s')

    fireEvent.change(screen.getByLabelText('释放高度'), { target: { value: '30' } })
    expect(screen.getByTestId('projectile-flight-time')).toHaveTextContent(`${Math.sqrt(6).toFixed(2)} s`)
    expect(screen.getByTestId('projectile-range')).toHaveTextContent(`${(20 * Math.sqrt(6)).toFixed(2)} m`)
    fireEvent.change(screen.getByLabelText('xy轴比例'), { target: { value: '1.5' } })
    expect(screen.getByRole('img', { name: /小球在/ })).toHaveAttribute('data-axis-ratio', '1.50')
  })
})
