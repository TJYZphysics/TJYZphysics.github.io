import { ArrowLeft, List } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import GiscusComments from '../components/GiscusComments'
import MarkdownArticle, { getArticleHeadings } from '../components/MarkdownArticle'
import ReactionBar from '../components/ReactionBar'
import { getBlogPost } from '../content/content'
import { usePageMeta, SITE_URL, organizationJsonLd, breadcrumbJsonLd } from '../lib/seo'
import '../styles/blog.css'

export default function BlogPostPage() {
  const { slug = '' } = useParams()
  const post = getBlogPost(slug)
  usePageMeta({
    title: post ? `${post.title} · 天津一中物理社 | TJYZ Physics` : '未找到笔记 · 天津一中物理社',
    description: post?.summary || '天津一中物理社的物理笔记。',
    path: `/blog/${slug}/`,
    image: post?.cover,
    jsonLd: post
      ? [
          {
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.summary,
            datePublished: post.date,
            url: `${SITE_URL}/blog/${post.slug}/`,
            author: { '@id': `${SITE_URL}/#organization` },
            publisher: organizationJsonLd,
            mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/blog/${post.slug}/` },
            inLanguage: 'zh-CN',
          },
          breadcrumbJsonLd([
            { name: '主页', path: '/' },
            { name: '物理笔记', path: '/blog/' },
            { name: post.title, path: `/blog/${post.slug}/` },
          ]),
        ]
      : undefined,
  })
  if (!post) return <main className="not-found"><p>NOTE NOT FOUND</p><h1>这页笔记似乎被风吹走了。</h1><Link to="/blog">返回博客</Link></main>
  const headings = getArticleHeadings(post.body).filter((heading) => heading.depth >= 2)
  return (
    <main className="article-page page-pad">
      <Link className="back-link" to="/blog"><ArrowLeft /> 返回全部笔记</Link>
      <div className={`article-layout ${headings.length ? '' : 'article-layout--without-toc'}`}>
        <article className="article-paper">
          <header><p>{post.tags.join(' / ')}</p><h1>{post.title}</h1><div><time>{post.date}</time><span>约 {Math.max(1, Math.ceil(post.body.length / 500))} 分钟阅读</span></div></header>
          <MarkdownArticle body={post.body} />
          <ReactionBar id={`blog:${post.slug}`} />
        </article>
        {headings.length > 0 && <aside className="article-toc" aria-label="文章目录"><div><p><List /> 本文目录</p><nav>{headings.map((heading) => <a key={heading.id} className={`toc-depth-${heading.depth}`} href={`#${heading.id}`}>{heading.text}</a>)}</nav></div></aside>}
      </div>
      <GiscusComments />
    </main>
  )
}
