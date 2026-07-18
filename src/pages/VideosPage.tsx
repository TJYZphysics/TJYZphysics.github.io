import { ArrowUpRight, Film, Play, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { htmlVideos } from '../data/videos'
import '../styles/videos.css'

export default function VideosPage() {
  const [params, setParams] = useSearchParams()
  const searchRef = useRef<HTMLInputElement>(null)
  const query = params.get('q') ?? ''
  const activeTag = params.get('tag') ?? ''
  const tags = useMemo(
    () => Array.from(new Set(htmlVideos.flatMap((video) => video.tags))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [],
  )
  const visibleVideos = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN')
    return htmlVideos.filter((video) => {
      const matchesTag = !activeTag || video.tags.includes(activeTag)
      const haystack = [video.title, video.summary, ...video.tags].join('\n').toLocaleLowerCase('zh-CN')
      return matchesTag && (!normalized || haystack.includes(normalized))
    })
  }, [activeTag, query])

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
    <main className="videos-page page-pad">
      <header className="videos-hero">
        <div>
          <p>HTML FILMS · 交互式物理影像</p>
          <h1>视频</h1>
          <span>这里的影片由网页原生呈现。滚动、播放，在时间轴上看见物理。</span>
        </div>
        <div className="videos-hero__index" aria-label={`共 ${htmlVideos.length} 部视频`}>
          <b>{String(htmlVideos.length).padStart(2, '0')}</b>
          <span>部 HTML 影片<br />持续更新</span>
        </div>
      </header>

      <section className="video-discovery" aria-label="搜索与标签筛选">
        <label className="video-search">
          <Search aria-hidden="true" />
          <span className="sr-only">搜索视频</span>
          <input ref={searchRef} value={query} onChange={(event) => updateParam('q', event.target.value)} placeholder="搜索标题、简介或标签…" />
          <kbd>/</kbd>
        </label>
        <div className="video-tags" aria-label="按标签筛选">
          <button type="button" className={!activeTag ? 'is-active' : ''} onClick={() => updateParam('tag', '')}>全部 <span>{htmlVideos.length}</span></button>
          {tags.map((tag) => (
            <button type="button" key={tag} className={activeTag === tag ? 'is-active' : ''} onClick={() => updateParam('tag', activeTag === tag ? '' : tag)}>
              {tag} <span>{htmlVideos.filter((video) => video.tags.includes(tag)).length}</span>
            </button>
          ))}
        </div>
        {(query || activeTag) && <button type="button" className="video-filter-reset" onClick={() => setParams({}, { replace: true })}><X /> 清除筛选</button>}
      </section>

      <section className="video-library" aria-labelledby="video-library-title">
        <header>
          <div><Film aria-hidden="true" /><h2 id="video-library-title">影片库</h2></div>
          <span>{String(visibleVideos.length).padStart(2, '0')} / {String(htmlVideos.length).padStart(2, '0')}</span>
        </header>
        {visibleVideos.length === 0 ? (
          <div className="video-empty"><Search aria-hidden="true" /><h3>没有找到匹配的影片</h3><p>换一个关键词或标签，继续探索。</p></div>
        ) : (
          <div className="video-card-grid">
            {visibleVideos.map((video, index) => (
              <a className="video-card" href={video.href} key={video.slug} aria-label={`播放《${video.title}》`}>
                <div className="video-card__poster" aria-hidden="true">
                  <div className="video-card__frame" />
                  <span className="video-card__code">FILM {String(index + 1).padStart(2, '0')}</span>
                  <strong>IYPT</strong>
                  <span className="video-card__subtitle">EXPLORE THE PHYSICS BOUNDARY</span>
                  <svg viewBox="0 0 220 180"><path d="M24 156H198M58 156V28h91M87 28h40M120 28l35 88" /><circle cx="155" cy="116" r="13" /><path d="M36 135c19-27 37 28 56 0s38-27 57 0 37 27 56 0" /></svg>
                  <span className="video-card__play"><Play /></span>
                </div>
                <div className="video-card__body">
                  <div className="video-card__meta"><span>{video.chapters} 章节 · 交互式滚动</span><ArrowUpRight /></div>
                  <h3>{video.title}</h3>
                  <p>{video.summary}</p>
                  <div className="video-card__tags">{video.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
