import { lazy, Suspense, useState } from 'react'
import { Atom, Boxes, CircleDot, Gauge, Magnet, Sparkles, Waves } from 'lucide-react'
import '../styles/experiments.css'

const ThreeBodyLab = lazy(() => import('../features/experiments/threeBody/ThreeBodyLab').then((module) => ({ default: module.ThreeBodyLab })))
const CollisionLab = lazy(() => import('../features/experiments/collision/CollisionLab').then((module) => ({ default: module.CollisionLab })))
const CausalOrigamiGame = lazy(() => import('../features/experiments/causalOrigami/CausalOrigamiGame').then((module) => ({ default: module.CausalOrigamiGame })))
const ElectromagneticGuideGame = lazy(() => import('../features/experiments/electromagneticGuide/ElectromagneticGuideGame').then((module) => ({ default: module.ElectromagneticGuideGame })))
const WavePropagationLab = lazy(() => import('../features/experiments/wavePropagation/WavePropagationLab').then((module) => ({ default: module.WavePropagationLab })))
const PursuitLab = lazy(() => import('../features/experiments/pursuit/PursuitLab').then((module) => ({ default: module.PursuitLab })))
const ProjectileLab = lazy(() => import('../features/experiments/projectile/ProjectileLab').then((module) => ({ default: module.ProjectileLab })))

type ExperimentId = 'three-body' | 'collision' | 'causal' | 'electromagnetic' | 'wave' | 'pursuit' | 'projectile'
const experiments = [
  { id: 'three-body' as const, number: '01', title: '三体模拟器', subtitle: '引力与混沌', icon: Atom },
  { id: 'collision' as const, number: '02', title: '碰撞模拟器', subtitle: '动量传递', icon: Boxes },
  { id: 'causal' as const, number: '03', title: '光路寻踪', subtitle: '镜片与棱镜', icon: Sparkles },
  { id: 'electromagnetic' as const, number: '04', title: '电磁指南', subtitle: '电场与洛伦兹力', icon: Magnet },
  { id: 'wave' as const, number: '05', title: '波的传播', subtitle: '干涉与衍射', icon: Waves },
  { id: 'pursuit' as const, number: '06', title: '追及相遇', subtitle: '相对运动', icon: Gauge },
  { id: 'projectile' as const, number: '07', title: '平抛运动', subtitle: '运动的分解', icon: CircleDot },
]

function readInitialExperiment(): ExperimentId {
  if (typeof window === 'undefined') return 'wave'
  const requested = new URLSearchParams(window.location.search).get('experiment')
  return experiments.some(({ id }) => id === requested) ? requested as ExperimentId : 'wave'
}

export default function ExperimentsPage() {
  const [active, setActive] = useState<ExperimentId>(readInitialExperiment)
  return (
    <main className="experiments-page page-pad">
      <header className="page-intro experiment-intro">
        <p>INTERACTIVE LABORATORY</p><h1>Sci-Hub</h1>
        <span>有意思的科学小游戏。</span>
      </header>
      <nav className="experiment-switcher" aria-label="选择互动实验">
        {experiments.map(({ id, number, title, subtitle, icon: Icon }) => (
          <button key={id} className={active === id ? 'is-active' : ''} onClick={() => setActive(id)} aria-pressed={active === id}>
            <span>{number}</span><Icon /><div><strong>{title}</strong><small>{subtitle}</small></div>
          </button>
        ))}
      </nav>
      <section className="experiment-stage">
        <Suspense fallback={<div className="experiment-loading">正在校准实验仪器…</div>}>
          {active === 'three-body' && <ThreeBodyLab />}
          {active === 'collision' && <CollisionLab />}
          {active === 'causal' && <CausalOrigamiGame />}
          {active === 'electromagnetic' && <ElectromagneticGuideGame />}
          {active === 'wave' && <WavePropagationLab />}
          {active === 'pursuit' && <PursuitLab />}
          {active === 'projectile' && <ProjectileLab />}
        </Suspense>
      </section>
      <p className="experiment-safety">数值模拟用于探索与演示；它简化了真实世界中的部分条件。</p>
    </main>
  )
}
