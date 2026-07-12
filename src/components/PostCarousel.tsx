import { useEffect, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Pause, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { BlogPost } from '../content/content'

interface PostCarouselProps {
  posts: BlogPost[]
}

type CarouselPosition = 'previous' | 'current' | 'next'

const AUTOPLAY_INTERVAL = 7_000
const TONES = ['cyan', 'blue', 'violet'] as const

function wrapIndex(index: number, length: number) {
  return (index + length) % length
}

function getTone(post: BlogPost) {
  const seed = `${post.slug}:${post.tags.join(':')}`
  const total = Array.from(seed).reduce((sum, character) => sum + (character.codePointAt(0) ?? 0), 0)
  return TONES[total % TONES.length]
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined'
      ? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      : false
  ))

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return undefined

    const updatePreference = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    setReducedMotion(query.matches)
    query.addEventListener?.('change', updatePreference)
    return () => query.removeEventListener?.('change', updatePreference)
  }, [])

  return reducedMotion
}

export default function PostCarousel({ posts }: PostCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const [hasFocus, setHasFocus] = useState(false)
  const [isDocumentHidden, setIsDocumentHidden] = useState(() => document.hidden)
  const [isUserPaused, setIsUserPaused] = useState(false)
  const reducedMotion = useReducedMotion()
  const postCount = posts.length
  const safeCurrentIndex = postCount > 0 ? currentIndex % postCount : 0

  useEffect(() => {
    const updateVisibility = () => setIsDocumentHidden(document.hidden)
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    if (postCount < 2 || isHovered || hasFocus || isDocumentHidden || reducedMotion || isUserPaused) return undefined

    const interval = window.setInterval(() => {
      setCurrentIndex((index) => wrapIndex(index + 1, postCount))
    }, AUTOPLAY_INTERVAL)
    return () => window.clearInterval(interval)
  }, [hasFocus, isDocumentHidden, isHovered, isUserPaused, postCount, reducedMotion])

  const selectPrevious = () => {
    if (postCount > 1) setCurrentIndex((index) => wrapIndex(index - 1, postCount))
  }

  const selectNext = () => {
    if (postCount > 1) setCurrentIndex((index) => wrapIndex(index + 1, postCount))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      selectPrevious()
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      selectNext()
    }
  }

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHasFocus(false)
  }

  if (postCount === 0) {
    return (
      <section className="post-carousel post-carousel--empty" aria-label="最新博文转盘">
        <span>NO SIGNAL</span>
        <p>暂时还没有可展示的文章。</p>
      </section>
    )
  }

  const visibleCards: Array<{ index: number; position: CarouselPosition }> = postCount === 1
    ? [{ index: 0, position: 'current' }]
    : postCount === 2
      ? [
          { index: safeCurrentIndex, position: 'current' },
          { index: wrapIndex(safeCurrentIndex + 1, postCount), position: 'next' },
        ]
      : [
          { index: wrapIndex(safeCurrentIndex - 1, postCount), position: 'previous' },
          { index: safeCurrentIndex, position: 'current' },
          { index: wrapIndex(safeCurrentIndex + 1, postCount), position: 'next' },
        ]

  return (
    <section
      className={`post-carousel${reducedMotion ? ' post-carousel--reduced-motion' : ''}`}
      aria-label="最新博文转盘"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setHasFocus(true)}
      onBlurCapture={handleBlur}
    >
      <div className="post-carousel__viewport">
        <div className="post-carousel__track">
          {visibleCards.map(({ index, position }) => {
            const post = posts[index]
            const isCurrent = position === 'current'
            return (
              <article
                className={`post-carousel__item post-carousel__item--${position}`}
                key={post.slug}
                aria-hidden={!isCurrent}
              >
                <Link
                  className={`post-card post-card--${getTone(post)}`}
                  to={`/blog/${post.slug}`}
                  tabIndex={isCurrent ? 0 : -1}
                  aria-label={`阅读《${post.title}》`}
                >
                  <span className="post-card__orbit" aria-hidden="true" />
                  <div className="post-card__meta">
                    <span>{post.tags.length > 0 ? post.tags.join(' / ') : '社团札记'}</span>
                    {post.date ? <time dateTime={post.date}>{post.date}</time> : null}
                  </div>
                  <h3>{post.title}</h3>
                  <p>{post.summary || '继续阅读这篇物理社记录。'}</p>
                  <span className="post-card__link">阅读全文 <ArrowUpRight /></span>
                </Link>
              </article>
            )
          })}
        </div>
      </div>

      {postCount > 1 ? (
        <div className="post-carousel__controls">
          <div className="post-carousel__arrows">
            <button type="button" aria-label="上一篇" onClick={selectPrevious}><ArrowLeft /></button>
            <button
              type="button"
              aria-label={isUserPaused ? '继续自动轮播' : '暂停自动轮播'}
              aria-pressed={isUserPaused}
              onClick={() => setIsUserPaused((paused) => !paused)}
            >
              {isUserPaused ? <Play /> : <Pause />}
            </button>
            <button type="button" aria-label="下一篇" onClick={selectNext}><ArrowRight /></button>
          </div>
          <div className="post-carousel__dots" role="group" aria-label="选择文章">
            {posts.map((post, index) => (
              <button
                type="button"
                key={post.slug}
                className={index === safeCurrentIndex ? 'is-active' : ''}
                aria-label={`查看第 ${index + 1} 篇：${post.title}`}
                aria-pressed={index === safeCurrentIndex}
                onClick={() => setCurrentIndex(index)}
              />
            ))}
          </div>
          <p className="post-carousel__count" aria-live="polite">
            <b>{String(safeCurrentIndex + 1).padStart(2, '0')}</b>
            <span>/ {String(postCount).padStart(2, '0')}</span>
          </p>
        </div>
      ) : null}
    </section>
  )
}
