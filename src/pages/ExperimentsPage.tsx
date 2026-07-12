import { lazy, Suspense, useState } from 'react'
import { Atom, Boxes, Sparkles } from 'lucide-react'

const ThreeBodyLab = lazy(() => import('../features/experiments/threeBody/ThreeBodyLab').then((module) => ({ default: module.ThreeBodyLab })))
const CollisionLab = lazy(() => import('../features/experiments/collision/CollisionLab').then((module) => ({ default: module.CollisionLab })))
const CausalOrigamiGame = lazy(() => import('../features/experiments/causalOrigami/CausalOrigamiGame').then((module) => ({ default: module.CausalOrigamiGame })))

type ExperimentId = 'three-body' | 'collision' | 'causal'
const experiments = [
  { id: 'three-body' as const, number: '01', title: '三体模拟器', subtitle: '引力与混沌', icon: Atom },
  { id: 'collision' as const, number: '02', title: '碰撞模拟器', subtitle: '动量传递', icon: Boxes },
  { id: 'causal' as const, number: '03', title: '因果折纸', subtitle: '原创时空游戏', icon: Sparkles },
]

export default function ExperimentsPage() {
  const [active, setActive] = useState<ExperimentId>('three-body')
  return (
    <main className="experiments-page page-pad">
      <header className="page-intro experiment-intro">
        <p>INTERACTIVE LABORATORY</p><h1>把参数交给你</h1>
        <span>改变条件，观察系统如何回答。所有计算都在你的浏览器中完成。</span>
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
        </Suspense>
      </section>
      <p className="experiment-safety">数值模拟用于探索与演示；它简化了真实世界中的部分条件。</p>
    </main>
  )
}
