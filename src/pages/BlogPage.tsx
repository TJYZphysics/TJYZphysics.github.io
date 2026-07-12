import { ArrowUpRight, BookMarked } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getBlogPosts } from '../content/content'

export default function BlogPage() {
  const posts = getBlogPosts()
  return (
    <main className="blog-page page-pad">
      <header className="page-intro"><p>FIELD NOTES · 实验与思考</p><h1>物理笔记</h1><span>把过程写下来，答案才有机会被重新检验。</span></header>
      <section className="notebook-shell">
        <div className="notebook-binding" aria-hidden="true">{Array.from({ length: 11 }, (_, i) => <i key={i} />)}</div>
        <div className="notebook-paper">
          <div className="notebook-heading"><BookMarked /><div><small>TJYZ PHYSICS / NOTEBOOK</small><h2>最近记录</h2></div><b>{String(posts.length).padStart(2, '0')}</b></div>
          <div className="post-list">
            {posts.length === 0 ? <p className="empty-state">新的观察正在发生，第一篇记录很快到来。</p> : posts.map((post, index) => (
              <Link className="post-row" to={`/blog/${post.slug}`} key={post.slug}>
                <span className="post-number">{String(index + 1).padStart(2, '0')}</span>
                <div><p>{post.tags.join(' · ') || '观察记录'}</p><h2>{post.title}</h2><span>{post.summary}</span></div>
                <time>{post.date || '未标注日期'}</time><ArrowUpRight />
              </Link>
            ))}
          </div>
        </div>
      </section>
      <p className="blog-maintain-note">新增文章只需将 UTF-8 Markdown 文件放入 <code>/blog</code>，构建时会自动归档。</p>
    </main>
  )
}
