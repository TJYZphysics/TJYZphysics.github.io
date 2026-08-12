import { lazy, Suspense } from 'react'
import { BrainCircuit, Box, Magnet, ScanLine, Sparkles } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import '../styles/experiments.css'
import '../styles/games.css'

const TuringTestGame = lazy(() => import('../features/games/turingTest').then((module) => ({ default: module.TuringTestGame })))
const Gomoku3DGame = lazy(() => import('../features/games/gomoku3d').then((module) => ({ default: module.Gomoku3DGame })))
const ElectromagneticGuideGame = lazy(() => import('../features/games/electromagneticGuide/ElectromagneticGuideGame').then((module) => ({ default: module.ElectromagneticGuideGame })))
const CausalOrigamiGame = lazy(() => import('../features/games/causalOrigami/CausalOrigamiGame').then((module) => ({ default: module.CausalOrigamiGame })))
const OpticalDefenseGame = lazy(() => import('../features/games/opticalDefense').then((module) => ({ default: module.OpticalDefenseGame })))

type GameId = 'turing' | 'gomoku-3d' | 'electromagnetic' | 'causal' | 'optical-defense'

const games = [
  { id: 'turing' as const, number: '01', title: '图灵测试', subtitle: '图灵与冯诺依曼的神奇测试', icon: BrainCircuit },
  { id: 'gomoku-3d' as const, number: '02', title: '三维五子', subtitle: '建议电脑端游玩', icon: Box },
  { id: 'electromagnetic' as const, number: '03', title: '电磁指南', subtitle: '电场与洛伦兹力', icon: Magnet },
  { id: 'causal' as const, number: '04', title: '光路寻踪', subtitle: '镜片与棱镜', icon: Sparkles },
  { id: 'optical-defense' as const, number: '05', title: '光路塔防', subtitle: '几何光学实验台', icon: ScanLine },
]

function resolveGame(value: string | null): GameId {
  return games.some(({ id }) => id === value) ? value as GameId : 'turing'
}

export default function GamesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const active = resolveGame(searchParams.get('game'))

  const selectGame = (game: GameId) => {
    const next = new URLSearchParams(searchParams)
    next.set('game', game)
    setSearchParams(next, { replace: true })
  }

  return (
    <main className="experiments-page games-page page-pad">
      <header className="page-intro experiment-intro games-intro">
        <p>Games And Something Unbelievable</p>
        <h1>游戏科学</h1>
        <span>奇奇怪怪的小东西。</span>
      </header>

      <nav className="experiment-switcher game-switcher" aria-label="选择互动游戏">
        {games.map(({ id, number, title, subtitle, icon: Icon }) => (
          <button key={id} className={active === id ? 'is-active' : ''} onClick={() => selectGame(id)} aria-pressed={active === id}>
            <span>{number}</span><Icon aria-hidden="true" /><div><strong>{title}</strong><small>{subtitle}</small></div>
          </button>
        ))}
      </nav>

      <section className={`experiment-stage game-stage game-stage--${active}`}>
        <Suspense fallback={<div className="experiment-loading">正在装载游戏世界…</div>}>
          {active === 'turing' && <TuringTestGame />}
          {active === 'gomoku-3d' && <Gomoku3DGame />}
          {active === 'electromagnetic' && <ElectromagneticGuideGame />}
          {active === 'causal' && <CausalOrigamiGame />}
          {active === 'optical-defense' && <OpticalDefenseGame />}
        </Suspense>
      </section>
    </main>
  )
}
