import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import NavigationPage, { FAVORITES_STORAGE_KEY } from './NavigationPage'

describe('NavigationPage', () => {
  beforeEach(() => localStorage.clear())

  it('instantly filters sites by name and hides unrelated categories', () => {
    render(<NavigationPage />)

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索站点' }), { target: { value: 'arxiv' } })

    expect(screen.getByRole('heading', { name: 'arXiv' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'GitHub' })).not.toBeInTheDocument()
    expect(screen.getByText('找到 1 个站点')).toBeInTheDocument()
  })

  it('persists favorites and pins them above the directory', async () => {
    const { unmount } = render(<NavigationPage />)
    fireEvent.click(screen.getByRole('button', { name: '收藏 GitHub' }))

    await waitFor(() => expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) ?? '[]')).toEqual(['https://github.com/']))
    expect(screen.getByRole('heading', { name: '我的收藏' })).toBeInTheDocument()

    unmount()
    render(<NavigationPage />)
    expect(screen.getAllByRole('button', { name: '取消收藏 GitHub' })).toHaveLength(2)
  })

  it('stows the mobile search after scrolling and expands it on demand', () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 180 })
    render(<NavigationPage />)
    fireEvent.scroll(window)

    const trigger = screen.getByRole('button', { name: '展开搜索' })
    fireEvent.click(trigger)
    expect(screen.getByRole('button', { name: '收起搜索' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: '搜索站点' })).toHaveFocus()
  })
})
