import { useEffect, useLayoutEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Menu, Moon, Sun, X } from 'lucide-react'
import HomePage from './pages/HomePage'
import BlogPage from './pages/BlogPage'
import BlogPostPage from './pages/BlogPostPage'
import ExperimentsPage from './pages/ExperimentsPage'
import AboutPage from './pages/AboutPage'
import NavigationPage from './pages/NavigationPage'
import VideosPage from './pages/VideosPage'
import './styles/global.css'

const navItems = [
  { to: '/', label: '主页', end: true }, { to: '/blog', label: '博客' },
  { to: '/experiments', label: '实验' }, { to: '/videos', label: '视频' },
  { to: '/navigation', label: '导航' }, { to: '/about', label: 'About us' },
]
type Theme = 'dark' | 'light'
const THEME_STORAGE_KEY = 'tjyz-theme'
const readTheme = (): Theme => {
  if (typeof window === 'undefined') return 'dark'
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (value === 'light' || value === 'claude-light') return 'light'
  } catch { /* use dark fallback */ }
  return 'dark'
}

function SiteHeader() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const isAbout = location.pathname.startsWith('/about')
  const [theme, setTheme] = useState<Theme>(readTheme)
  useEffect(() => { setOpen(false); window.scrollTo?.({ top: 0, behavior: 'auto' }) }, [location.pathname])
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.colorMode = theme
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme) } catch { /* ignore storage failures */ }
  }, [theme])
  return <header className={`site-header ${isAbout ? 'site-header--about' : ''}`}>
    <NavLink className="brand" to="/" aria-label="TJYZ Physics 主页"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span><b>TJYZ</b><small>PHYSICS</small></span></NavLink>
    {!isAbout && <button className="theme-toggle" type="button" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? '切换浅色主题' : '切换深色主题'} title={theme === 'dark' ? '浅色主题' : '深色主题'}>{theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}</button>}
    <button className="menu-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="切换导航">{open ? <X /> : <Menu />}</button>
    <nav className={open ? 'primary-nav is-open' : 'primary-nav'} aria-label="主导航">{navItems.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => isActive ? 'active' : ''}>{item.label}</NavLink>)}</nav>
  </header>
}

function SiteFooter() { return <footer className="site-footer"><div><strong>TJYZ PHYSICS</strong><span>为往圣继绝学，为万世开太平</span></div><p>© 2026 TJYZ Physics · Built for curious minds.</p></footer> }
export default function App() { return <div className="site-root"><SiteHeader /><Routes>
  <Route path="/" element={<HomePage />} /><Route path="/blog" element={<BlogPage />} /><Route path="/blog/:slug" element={<BlogPostPage />} /><Route path="/experiments" element={<ExperimentsPage />} /><Route path="/videos" element={<VideosPage />} /><Route path="/navigation" element={<NavigationPage />} /><Route path="/about" element={<AboutPage />} />
  <Route path="*" element={<main className="not-found"><p>404 / 未知坐标</p><h1>这里没有可观测事件。</h1><NavLink to="/">返回主页</NavLink></main>} />
</Routes><SiteFooter /></div> }
