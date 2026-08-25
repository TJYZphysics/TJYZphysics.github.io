import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

describe('site routes', () => {
  beforeEach(() => window.localStorage.clear())
  it('renders the seven primary navigation modules', () => {
    render(<MemoryRouter><App /></MemoryRouter>)
    expect(screen.getByRole('link', { name: '主页' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '博客' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '实验' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '游戏' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '视频' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '导航' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'About us' })).toBeInTheDocument()
  })
  it('lists Markdown posts without a hand-maintained index', async () => {
    render(<MemoryRouter initialEntries={['/blog']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /从一束光开始/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /三体系统/ })).toBeInTheDocument()
  })
  it('filters blog posts by search text and tag', async () => {
    render(<MemoryRouter initialEntries={['/blog']}><App /></MemoryRouter>)
    fireEvent.change(await screen.findByPlaceholderText(/搜索标题/), { target: { value: '三体' } })
    expect(screen.getByRole('heading', { name: /三体系统/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /从一束光开始/ })).not.toBeInTheDocument()
  })
  it('renders both About Markdown documents without a theme toggle', async () => {
    render(<MemoryRouter initialEntries={['/about']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /关于PT物理社/ }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /社团历史/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /切换.*主题/ })).not.toBeInTheDocument()
  })
  it('toggles between dark and light themes outside About', () => {
    render(<MemoryRouter><App /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: '切换浅色主题' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(window.localStorage.getItem('tjyz-theme')).toBe('light')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })
  it('opens and closes the primary navigation with accessible state', () => {
    render(<MemoryRouter><App /></MemoryRouter>)
    const menu = screen.getByRole('button', { name: '打开导航' })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(menu)
    expect(screen.getByRole('button', { name: '关闭导航' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: '关闭导航' }))
    expect(screen.getByRole('button', { name: '打开导航' })).toHaveAttribute('aria-expanded', 'false')
  })
  it('filters HTML videos by search text and tag', async () => {
    render(<MemoryRouter initialEntries={['/videos']}><App /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: /播放《IYPT比赛介绍》/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /播放《2027 IYPT 题目介绍》/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /题目 1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /CYPT 1/ })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/搜索标题/), { target: { value: '不存在的影片' } })
    expect(screen.getByText('没有找到匹配的影片')).toBeInTheDocument()
  })
  it('opens mobile-friendly tag disclosures and closes them after selection', async () => {
    const { unmount } = render(<MemoryRouter initialEntries={['/videos']}><App /></MemoryRouter>)
    const videoToggle = await screen.findByRole('button', { name: /标签筛选/ })
    expect(videoToggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(videoToggle)
    expect(videoToggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: /CYPT 1/ }))
    expect(videoToggle).toHaveAttribute('aria-expanded', 'false')
    unmount()

    render(<MemoryRouter initialEntries={['/blog']}><App /></MemoryRouter>)
    const blogToggle = await screen.findByRole('button', { name: /标签筛选/ })
    expect(blogToggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(blogToggle)
    expect(blogToggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: /社团札记/ }))
    expect(blogToggle).toHaveAttribute('aria-expanded', 'false')
  })
})
