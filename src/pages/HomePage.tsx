import { ArrowRight, Atom, BookOpenText, FlaskConical, Orbit } from 'lucide-react'
import { Link } from 'react-router-dom'
import OrbitalField from '../components/OrbitalField'

export default function HomePage() {
  return (
    <main className="home-page">
      <section className="hero">
        <OrbitalField />
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-copy">
          <p className="hero-kicker"><span />TJYZ PHYSICS CLUB</p>
          <h1>在已知的边界<br />继续<span>发问。</span></h1>
          <p className="hero-lead">观察现象，搭建实验，让每一个好问题拥有被认真对待的机会。</p>
          <div className="hero-actions">
            <Link className="button button--primary" to="/experiments">进入实验室 <ArrowRight /></Link>
            <Link className="button button--ghost" to="/about">认识我们</Link>
          </div>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbit-ring orbit-ring--one"><i /></div>
          <div className="orbit-ring orbit-ring--two"><i /></div>
          <div className="orbit-core"><Atom /></div>
          <span className="orbit-label orbit-label--a">OBSERVE</span>
          <span className="orbit-label orbit-label--b">QUESTION</span>
        </div>
        <div className="hero-index"><b>01</b><span>观察不是终点<br />它是问题的开始</span></div>
      </section>

      <section className="principles section-shell">
        <div className="section-title"><p>OUR PRACTICE</p><h2>把好奇心变成<br />可以验证的路径</h2></div>
        <div className="principle-list">
          <article><span>01</span><Orbit /><h3>观察</h3><p>从日常现象中辨认值得追问的细节。</p></article>
          <article><span>02</span><FlaskConical /><h3>实验</h3><p>控制变量、记录误差，让猜想接受检验。</p></article>
          <article><span>03</span><BookOpenText /><h3>分享</h3><p>把过程写清楚，让后来者能够继续探索。</p></article>
        </div>
      </section>

      <section className="home-lab section-shell">
        <div className="lab-visual" aria-hidden="true"><div className="wave wave-a" /><div className="wave wave-b" /><div className="lab-cross" /><span>Δt</span></div>
        <div className="lab-copy"><p>INTERACTIVE LAB</p><h2>不只阅读物理。<br />亲手改变它。</h2><p>调整质量、速度与时空路径，在浏览器里观察系统如何回应你的每一次选择。</p><Link to="/experiments">打开互动实验 <ArrowRight /></Link></div>
      </section>

      <section className="home-journal section-shell">
        <div><p>RECENT NOTES</p><h2>从一次记录<br />走向下一次发现</h2></div>
        <Link className="journal-feature" to="/blog/three-body-notes"><span>力学 / 混沌</span><h3>三体系统：秩序如何滑向混沌</h3><p>观察微小差异如何改变整个系统的未来。</p><ArrowRight /></Link>
      </section>
    </main>
  )
}
