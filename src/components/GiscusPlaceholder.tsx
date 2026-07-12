import { MessageSquareText } from 'lucide-react'

export default function GiscusPlaceholder() {
  return (
    <section className="comments-placeholder" id="comments">
      <MessageSquareText aria-hidden="true" />
      <div><h2>留下你的观察</h2><p>评论区将在 GitHub Discussions 配置完成后启用。当前版本已预留接口，不会收集个人信息。</p></div>
    </section>
  )
}
