import { useEffect, useRef } from 'react'

const attributes: Record<string, string> = {
  'data-repo': 'TJYZphysics/TJYZphysics.github.io',
  'data-repo-id': 'R_kgDOTUhB2g',
  'data-category': 'Announcements',
  'data-category-id': 'DIC_kwDOTUhB2s4DBA9g',
  'data-mapping': 'pathname',
  'data-strict': '0',
  'data-reactions-enabled': '1',
  'data-emit-metadata': '0',
  'data-input-position': 'top',
  'data-theme': 'preferred_color_scheme',
  'data-lang': 'zh-CN',
  'data-loading': 'lazy',
}

export default function GiscusComments() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const script = document.createElement('script')
    script.src = 'https://giscus.app/client.js'
    script.async = true
    script.crossOrigin = 'anonymous'
    Object.entries(attributes).forEach(([name, value]) => script.setAttribute(name, value))
    container.appendChild(script)
    return () => {
      container.replaceChildren()
    }
  }, [])

  return (
    <section className="giscus-section" id="comments" aria-label="文章评论">
      <div className="giscus-heading"><span>DISCUSSION</span><h2>留下你的观察</h2></div>
      <div ref={containerRef} className="giscus-container" />
    </section>
  )
}
