import { Heart, MessageCircle, Share2 } from 'lucide-react'
import { useLocalReaction } from '../features/reactions/useLocalReaction'

export default function ReactionBar({ id }: { id: string }) {
  const reaction = useLocalReaction(id)
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: document.title, url: location.href })
      else await navigator.clipboard.writeText(location.href)
    } catch { /* dismissed share sheet */ }
  }
  return (
    <div className="reaction-bar" aria-label="文章互动">
      <button className={reaction.liked ? 'is-liked' : ''} onClick={reaction.toggle} aria-pressed={reaction.liked}>
        <Heart fill={reaction.liked ? 'currentColor' : 'none'} />{reaction.liked ? '已喜欢 · 仅此设备' : '喜欢'}
      </button>
      <button onClick={() => document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' })}><MessageCircle />评论</button>
      <button onClick={share}><Share2 />分享</button>
    </div>
  )
}
