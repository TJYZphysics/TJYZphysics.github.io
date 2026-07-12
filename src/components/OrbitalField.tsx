import { useEffect, useRef } from 'react'

interface Particle { x: number; y: number; r: number; speed: number; phase: number; color: string }

export default function OrbitalField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (navigator.userAgent.toLowerCase().includes('jsdom')) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    let frame = 0
    let raf = 0
    let pointerX = 0
    let pointerY = 0
    const particles: Particle[] = Array.from({ length: 58 }, (_, index) => ({
      x: ((index * 73) % 100) / 100,
      y: ((index * 41) % 97) / 97,
      r: 0.7 + (index % 4) * 0.45,
      speed: 0.00008 + (index % 6) * 0.000018,
      phase: index * 0.73,
      color: index % 5 === 0 ? '#86e9ff' : '#8298ff',
    }))
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = rect.width * ratio
      canvas.height = rect.height * ratio
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    const move = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointerX = (event.clientX - rect.left) / rect.width - 0.5
      pointerY = (event.clientY - rect.top) / rect.height - 0.5
    }
    const draw = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      context.clearRect(0, 0, width, height)
      context.save()
      context.translate(pointerX * -9, pointerY * -9)
      particles.forEach((particle) => {
        const drift = frame * particle.speed
        const x = (particle.x + Math.sin(drift + particle.phase) * 0.025) * width
        const y = (particle.y + Math.cos(drift * 1.3 + particle.phase) * 0.025) * height
        context.beginPath()
        context.fillStyle = particle.color
        context.globalAlpha = 0.22 + particle.r * 0.12
        context.arc(x, y, particle.r, 0, Math.PI * 2)
        context.fill()
      })
      context.restore()
      frame += 1
      raf = requestAnimationFrame(draw)
    }
    resize()
    window.addEventListener('resize', resize)
    canvas.addEventListener('pointermove', move)
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) draw()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointermove', move)
    }
  }, [])

  return <canvas ref={canvasRef} className="orbital-field" aria-label="缓慢运动的抽象星体轨迹背景" />
}
