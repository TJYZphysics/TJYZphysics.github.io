import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import GiscusPlaceholder from '../components/GiscusPlaceholder'
import MarkdownArticle from '../components/MarkdownArticle'
import ReactionBar from '../components/ReactionBar'
import { getBlogPost } from '../content/content'

export default function BlogPostPage() {
  const { slug = '' } = useParams()
  const post = getBlogPost(slug)
  if (!post) return <main className="not-found"><p>NOTE NOT FOUND</p><h1>这页笔记似乎被风吹走了。</h1><Link to="/blog">返回博客</Link></main>
  return (
    <main className="article-page page-pad">
      <Link className="back-link" to="/blog"><ArrowLeft /> 返回全部笔记</Link>
      <article className="article-paper">
        <header><p>{post.tags.join(' / ')}</p><h1>{post.title}</h1><div><time>{post.date}</time><span>约 {Math.max(1, Math.ceil(post.body.length / 500))} 分钟阅读</span></div></header>
        <MarkdownArticle body={post.body} />
        <ReactionBar id={`blog:${post.slug}`} />
      </article>
      <GiscusPlaceholder />
    </main>
  )
}
