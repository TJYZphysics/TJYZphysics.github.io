import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { CausalOrigamiGame } from './CausalOrigamiGame'
import { LIGHT_PATH_LEVELS } from './levels'

const toolNames = {
  'turn-left': '左偏转器',
  'turn-right': '右偏转器',
  splitter: '分光棱镜',
} as const

async function placeStandardSolution(levelIndex: number) {
  const user = userEvent.setup()
  const level = LIGHT_PATH_LEVELS[levelIndex]

  await user.click(screen.getByRole('button', { name: `选择第 ${level.order} 关` }))
  for (const placement of level.solution) {
    await user.click(screen.getByRole('button', { name: new RegExp(`选择${toolNames[placement.tool]}`) }))
    await user.click(screen.getByRole('button', {
      name: `在时间 ${placement.point.t}、位置 ${placement.point.x} 放置${toolNames[placement.tool]}`,
    }))
  }

  return user
}

describe('CausalOrigamiGame', () => {
  it('shows light path tracing, every directly selectable level, and all three tool inventories', async () => {
    render(<CausalOrigamiGame />)
    const user = userEvent.setup()

    expect(screen.getByRole('heading', { name: '光路寻踪' })).toBeInTheDocument()
    const levelButtons = screen.getAllByRole('button', { name: /选择第 \d+ 关/ })
    expect(levelButtons).toHaveLength(20)
    levelButtons.forEach((button) => expect(button).toBeEnabled())
    expect(screen.getByRole('button', { name: /选择左偏转器/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /选择右偏转器/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /选择分光棱镜/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '选择第 20 关' }))
    expect(screen.getByLabelText('当前第 20 关，难度专家')).toBeInTheDocument()
  })

  it('clears placed tools and the run result when selecting another level', async () => {
    render(<CausalOrigamiGame />)
    const user = userEvent.setup()
    const placement = LIGHT_PATH_LEVELS[0].solution[0]

    await user.click(screen.getByRole('button', { name: new RegExp(`选择${toolNames[placement.tool]}`) }))
    await user.click(screen.getByRole('button', {
      name: `在时间 ${placement.point.t}、位置 ${placement.point.x} 放置${toolNames[placement.tool]}`,
    }))
    expect(screen.getByRole('button', { name: new RegExp(`移除${toolNames[placement.tool]}`) })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '运行光路' }))
    await user.click(screen.getByRole('button', { name: '选择第 2 关' }))

    expect(screen.queryByRole('button', { name: /移除.*偏转器|移除分光棱镜/ })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('第 2 关已就绪')
  })

  it('runs a standard solution through the same controls and reports success', async () => {
    render(<CausalOrigamiGame />)
    const user = await placeStandardSolution(0)

    await user.click(screen.getByRole('button', { name: '运行光路' }))

    expect(screen.getByRole('status')).toHaveTextContent('通关成功')
    expect(screen.getByRole('button', { name: '进入下一关' })).toBeInTheDocument()
  })

  it('draws every generated branch for a splitter level', async () => {
    const { container } = render(<CausalOrigamiGame />)
    const user = await placeStandardSolution(8)

    await user.click(screen.getByRole('button', { name: '运行光路' }))

    expect(container.querySelectorAll('polyline').length).toBeGreaterThan(2)
    expect(container.querySelectorAll('.signal--source-0').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.signal--source-1').length).toBeGreaterThan(0)
  })
})
