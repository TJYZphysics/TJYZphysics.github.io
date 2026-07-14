import { ArrowDown, ArrowUpRight, Bot, BookOpen, Compass, ExternalLink, Globe2, Library, Wrench } from 'lucide-react'
import { navigationCategories } from '../data/navigationSites'

const categoryIcons = {
  common: Globe2,
  ai: Bot,
  papers: Library,
  software: Compass,
  tools: Wrench,
  tutorials: BookOpen,
}

const displayUrl = (url: string) => new URL(url).hostname.replace(/^www\./, '')

export default function NavigationPage() {
  const siteCount = navigationCategories.reduce((total, category) => total + category.sites.length, 0)

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
          <a href="#common">开始浏览 <ArrowDown /></a>
        </div>
      </header>

      <div className="navigation-layout">
        <aside className="directory-sidebar" aria-label="网站分类目录">
          <p>目录 / DIRECTORY</p>
          <nav>
            {navigationCategories.map((category, index) => (
              <a href={`#${category.id}`} key={category.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {category.title}
              </a>
            ))}
          </nav>
          <small>所有外部链接均在新标签页打开。</small>
        </aside>

        <div className="directory-content">
          {navigationCategories.map((category, categoryIndex) => {
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
                      <a className="site-card" href={entry.url} target="_blank" rel="noreferrer" key={`${category.id}-${entry.title}`}>
                        <div className="site-card__top"><h3>{entry.title}</h3><ArrowUpRight /></div>
                        <p>{entry.description}</p>
                        <div className="site-card__url"><ExternalLink /><span>{displayUrl(entry.url)}</span></div>
                      </a>
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
        </div>
      </div>
    </main>
  )
}
