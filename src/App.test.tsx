import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('site routes', () => {
  it('renders the four primary navigation modules', () => {
    render(<MemoryRouter><App /></MemoryRouter>)
    expect(screen.getByRole('link', { name: '主页' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '博客' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '实验' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'About us' })).toBeInTheDocument()
  })

  it('lists Markdown posts without a hand-maintained index', () => {
    render(<MemoryRouter initialEntries={['/blog']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: '从一束光开始' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '三体系统：秩序如何滑向混沌' })).toBeInTheDocument()
  })

  it('renders both privacy-safe About Markdown documents', () => {
    render(<MemoryRouter initialEntries={['/about']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: '关于物理社' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '社团历史' })).toBeInTheDocument()
  })
})
