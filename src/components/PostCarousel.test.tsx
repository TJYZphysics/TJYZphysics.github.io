import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogPost } from '../content/content'
import PostCarousel from './PostCarousel'

const originalDocumentHiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden')
const originalMatchMedia = window.matchMedia

const posts: BlogPost[] = [
  {
    slug: 'first-note',
    title: '第一篇观测记录',
    date: '2026-07-12',
    summary: '从一次稳定的观测开始。',
    tags: ['观测'],
    body: '',
    sourcePath: '/blog/first-note.md',
  },
  {
    slug: 'second-note',
    title: '第二篇实验记录',
    date: '2026-07-11',
    summary: '让猜想接受实验检验。',
    tags: ['实验'],
    body: '',
    sourcePath: '/blog/second-note.md',
  },
  {
    slug: 'third-note',
    title: '第三篇分享记录',
    date: '2026-07-10',
    summary: '把过程写给后来者。',
    tags: ['分享'],
    body: '',
    sourcePath: '/blog/third-note.md',
  },
]

function installMatchMedia(matches = false) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
  fireEvent(document, new Event('visibilitychange'))
}

function renderCarousel(items = posts) {
  return render(
    <MemoryRouter>
      <PostCarousel posts={items} />
    </MemoryRouter>,
  )
}

function expectCurrent(title: string) {
  expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: new RegExp(title) })).toHaveAttribute(
    'href',
    `/blog/${posts.find((post) => post.title === title)?.slug}`,
  )
}

describe('PostCarousel', () => {
  beforeEach(() => {
    installMatchMedia()
    setDocumentHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalDocumentHiddenDescriptor) {
      Object.defineProperty(document, 'hidden', originalDocumentHiddenDescriptor)
    } else {
      Reflect.deleteProperty(document, 'hidden')
    }
    if (originalMatchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      })
    } else {
      Reflect.deleteProperty(window, 'matchMedia')
    }
  })

  it('renders article titles and links from the supplied Markdown data', () => {
    renderCarousel()

    expectCurrent('第一篇观测记录')
    fireEvent.click(screen.getByRole('button', { name: '查看第 3 篇：第三篇分享记录' }))
    expectCurrent('第三篇分享记录')
  })

  it('cycles with the previous and next controls', () => {
    renderCarousel()

    fireEvent.click(screen.getByRole('button', { name: '下一篇' }))
    expectCurrent('第二篇实验记录')
    fireEvent.click(screen.getByRole('button', { name: '上一篇' }))
    expectCurrent('第一篇观测记录')
  })

  it('supports left and right arrow keys', () => {
    renderCarousel()
    const carousel = screen.getByRole('region', { name: '最新博文转盘' })

    fireEvent.keyDown(carousel, { key: 'ArrowRight' })
    expectCurrent('第二篇实验记录')
    fireEvent.keyDown(carousel, { key: 'ArrowLeft' })
    expectCurrent('第一篇观测记录')
  })

  it('does not render navigation for a single article', () => {
    renderCarousel(posts.slice(0, 1))

    expectCurrent('第一篇观测记录')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('cycles exactly two unique articles in both directions and on autoplay', () => {
    vi.useFakeTimers()
    const { container } = renderCarousel(posts.slice(0, 2))
    const articleLinks = Array.from(container.querySelectorAll('article a'))

    expect(container.querySelectorAll('article')).toHaveLength(2)
    expect(articleLinks).toHaveLength(2)
    expect(new Set(articleLinks.map((link) => link.getAttribute('href'))).size).toBe(2)
    expectCurrent('第一篇观测记录')
    expect(container.querySelector('.post-carousel__count b')).toHaveTextContent('01')

    fireEvent.click(screen.getByRole('button', { name: '下一篇' }))
    expectCurrent('第二篇实验记录')
    expect(container.querySelector('.post-carousel__count b')).toHaveTextContent('02')
    fireEvent.click(screen.getByRole('button', { name: '上一篇' }))
    expectCurrent('第一篇观测记录')
    expect(container.querySelector('.post-carousel__count b')).toHaveTextContent('01')

    act(() => vi.advanceTimersByTime(7_000))
    expectCurrent('第二篇实验记录')
    expect(container.querySelector('.post-carousel__count b')).toHaveTextContent('02')
    act(() => vi.advanceTimersByTime(7_000))
    expectCurrent('第一篇观测记录')
    expect(container.querySelector('.post-carousel__count b')).toHaveTextContent('01')
  })

  it('renders a useful empty state', () => {
    renderCarousel([])

    expect(screen.getByText('暂时还没有可展示的文章。')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('advances automatically every seven seconds', () => {
    vi.useFakeTimers()
    renderCarousel()

    act(() => vi.advanceTimersByTime(7_000))
    expectCurrent('第二篇实验记录')
  })

  it('lets the user pause autoplay until they explicitly resume it', () => {
    vi.useFakeTimers()
    renderCarousel()

    fireEvent.click(screen.getByRole('button', { name: '暂停自动轮播' }))
    act(() => vi.advanceTimersByTime(14_000))
    expectCurrent('第一篇观测记录')

    fireEvent.click(screen.getByRole('button', { name: '继续自动轮播' }))
    act(() => vi.advanceTimersByTime(7_000))
    expectCurrent('第二篇实验记录')
  })

  it('pauses autoplay while hovered or focused', () => {
    vi.useFakeTimers()
    renderCarousel()
    const carousel = screen.getByRole('region', { name: '最新博文转盘' })

    fireEvent.mouseEnter(carousel)
    act(() => vi.advanceTimersByTime(7_000))
    expectCurrent('第一篇观测记录')
    fireEvent.mouseLeave(carousel)
    act(() => vi.advanceTimersByTime(7_000))
    expectCurrent('第二篇实验记录')

    const nextButton = screen.getByRole('button', { name: '下一篇' })
    fireEvent.focus(nextButton)
    act(() => vi.advanceTimersByTime(7_000))
    expectCurrent('第二篇实验记录')
    fireEvent.blur(nextButton, { relatedTarget: null })
    act(() => vi.advanceTimersByTime(7_000))
    expectCurrent('第三篇分享记录')
  })

  it('pauses autoplay while the document is hidden', () => {
    vi.useFakeTimers()
    renderCarousel()

    setDocumentHidden(true)
    act(() => vi.advanceTimersByTime(7_000))
    expectCurrent('第一篇观测记录')
    setDocumentHidden(false)
    act(() => vi.advanceTimersByTime(7_000))
    expectCurrent('第二篇实验记录')
  })

  it('disables autoplay when reduced motion is requested', () => {
    vi.useFakeTimers()
    installMatchMedia(true)
    renderCarousel()

    act(() => vi.advanceTimersByTime(14_000))
    expectCurrent('第一篇观测记录')
  })
})
