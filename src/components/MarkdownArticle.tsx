import { X, ZoomIn } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'highlight.js/styles/github-dark.css'
import 'katex/dist/katex.min.css'

export interface ArticleHeading {
  depth: number
  id: string
  text: string
}

const stripInlineMarkdown = (value: string) => value
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[`*_~]/g, '')
  .trim()

const slugBase = (value: string) => stripInlineMarkdown(value)
  .toLowerCase()
  .replace(/<[^>]+>/g, '')
  .replace(/[^\p{Letter}\p{Number}\u4e00-\u9fff-]+/gu, '-')
  .replace(/^-+|-+$/g, '') || 'section'

export function getArticleHeadings(body: string): ArticleHeading[] {
  const counts = new Map<string, number>()
  return body.split('\n').flatMap((line) => {
    const match = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/)
    if (!match) return []
    const text = stripInlineMarkdown(match[2])
    const base = slugBase(text)
    const count = counts.get(base) ?? 0
    counts.set(base, count + 1)
    return [{ depth: match[1].length, id: count ? `${base}-${count}` : base, text }]
  })
}

const nodeText = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return nodeText((node as { props?: { children?: ReactNode } }).props?.children)
  }
  return ''
}

export default function MarkdownArticle({ body, className = '' }: { body: string; className?: string }) {
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const headingIds = useMemo(() => {
    const queues = new Map<string, string[]>()
    getArticleHeadings(body).forEach(({ text, id }) => {
      const base = slugBase(text)
      queues.set(base, [...(queues.get(base) ?? []), id])
    })
    return queues
  }, [body])
  const renderedCounts = new Map<string, number>()

  useEffect(() => {
    if (!lightbox) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setLightbox(null)
    document.body.classList.add('lightbox-open')
    window.addEventListener('keydown', close)
    return () => {
      document.body.classList.remove('lightbox-open')
      window.removeEventListener('keydown', close)
    }
  }, [lightbox])

  const heading = (level: 1 | 2 | 3) => ({ children, node: _node, ...props }: { children?: ReactNode; node?: unknown }) => {
    const text = nodeText(children)
    const base = slugBase(text)
    const index = renderedCounts.get(base) ?? 0
    renderedCounts.set(base, index + 1)
    const id = headingIds.get(base)?.[index] ?? (index ? `${base}-${index}` : base)
    const Tag = `h${level}` as const
    return <Tag id={id} {...props}>{children}<a className="heading-anchor" href={`#${id}`} aria-hidden="true" tabIndex={-1}>#</a></Tag>
  }

  return (
    <>
      <article className={`markdown-body ${className}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex, rehypeHighlight]}
          components={{
            h1: heading(1),
            h2: heading(2),
            h3: heading(3),
            a: ({ href, children, ...props }) => {
              const external = href?.startsWith('http')
              return <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} {...props}>{children}</a>
            },
            img: ({ src, alt = '', ...props }) => src ? (
              <button className="markdown-image" type="button" onClick={() => setLightbox({ src, alt })} aria-label={`放大图片${alt ? `：${alt}` : ''}`}>
                <img src={src} alt={alt} loading="lazy" {...props} />
                <span aria-hidden="true"><ZoomIn /></span>
              </button>
            ) : null,
          }}
        >{body}</ReactMarkdown>
      </article>
      {lightbox && (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="图片预览" onClick={() => setLightbox(null)}>
          <button type="button" onClick={() => setLightbox(null)} aria-label="关闭图片预览"><X /></button>
          <figure onClick={(event) => event.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.alt} />
            {lightbox.alt && <figcaption>{lightbox.alt}</figcaption>}
          </figure>
        </div>
      )}
    </>
  )
}
