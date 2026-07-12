import { describe, expect, it } from 'vitest'
import { normalizePost, sortPosts } from './content'

describe('Markdown content normalization', () => {
  it('preserves UTF-8 Chinese text and front matter', () => {
    const post = normalizePost('/blog/first-note.md', `---\ntitle: 第一束光\ndate: 2026-07-12\nsummary: 从观察开始。\ntags: [光学, 观察]\n---\n# 中文正文`)
    expect(post.title).toBe('第一束光')
    expect(post.summary).toBe('从观察开始。')
    expect(post.body).toContain('中文正文')
    expect(post.tags).toEqual(['光学', '观察'])
  })

  it('falls back to a readable title when optional metadata is absent', () => {
    const post = normalizePost('/blog/chaos-and-order.md', '# Body')
    expect(post.title).toBe('Chaos And Order')
    expect(post.summary).toBe('')
    expect(post.tags).toEqual([])
  })

  it('sorts newest dated posts first and undated posts last', () => {
    const posts = [
      normalizePost('/blog/old.md', '---\ntitle: Old\ndate: 2025-01-01\n---\nOld'),
      normalizePost('/blog/undated.md', '---\ntitle: Undated\n---\nNone'),
      normalizePost('/blog/new.md', '---\ntitle: New\ndate: 2026-07-12\n---\nNew'),
    ]
    expect(sortPosts(posts).map((post) => post.slug)).toEqual(['new', 'old', 'undated'])
  })

  it('removes a duplicate leading Markdown title from article bodies', () => {
    const post = normalizePost('/blog/light.md', '---\ntitle: 光\n---\n\n# 光\n\n正文')
    expect(post.body).toBe('正文')
  })
})
