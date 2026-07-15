import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUpRight, Bot, BookOpen, Compass, ExternalLink, Globe2, Library, Search, Star, Wrench, X } from 'lucide-react'
import { navigationCategories, type NavigationSite } from '../data/navigationSites'
import '../styles/navigation.css'

const FAVORITES_STORAGE_KEY = 'tjyzphysics-navigation-favorites'

const categoryIcons = {
  common: Globe2,
  ai: Bot,
  papers: Library,
  software: Compass,
  tools: Wrench,
  tutorials: BookOpen,
}

const displayUrl = (url: string) => new URL(url).hostname.replace(/^www\./, '')
const normalize = (value: string) => value.trim().toLocaleLowerCase()

function readFavorites(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((url): url is string => typeof url === 'string') : []
  } catch {
    return []
  }
}

function SiteCard({ entry, favorite, onToggleFavorite }: { entry: NavigationSite; favorite: boolean; onToggleFavorite: () => void }) {
  return (
    <article className={`site-card${favorite ? ' is-favorite' : ''}`}>
      <button
        className="site-card__favorite"
        type="button"
        aria-label={favorite ? `取消收藏 ${entry.title}` : `收藏 ${entry.title}`}
        aria-pressed={favorite}
        onClick={onToggleFavorite}
        title={favorite ? '取消收藏' : '收藏并置顶'}
      >
        <Star aria-hidden="true" />
      </button>
      <a className="site-card__link" href={entry.url} target="_blank" rel="noreferrer">
        <div className="site-card__top"><h3>{entry.title}</h3><ArrowUpRight /></div>
        <p>{entry.description}</p>
        <div className="site-card__url"><ExternalLink /><span>{displayUrl(entry.url)}</span></div>
      </a>
    </article>
  )
}

export default function NavigationPage() {
  const [query, setQuery] = useState('')
  const [favorites, setFavorites] = useState<string[]>(readFavorites)
  const siteCount = navigationCategories.reduce((total, category) => total + category.sites.length, 0)
  const favoriteSet = useMemo(() => new Set(favorites), [favorites])
  const allSites = useMemo(() => navigationCategories.flatMap((category) => category.sites), [])
  const favoriteSites = useMemo(() => {
    const unique = new Map(allSites.map((entry) => [entry.url, entry]))
    return favorites.flatMap((url) => unique.get(url) ?? [])
  }, [allSites, favorites])
  const visibleFavoriteSites = useMemo(() => {
    const needle = normalize(query)
    if (!needle) return favoriteSites
    return favoriteSites.filter((entry) => normalize([entry.title, entry.description, displayUrl(entry.url)].join(' ')).includes(needle))
  }, [favoriteSites, query])
  const filteredCategories = useMemo(() => {
    const needle = normalize(query)
    if (!needle) return navigationCategories
    return navigationCategories.map((category) => ({
      ...category,
      sites: category.sites.filter((entry) => normalize([
        entry.title,
        entry.description,
        displayUrl(entry.url),
        category.title,
      ].join(' ')).includes(needle)),
    })).filter((category) => category.sites.length > 0)
  }, [query])
  const visibleCount = filteredCategories.reduce((total, category) => total + category.sites.length, 0)

  useEffect(() => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites))
  }, [favorites])

  const toggleFavorite = (url: string) => {
    setFavorites((current) => current.includes(url) ? current.filter((item) => item !== url) : [url, ...current])
  }

  return (
    <main className="navigation-page page-pad">
      <header className="navigation-hero">
        <div>
          <p>SCIENCE DIRECTORY · 科学上网入口</p>
          <h1><span>发现工具，</span><span>抵达知识。</span></h1>
        </div>
        <div className="navigation-hero__meta">
          <strong>{String(siteCount).padStart(3, '0')}</strong>
          <span>个精选入口<br />面向物理与计算机学习</span>
          <a href="#directory-search">开始浏览 <ArrowDown /></a>
        </div>
      </header>

      <section className="directory-search" id="directory-search" aria-label="站内导航搜索">
        <Search aria-hidden="true" />
        <label htmlFor="navigation-search">搜索站点</label>
        <input
          id="navigation-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索名称、简介、域名或分类…"
          autoComplete="off"
        />
        {query ? <button type="button" onClick={() => setQuery('')} aria-label="清空搜索"><X /></button> : null}
        <output aria-live="polite">{query ? `找到 ${visibleCount} 个站点` : `${siteCount} 个站点可搜索`}</output>
      </section>

      <div className="navigation-layout">
        <aside className="directory-sidebar" aria-label="网站分类目录">
          <p>目录 / DIRECTORY</p>
          <nav>
            {favoriteSites.length ? <a href="#favorites"><span>★</span>我的收藏</a> : null}
            {navigationCategories.map((category, index) => (
              <a href={`#${category.id}`} key={category.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {category.title}
              </a>
            ))}
          </nav>
          <small>点击星标收藏常用入口；收藏保存在当前浏览器中。</small>
        </aside>

        <div className="directory-content">
          {visibleFavoriteSites.length ? (
            <section className="directory-section directory-section--favorites" id="favorites">
              <header className="directory-section__header">
                <div className="directory-section__number">★</div>
                <div className="directory-section__title"><Star /><div><h2>我的收藏</h2><p>常用站点始终置顶，打开导航页即可直达。</p></div></div>
                <span>{String(visibleFavoriteSites.length).padStart(2, '0')} SAVED</span>
              </header>
              <div className="site-card-grid">
                {visibleFavoriteSites.map((entry) => <SiteCard entry={entry} favorite onToggleFavorite={() => toggleFavorite(entry.url)} key={`favorite-${entry.url}`} />)}
              </div>
            </section>
          ) : null}

          {filteredCategories.map((category) => {
            const categoryIndex = navigationCategories.findIndex((item) => item.id === category.id)
            const Icon = categoryIcons[category.id as keyof typeof categoryIcons] ?? Globe2
            return (
              <section className="directory-section" id={category.id} key={category.id}>
                <header className="directory-section__header">
                  <div className="directory-section__number">{String(categoryIndex + 1).padStart(2, '0')}</div>
                  <div className="directory-section__title"><Icon /><div><h2>{category.title}</h2><p>{category.description}</p></div></div>
                  <span>{String(category.sites.length).padStart(2, '0')} SITES</span>
                </header>

                {category.sites.length > 0 ? (
                  <div className="site-card-grid">
                    {category.sites.map((entry) => (
                      <SiteCard entry={entry} favorite={favoriteSet.has(entry.url)} onToggleFavorite={() => toggleFavorite(entry.url)} key={`${category.id}-${entry.title}`} />
                    ))}
                  </div>
                ) : (
                  <div className="directory-empty">
                    <BookOpen />
                    <div><h3>教程正在整理</h3><p>这里暂时空置，之后会收录经过验证的博客与指南。</p></div>
                  </div>
                )}
              </section>
            )
          })}

          {query && visibleCount === 0 ? (
            <div className="directory-empty directory-empty--search" role="status">
              <Search />
              <div><h3>没有找到相关站点</h3><p>试试更短的关键词、网站域名或分类名称。</p></div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}

export { FAVORITES_STORAGE_KEY }
