import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('site routes', () => {
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
    expect(screen.getByRole('heading', { name: '从一束光开始' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '三体系统：秩序如何滑向混沌' })).toBeInTheDocument()
  })

  it('filters blog posts by search text and tag', () => {
    render(<MemoryRouter initialEntries={['/blog']}><App /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText('搜索标题、摘要、正文或标签…'), { target: { value: '三体' } })
    expect(screen.getByRole('heading', { name: '三体系统：秩序如何滑向混沌' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '从一束光开始' })).not.toBeInTheDocument()
  })

  it('renders both privacy-safe About Markdown documents', () => {
    render(<MemoryRouter initialEntries={['/about']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: '关于物理社' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '社团历史' })).toBeInTheDocument()
  })
})
