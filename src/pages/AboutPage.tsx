import MarkdownArticle from '../components/MarkdownArticle'
import { getAboutDocument } from '../content/content'
import '../styles/about.css'

export default function AboutPage() {
  const intro = getAboutDocument('introduction')
  const history = getAboutDocument('history')
  return (
    <main className="about-page">
      <section className="about-hero">
        <div className="about-label">TJYZ PHYSICS<br />ABOUT / 2026</div>
        <h1>保持好奇。<br /><span>保持精确。</span></h1>
        <p>一个由物理青年们组成的学生科学共同体。</p>
        <figure className="about-hero-image">
          <img src="/about/team-mark.jpg" alt="天津市第一中学物理青年 CYPT 联队标识" />
          <figcaption>CYPT · 物理青年</figcaption>
        </figure>
        <div className="about-red-block" aria-hidden="true"><span>?</span></div>
      </section>
      <section className="about-grid">
        <aside><b>01</b><span>WHO WE ARE</span></aside>
        <div className="about-grid-content">
          {intro ? <MarkdownArticle body={`# ${intro.title}\n\n${intro.body}`} className="about-markdown" /> : <p>介绍文档暂不可用。</p>}
          <figure className="about-feature-image">
            <img src="/about/optics-lab.jpg" alt="物理社成员搭建光学实验装置" loading="lazy" />
            <figcaption>把抽象的定律，交给真实的仪器验证。</figcaption>
          </figure>
        </div>
      </section>
      <section className="about-manifesto"><p>我们不急着得到所有答案。</p><strong>我们先学习，如何提出更好的问题。</strong></section>
      <section className="about-grid about-history">
        <aside><b>02</b><span>OUR HISTORY</span></aside>
        <div className="about-grid-content">
          {history ? <MarkdownArticle body={`# ${history.title}\n\n${history.body}`} className="about-markdown" /> : <p>历史文档暂不可用。</p>}
          <div className="about-image-duo">
            <figure>
              <img src="/about/blackboard.jpg" alt="写满物理公式的黑板" loading="lazy" />
              <figcaption>从一块黑板开始，把问题讲清楚。</figcaption>
            </figure>
            <figure>
              <img src="/about/green-laser.jpg" alt="实验室中的绿色激光装置" loading="lazy" />
              <figcaption>让光路、数据与想象彼此照亮。</figcaption>
            </figure>
          </div>
        </div>
      </section>
      <section className="about-values"><span>OBSERVE</span><span>MEASURE</span><span>QUESTION</span><span>SHARE</span></section>
    </main>
  )
}
