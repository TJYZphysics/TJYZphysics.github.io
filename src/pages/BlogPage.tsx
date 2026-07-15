import { ArrowUpRight, BookMarked, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getBlogPosts } from '../content/content'

export default function BlogPage() {
  const posts = getBlogPosts()
  const [params, setParams] = useSearchParams()
  const searchRef = useRef<HTMLInputElement>(null)
  const query = params.get('q') ?? ''
  const activeTag = params.get('tag') ?? ''
  const tags = useMemo(() => Array.from(new Set(posts.flatMap((post) => post.tags))).sort((a, b) => a.localeCompare(b, 'zh-CN')), [posts])
  const visiblePosts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN')
    return posts.filter((post) => {
      const matchesTag = !activeTag || post.tags.includes(activeTag)
      const haystack = [post.title, post.summary, post.body, ...post.tags].join('\n').toLocaleLowerCase('zh-CN')
      return matchesTag && (!normalized || haystack.includes(normalized))
    })
  }, [activeTag, posts, query])

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, [contenteditable="true"]')) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  const updateParam = (key: 'q' | 'tag', value: string) => {
    const next = new URLSearchParams(params)
    value ? next.set(key, value) : next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <main className="blog-page page-pad">
      <header className="page-intro"><p>FIELD NOTES · 实验与思考</p><h1>物理笔记</h1><span>把过程写下来，答案才有机会被重新检验。</span></header>
      <section className="blog-discovery" aria-label="搜索与标签筛选">
        <label className="blog-search"><Search aria-hidden="true" /><span className="sr-only">搜索博客</span><input ref={searchRef} value={query} onChange={(event) => updateParam('q', event.target.value)} placeholder="搜索标题、摘要、正文或标签…" /><kbd>/</kbd></label>
        <div className="blog-tags" aria-label="按标签筛选">
          <button className={!activeTag ? 'is-active' : ''} onClick={() => updateParam('tag', '')}>全部 <span>{posts.length}</span></button>
          {tags.map((tag) => <button key={tag} className={activeTag === tag ? 'is-active' : ''} onClick={() => updateParam('tag', activeTag === tag ? '' : tag)}>{tag} <span>{posts.filter((post) => post.tags.includes(tag)).length}</span></button>)}
        </div>
        {(query || activeTag) && <button className="blog-filter-reset" onClick={() => setParams({}, { replace: true })}><X /> 清除筛选</button>}
      </section>
      <section className="notebook-shell">
        <div className="notebook-binding" aria-hidden="true">{Array.from({ length: 11 }, (_, i) => <i key={i} />)}</div>
        <div className="notebook-paper">
          <div className="notebook-heading"><BookMarked /><div><small>TJYZ PHYSICS / NOTEBOOK</small><h2>{query || activeTag ? '筛选结果' : '最近记录'}</h2></div><b>{String(visiblePosts.length).padStart(2, '0')}</b></div>
          <div className="post-list">
            {visiblePosts.length === 0 ? <div className="empty-state blog-empty"><Search /><h3>没有找到匹配的笔记</h3><p>换一个关键词或标签，也许会有新的发现。</p></div> : visiblePosts.map((post, index) => (
              <Link className="post-row" to={`/blog/${post.slug}`} key={post.slug}>
                <span className="post-number">{String(index + 1).padStart(2, '0')}</span>
                <div><p>{post.tags.join(' · ') || '观察记录'}</p><h2>{post.title}</h2><span>{post.summary}</span></div>
                <time>{post.date || '未标注日期'}</time><ArrowUpRight />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
