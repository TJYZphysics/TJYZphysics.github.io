import { useEffect, useRef, useState } from 'react'
import embedStyles from './embed.css?raw'

export function MagicEchoesGame() {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [viewport, setViewport] = useState({ width: 1180, height: 880, scale: 1 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const fit = () => {
      const fullscreen = document.fullscreenElement === frameRef.current
      const height = Math.max(320, window.innerHeight - (fullscreen ? 0 : 32))
      const scale = fullscreen ? 1 : Math.min(1, height / 880)
      const width = fullscreen ? window.innerWidth : container.clientWidth
      if (!width) return
      frameRef.current?.contentDocument?.documentElement?.style.setProperty('--magic-echoes-fullscreen-scale', String(Math.min(1, window.innerHeight / 880)))
      setViewport({ width: width / scale, height: height / scale, scale })
    }

    const observer = new ResizeObserver(fit)
    observer.observe(container)
    window.addEventListener('resize', fit)
    document.addEventListener('fullscreenchange', fit)
    fit()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', fit)
      document.removeEventListener('fullscreenchange', fit)
    }
  }, [])

  const prepareFrame = () => {
    const doc = frameRef.current?.contentDocument
    if (!doc || doc.getElementById('magic-echoes-embed-styles')) return
    const style = doc.createElement('style')
    style.id = 'magic-echoes-embed-styles'
    style.textContent = embedStyles
    doc.head.appendChild(style)
    doc.documentElement.style.setProperty('--magic-echoes-fullscreen-scale', String(Math.min(1, window.innerHeight / 880)))
  }

  return (
    <div ref={containerRef} className="magic-echoes-viewport" style={{ height: viewport.height * viewport.scale }}>
      <iframe
        ref={frameRef}
        className="magic-echoes-frame"
        src={`${import.meta.env.BASE_URL}games/magic-echoes/index.html`}
        title="魔法回响"
        onLoad={prepareFrame}
        style={{ width: viewport.width, height: viewport.height, transform: `scale(${viewport.scale})` }}
        allowFullScreen
      />
    </div>
  )
}
