import MarkdownArticle from '../components/MarkdownArticle'
import { getAboutDocument } from '../content/content'

export default function AboutPage() {
  const intro = getAboutDocument('introduction')
  const history = getAboutDocument('history')
  return (
    <main className="about-page">
      <section className="about-hero">
        <div className="about-label">TJYZ PHYSICS<br />ABOUT / 2026</div>
        <h1>保持好奇。<br /><span>保持精确。</span></h1>
        <p>一个由物理青年们组成的学生科学共同体。</p>
        <div className="about-red-block" aria-hidden="true"><span>?</span></div>
      </section>
      <section className="about-grid">
        <aside><b>01</b><span>WHO WE ARE</span></aside>
        {intro ? <MarkdownArticle body={`# ${intro.title}\n\n${intro.body}`} className="about-markdown" /> : <p>介绍文档暂不可用。</p>}
      </section>
      <section className="about-manifesto"><p>我们不急着得到所有答案。</p><strong>我们先学习，如何提出更好的问题。</strong></section>
      <section className="about-grid about-history">
        <aside><b>02</b><span>OUR HISTORY</span></aside>
        {history ? <MarkdownArticle body={`# ${history.title}\n\n${history.body}`} className="about-markdown" /> : <p>历史文档暂不可用。</p>}
      </section>
      <section className="about-values"><span>OBSERVE</span><span>MEASURE</span><span>QUESTION</span><span>SHARE</span></section>
    </main>
  )
}
