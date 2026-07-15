import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Check, ChevronDown, Menu, Moon, Sparkles, Sun, X } from 'lucide-react'
import HomePage from './pages/HomePage'
import BlogPage from './pages/BlogPage'
import BlogPostPage from './pages/BlogPostPage'
import ExperimentsPage from './pages/ExperimentsPage'
import AboutPage from './pages/AboutPage'
import NavigationPage from './pages/NavigationPage'
import './styles/global.css'

const navItems = [
  { to: '/', label: '主页', end: true },
  { to: '/blog', label: '博客' },
  { to: '/experiments', label: '实验' },
  { to: '/navigation', label: '导航' },
  { to: '/about', label: 'About us' },
]

const themes = [
  { id: 'dark', label: '深色模式', description: '深海蓝与高亮青色', mode: 'dark', icon: Moon },
  { id: 'light', label: '浅色模式', description: '冷白底与清晰蓝绿', mode: 'light', icon: Sun },
  { id: 'claude-dark', label: 'Claude 深色', description: '暖黑底与陶土橙', mode: 'dark', icon: Sparkles },
  { id: 'claude-light', label: 'Claude 浅色', description: '暖米白与陶土橙', mode: 'light', icon: Sparkles },
] as const

type Theme = (typeof themes)[number]['id']
type ColorMode = (typeof themes)[number]['mode']

const THEME_STORAGE_KEY = 'tjyz-theme'

function isTheme(value: string | null): value is Theme {
  return themes.some((theme) => theme.id === value)
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(storedTheme) ? storedTheme : 'dark'
  } catch {
    return 'dark'
  }
}

function getColorMode(theme: Theme): ColorMode {
  return themes.find((option) => option.id === theme)?.mode ?? 'dark'
}

interface SiteHeaderProps {
  isAbout: boolean
  theme: Theme
  onThemeChange: (theme: Theme) => void
}

function SiteHeader({ isAbout, theme, onThemeChange }: SiteHeaderProps) {
  const [open, setOpen] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const themePickerRef = useRef<HTMLDivElement>(null)
  const themeTriggerRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const activeTheme = themes.find((option) => option.id === theme) ?? themes[0]
  const ActiveThemeIcon = activeTheme.icon

  useEffect(() => {
    setOpen(false)
    setThemeMenuOpen(false)
    if (!navigator.userAgent.toLowerCase().includes('jsdom')) window.scrollTo?.({ top: 0, behavior: 'auto' })
  }, [location.pathname])

  useEffect(() => {
    if (!themeMenuOpen) return

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!themePickerRef.current?.contains(event.target as Node)) setThemeMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setThemeMenuOpen(false)
      themeTriggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [themeMenuOpen])

  return (
    <header className={`site-header ${isAbout ? 'site-header--about' : ''}`}>
      <NavLink className="brand" to="/" aria-label="TJYZ Physics 主页">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <span><b>TJYZ</b><small>PHYSICS</small></span>
      </NavLink>
      {!isAbout && (
        <div className="theme-picker" ref={themePickerRef}>
          <button
            ref={themeTriggerRef}
            className="theme-picker__trigger"
            type="button"
            aria-label={`切换主题，当前为${activeTheme.label}`}
            aria-haspopup="true"
            aria-expanded={themeMenuOpen}
            aria-controls="theme-options"
            onClick={() => setThemeMenuOpen((value) => !value)}
          >
            <ActiveThemeIcon aria-hidden="true" />
            <span>{activeTheme.label}</span>
            <ChevronDown className="theme-picker__chevron" aria-hidden="true" />
          </button>
          {themeMenuOpen && (
            <div className="theme-picker__menu" id="theme-options" role="radiogroup" aria-label="选择网站主题">
              {themes.map((option) => {
                const ThemeIcon = option.icon
                const isActive = option.id === theme
                return (
                  <button
                    key={option.id}
                    className={isActive ? 'theme-picker__option is-active' : 'theme-picker__option'}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => {
                      onThemeChange(option.id)
                      setThemeMenuOpen(false)
                      themeTriggerRef.current?.focus()
                    }}
                  >
                    <span className={`theme-picker__swatch theme-picker__swatch--${option.id}`}><ThemeIcon aria-hidden="true" /></span>
                    <span><b>{option.label}</b><small>{option.description}</small></span>
                    <Check className="theme-picker__check" aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
      <button className="menu-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="切换导航">{open ? <X /> : <Menu />}</button>
      <nav className={open ? 'primary-nav is-open' : 'primary-nav'} aria-label="主导航">
        {navItems.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => isActive ? 'active' : ''}>{item.label}</NavLink>)}
      </nav>
    </header>
  )
}

function SiteFooter() {
  return <footer className="site-footer"><div><strong>TJYZ PHYSICS</strong><span>为终身学习，为万物好奇</span></div><p>© 2026 TJYZ Physics · Built for curious minds.</p></footer>
}

export default function App() {
  const location = useLocation()
  const isAbout = location.pathname.startsWith('/about')
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.colorMode = getColorMode(theme)

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // The active theme remains usable when storage is unavailable.
    }
  }, [theme])

  return <div className={`site-root ${isAbout ? 'site-root--about' : ''}`}><SiteHeader isAbout={isAbout} theme={theme} onThemeChange={setTheme} /><Routes>
    <Route path="/" element={<HomePage />} /><Route path="/blog" element={<BlogPage />} /><Route path="/blog/:slug" element={<BlogPostPage />} />
    <Route path="/experiments" element={<ExperimentsPage />} /><Route path="/navigation" element={<NavigationPage />} /><Route path="/about" element={<AboutPage />} />
    <Route path="*" element={<main className="not-found"><p>404 / 未知坐标</p><h1>这里没有可观测事件。</h1><NavLink to="/">返回主页</NavLink></main>} />
  </Routes><SiteFooter /></div>
}
