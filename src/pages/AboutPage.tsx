import MarkdownArticle from '../components/MarkdownArticle'
import { getAboutDocument } from '../content/content'
import { usePageMeta, organizationJsonLd, breadcrumbJsonLd } from '../lib/seo'
import '../styles/about.css'

const researchStages = [
  ['01', '题目分析', '从生活现象里拆出真正值得研究的变量。'],
  ['02', '预实验', '先让装置说话，再决定模型往哪里走。'],
  ['03', '理论分析', '用方程、假设和量纲把直觉变成可检验的预测。'],
  ['04', '实验', '搭建、测量、记录误差，让每个结论有迹可循。'],
  ['05', '结论', '把数据、模型和限制放在同一张桌面上讨论。'],
  ['06', '扩展', '继续追问边界条件，把一次比赛变成下一次问题。'],
] as const

const values = [
  { no: 'A', title: '观察', text: '先看见现象，再决定用什么语言描述它。' },
  { no: 'B', title: '实验', text: '把抽象定律交给真实仪器和可重复的测量。' },
  { no: 'C', title: '表达', text: '用清晰的图、数据和辩论让答案经得起追问。' },
]

export default function AboutPage() {
  const intro = getAboutDocument('introduction')
  const history = getAboutDocument('history')

  usePageMeta({
    title: '关于我们 · 天津一中物理社 | 天津市第一中学物理社',
    description: '天津一中物理社简介与历史：CYPT 物理竞赛、科研训练、社团活动与历年成绩。一群因好奇而聚在一起的学生。',
    path: '/about/',
    image: '/about/team-mark.jpg',
    jsonLd: [organizationJsonLd, breadcrumbJsonLd([{ name: '主页', path: '/' }, { name: '关于我们', path: '/about/' }])],
  })

  return (
    <main className="about-page">
      <div className="about-grain" aria-hidden="true" />
      <div className="about-scroll-line" aria-hidden="true" />

      <section className="about-hero">
        <div className="about-hero__rays" aria-hidden="true" />
        <div className="about-hero__circle" aria-hidden="true"><span>PT</span><small>ОТКРЫТАЯ ФИЗИКА</small></div>
        <div className="about-hero__black-block">
          <div className="about-label">TJYZ PHYSICS<br />ABOUT / 2026</div>
          <div className="about-kicker">ПТ · 物理青年 · CYPT</div>
          <h1><span>保持好奇。</span><em>保持精确。</em></h1>
          <p>一个由物理青年们组成的学生科学共同体。我们从问题出发，用实验、计算和表达把未知变成可以继续追问的坐标。</p>
        </div>
        <div className="about-hero__wedge" aria-hidden="true" />
        <div className="about-hero__side">
          <span className="about-stamp">OPEN RESEARCH / 01</span>
          <p>告别唯一的标准答案，去真正研究、探讨一个问题。</p>
          <strong>这是 PT 模式。</strong>
          <div className="about-hero__side-meta"><span>12 人</span><small>每年两支 CYPT 队伍</small></div>
        </div>
        <div className="about-hero__index">01 / 07<br /><span>天津一中 · 物理社</span></div>
      </section>

      <div className="about-marquee" aria-label="物理社关键词">
        <div>OBSERVE <i>◆</i> MEASURE <i>◆</i> QUESTION <i>◆</i> SHARE <i>◆</i> CYPT <i>◆</i> IYPT <i>◆</i> OBSERVE <i>◆</i> MEASURE <i>◆</i> QUESTION <i>◆</i> SHARE <i>◆</i></div>
      </div>

      <section className="about-grid about-intro-section">
        <aside className="about-section-mark"><b>02</b><span>WHO WE ARE</span><i>建立一个可以继续提问的共同体</i></aside>
        <div className="about-grid-content">
          {intro ? <MarkdownArticle body={`# ${intro.title}\n\n${intro.body}`} className="about-markdown" /> : <p>介绍文档暂不可用。</p>}
          <figure className="about-feature-image">
            <img src="/about/optics-lab.jpg" alt="物理社成员搭建光学实验装置" loading="eager" />
            <figcaption>把抽象的定律，交给真实的仪器验证。<span>OPTICS LAB / FIELD NOTE</span></figcaption>
          </figure>
        </div>
      </section>

      <section className="about-values-band">
        <div className="about-section-head"><span>03 / OUR METHOD</span><h2>我们怎样工作</h2><p>社团活动围绕观察、实验、表达展开；每一次活动都留下后来者可以继续使用的记录。</p></div>
        <div className="about-values-grid">
          {values.map((value) => <article key={value.no}><span className="about-value-no">{value.no}</span><h3>{value.title}</h3><p>{value.text}</p></article>)}
        </div>
      </section>

      <section className="about-cypt-section">
        <div className="about-section-head about-section-head--light"><span>04 / CYPT RESEARCH UNIT</span><h2>没有标准答案的赛场</h2><p>CYPT 对标 IYPT，围绕 17 道涵盖电、磁、流、光、热的开放性问题展开研究。每年天津一中选派 12 名同学组成两支队伍，每队 6 人。</p></div>
        <div className="about-cypt-layout">
          <div className="about-cypt-dossier">
            <div className="about-dossier-top"><span>CYPT / 2026</span><b>OPEN PROBLEM</b></div>
            <h3>把一次比赛，做成一段完整科研流程。</h3>
            <p>队员从题目分析、预实验、理论分析、实验、结论到扩展，经历六个阶段；查阅文献、构建模型、设计装置、制作 PPT，并在赛场上完成报告与辩论。</p>
            <div className="about-cypt-tools"><span>MATLAB</span><span>COMSOL</span><span>实验记录</span><span>学术辩论</span></div>
          </div>
          <figure className="about-cypt-image"><img src="/blog/pt-physics-club/cypt-2026-venue.jpg" alt="2026 CYPT 中国高中生青年物理学家学术交流会现场" loading="eager" /><figcaption>CYPT / 全国交流现场</figcaption></figure>
        </div>
        <div className="about-stage-list">{researchStages.map(([no, title, text]) => <article key={no}><span>{no}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>

      <section className="about-manifesto"><div className="about-manifesto__mark" aria-hidden="true">!</div><p>我们不急着得到所有答案。</p><strong>我们先学习，如何提出更好的问题。</strong><span className="about-manifesto__ru">ВОПРОС → ОПЫТ → ЗНАНИЕ</span></section>

      <section className="about-results-section">
        <div className="about-results-copy"><span>05 / RECORD OF WORK</span><h2>好的问题，会留下痕迹。</h2><p>这些结果不是终点，而是下一位成员可以接着使用的坐标。</p><img src="/blog/pt-physics-club/optical-experiment.jpg" alt="PT 社研究中搭建的光学实验装置" loading="eager" /></div>
        <div className="about-results-list">
          <article><small>2025 / TEAM</small><strong>全国第八名 · 全国第九名</strong><p>两支队伍双双斩获全国一等奖。</p><span>TEAM AWARD / 01</span></article>
          <article><small>2025 / INDIVIDUAL</small><strong>全国最佳选手</strong><p>郝晋荣同学入选 IYPT 国家集训队。</p><span>INDIVIDUAL / 01</span></article>
          <article><small>2024 / CONTINUITY</small><strong>全国第五名 · 全国二等奖</strong><p>王梓铭同学入选 IYPT 2025 国家集训队。</p><span>TEAM AWARD / 02</span></article>
        </div>
      </section>

      <section className="about-grid about-history">
        <aside className="about-section-mark"><b>06</b><span>OUR HISTORY</span><i>从竞赛队，到开放实验室</i></aside>
        <div className="about-grid-content">
          {history ? <MarkdownArticle body={`# ${history.title}\n\n${history.body}`} className="about-markdown" /> : <p>历史文档暂不可用。</p>}
          <div className="about-image-duo">
            <figure><img src="/about/blackboard.jpg" alt="写满物理公式的黑板" loading="eager" /><figcaption>从一块黑板开始，把问题讲清楚。</figcaption></figure>
            <figure><img src="/about/green-laser.jpg" alt="实验室中的绿色激光装置" loading="eager" /><figcaption>让光路、数据与想象彼此照亮。</figcaption></figure>
          </div>
        </div>
      </section>

      <section className="about-open-section">
        <div className="about-open-triangle" aria-hidden="true" />
        <div className="about-section-head"><span>07 / NEXT OBSERVER</span><h2>你不需要先成为专家。</h2><p>你需要的是求知欲、自我驱动力和安排时间的能力。剩下的部分，我们一起学。</p></div>
        <div className="about-open-grid"><div><span className="about-open-number">12</span><small>每年 CYPT 队员</small></div><div><span className="about-open-number">17</span><small>道开放性问题</small></div><div><span className="about-open-number">∞</span><small>可以继续追问的方向</small></div></div>
        <div className="about-open-notes"><p>除了比赛，我们也做原创周边义卖并将所得捐出，与其他社团联动，把动漫、叙事和物理放到同一张实验桌上。</p><span>PT 物理社 · 欢迎新的观察者</span></div>
      </section>

      <section className="about-values"><span>OBSERVE</span><span>MEASURE</span><span>QUESTION</span><span>SHARE</span></section>
    </main>
  )
}
