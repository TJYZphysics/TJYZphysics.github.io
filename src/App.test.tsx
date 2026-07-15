import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

describe('site routes', () => {
  beforeEach(() => window.localStorage.clear())
  it('renders the five primary navigation modules', () => {
    render(<MemoryRouter><App /></MemoryRouter>)
    expect(screen.getByRole('link', { name: '主页' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '博客' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '实验' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '导航' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'About us' })).toBeInTheDocument()
  })
  it('lists Markdown posts without a hand-maintained index', () => {
    render(<MemoryRouter initialEntries={['/blog']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /从一束光开始/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /三体系统/ })).toBeInTheDocument()
  })
  it('filters blog posts by search text and tag', () => {
    render(<MemoryRouter initialEntries={['/blog']}><App /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText(/搜索标题/), { target: { value: '三体' } })
    expect(screen.getByRole('heading', { name: /三体系统/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /从一束光开始/ })).not.toBeInTheDocument()
  })
  it('renders both About Markdown documents without a theme toggle', () => {
    render(<MemoryRouter initialEntries={['/about']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /关于物理社/ })).toBeInTheDocument()
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
})
