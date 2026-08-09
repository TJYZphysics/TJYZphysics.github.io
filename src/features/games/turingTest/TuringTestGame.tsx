import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Download,
  Play,
  RotateCcw,
  Share2,
  Sparkles,
} from 'lucide-react'

import { ANSWER_OPTIONS, QUESTIONS, type AnswerValue } from './data'
import { createStartQrCode, createTuringPosterBlob, getTuringTestUrl } from './poster'
import { scoreAssessment, type AssessmentResult } from './scoring'
import './turingTest.css'

type GamePhase = 'intro' | 'quiz' | 'result'
type OptionalWebShareNavigator = Navigator & {
  share?: (data?: ShareData) => Promise<void>
  canShare?: (data?: ShareData) => boolean
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ))

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return undefined
    const update = () => setReducedMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return reducedMotion
}

function pointsFor(values: readonly number[], radius: number, center = 150) {
  return values.map((value, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / values.length
    const distance = radius * (value / 100)
    return `${center + Math.cos(angle) * distance},${center + Math.sin(angle) * distance}`
  }).join(' ')
}

function RadarChart({ result }: { result: AssessmentResult }) {
  const values = result.dimensions.map(({ value }) => value)
  const gridValues = result.dimensions.map(() => 100)

  return (
    <figure className="tt-radar">
      <figcaption>
        <span>人格雷达</span>
        <small>中心靠近冯诺依曼侧，外缘靠近图灵侧</small>
      </figcaption>
      <svg viewBox="0 0 300 318" role="img" aria-label={`六维人格雷达图，图灵倾向值 ${result.overall}`}>
        {[25, 50, 75, 100].map((level) => (
          <polygon key={level} className="tt-radar__grid" points={pointsFor(gridValues, 106 * (level / 100))} />
        ))}
        {result.dimensions.map((dimension, index) => {
          const angle = -Math.PI / 2 + (Math.PI * 2 * index) / result.dimensions.length
          const x = 150 + Math.cos(angle) * 106
          const y = 150 + Math.sin(angle) * 106
          const labelX = 150 + Math.cos(angle) * 133
          const labelY = 150 + Math.sin(angle) * 133
          return (
            <g key={dimension.id}>
              <line className="tt-radar__axis" x1="150" y1="150" x2={x} y2={y} />
              <text
                className="tt-radar__label"
                x={labelX}
                y={labelY}
                textAnchor={labelX < 140 ? 'end' : labelX > 160 ? 'start' : 'middle'}
              >
                {dimension.label}
              </text>
            </g>
          )
        })}
        <polygon className="tt-radar__shape" points={pointsFor(values, 106)} />
        {values.map((value, index) => {
          const angle = -Math.PI / 2 + (Math.PI * 2 * index) / values.length
          const distance = 106 * (value / 100)
          return <circle key={result.dimensions[index].id} className="tt-radar__point" cx={150 + Math.cos(angle) * distance} cy={150 + Math.sin(angle) * distance} r="4" />
        })}
      </svg>
    </figure>
  )
}

function DimensionBars({ result }: { result: AssessmentResult }) {
  return (
    <section className="tt-dimensions" aria-labelledby="tt-dimensions-title">
      <header>
        <h3 id="tt-dimensions-title">六维倾向</h3>
        <span>0 — 100</span>
      </header>
      <div className="tt-dimensions__list">
        {result.dimensions.map((dimension) => (
          <div className="tt-dimension" key={dimension.id}>
            <div className="tt-dimension__heading">
              <strong>{dimension.label}</strong>
              <span>{dimension.leaning} · {dimension.value}</span>
            </div>
            <div className="tt-dimension__track" aria-label={`${dimension.label}：${dimension.value}，偏向${dimension.leaning}`}>
              <i style={{ left: `${dimension.value}%` }} />
            </div>
            <div className="tt-dimension__poles"><span>{dimension.vonPole}</span><span>{dimension.turingPole}</span></div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SharePreview({ result, qrCode }: { result: AssessmentResult; qrCode: string }) {
  return (
    <div className={`tt-share-preview tt-share-preview--${result.profile.kind}`} aria-label="9 比 16 分享海报预览">
      <div className="tt-share-preview__grid" aria-hidden="true" />
      <p>TJYZ PHYSICS CLUB</p>
      <h3>{result.profile.label}</h3>
      <strong>{result.profile.title}</strong>
      <div className="tt-share-preview__score"><b>{result.overall}</b><span>图灵倾向值</span></div>
      <div className="tt-share-preview__spectrum"><i style={{ left: `${result.overall}%` }} /></div>
      <div className="tt-share-preview__mini-bars">
        {result.dimensions.map((dimension) => (
          <div key={dimension.id}><span>{dimension.label}</span><i><b style={{ width: `${dimension.value}%` }} /></i></div>
        ))}
      </div>
      <div className="tt-share-preview__qr">
        {qrCode ? <img src={qrCode} alt="扫描后开始图灵测试" /> : <span aria-hidden="true" />}
        <small>扫码测测你的派系</small>
      </div>
    </div>
  )
}

export function TuringTestGame() {
  const [phase, setPhase] = useState<GamePhase>('intro')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<(AnswerValue | null)[]>(() => QUESTIONS.map(() => null))
  const [leaving, setLeaving] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const [exportState, setExportState] = useState<'idle' | 'working'>('idle')
  const [actionMessage, setActionMessage] = useState('')
  const transitionTimer = useRef<number | null>(null)
  const reducedMotion = useReducedMotion()
  const supportsWebShare = typeof navigator !== 'undefined'
    && typeof (navigator as OptionalWebShareNavigator).share === 'function'
  const startUrl = useMemo(getTuringTestUrl, [])

  const result = useMemo(() => {
    if (phase !== 'result' || answers.some((answer) => answer === null)) return null
    return scoreAssessment(answers as AnswerValue[])
  }, [answers, phase])

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current)
  }, [])

  useEffect(() => {
    if (!result) return undefined
    let active = true
    createStartQrCode(startUrl, 160)
      .then((dataUrl) => { if (active) setQrCode(dataUrl) })
      .catch(() => { if (active) setQrCode('') })
    return () => { active = false }
  }, [result, startUrl])

  const start = () => {
    setAnswers(QUESTIONS.map(() => null))
    setQuestionIndex(0)
    setLeaving(false)
    setActionMessage('')
    setPhase('quiz')
  }

  const chooseAnswer = (answer: AnswerValue) => {
    if (leaving) return
    const nextAnswers = [...answers]
    nextAnswers[questionIndex] = answer
    setAnswers(nextAnswers)

    const advance = () => {
      setLeaving(false)
      if (questionIndex === QUESTIONS.length - 1) setPhase('result')
      else setQuestionIndex((current) => current + 1)
    }

    if (reducedMotion) advance()
    else {
      setLeaving(true)
      transitionTimer.current = window.setTimeout(advance, 230)
    }
  }

  const previousQuestion = () => {
    if (questionIndex === 0 || leaving) return
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current)
    setLeaving(false)
    setQuestionIndex((current) => current - 1)
  }

  const downloadPoster = async () => {
    if (!result || exportState === 'working') return
    setExportState('working')
    setActionMessage('正在绘制 1080 × 1920 海报…')
    try {
      const blob = await createTuringPosterBlob(result, startUrl)
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `turing-test-${result.profile.kind}.png`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      setActionMessage('海报已保存。')
    } catch {
      setActionMessage('海报生成失败，请稍后再试。')
    } finally {
      setExportState('idle')
    }
  }

  const sharePoster = async () => {
    const shareNavigator = navigator as OptionalWebShareNavigator
    if (!result || exportState === 'working' || !shareNavigator.share) return
    setExportState('working')
    setActionMessage('正在准备分享图片…')
    try {
      const blob = await createTuringPosterBlob(result, startUrl)
      const file = new File([blob], `turing-test-${result.profile.kind}.png`, { type: 'image/png' })
      if (!shareNavigator.canShare || shareNavigator.canShare({ files: [file] })) {
        await shareNavigator.share({ title: '我的图灵测试结果', text: result.profile.tagline, files: [file] })
      } else {
        await shareNavigator.share({ title: '图灵测试', text: result.profile.tagline, url: startUrl })
      }
      setActionMessage('分享面板已打开。')
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setActionMessage('暂时无法分享，请下载海报后再试。')
      else setActionMessage('')
    } finally {
      setExportState('idle')
    }
  }

  return (
    <section className="turing-test" aria-label="图灵与冯诺依曼的神奇测试">
      <div className="turing-test__grid" aria-hidden="true" />

      {phase === 'intro' && (
        <div className="tt-intro">
          <div className="tt-intro__signal"><Sparkles aria-hidden="true" /><span>PERSONALITY SIGNAL / 24</span></div>
          <h2>图灵测试</h2>
          <p className="tt-intro__note">图灵与冯诺依曼的神奇测试</p>
          <p className="tt-intro__lead">中文互联网上有个老梗：学计算机的人，最后会走向两个截然不同的派系。这里不问任何技术，只把这场传说还原成性格、情绪与生活里的 24 个瞬间。</p>
          <div className="tt-intro__factions">
            <article>
              <span>VON NEUMANN</span>
              <h3>冯诺依曼派</h3>
              <p>直白、果断、气场外放。传说会逐渐变得又秃又强。</p>
            </article>
            <i aria-hidden="true">VS</i>
            <article>
              <span>ALAN TURING</span>
              <h3>图灵派</h3>
              <p>细腻、含蓄、气场柔和。传说会逐渐变得又美又娘。</p>
            </article>
          </div>
          <button className="tt-primary-action" type="button" onClick={start}>
            <Play aria-hidden="true" />开始接收信号
          </button>
          <small className="tt-intro__disclaimer">网络趣味测评 · 结果不构成任何严肃的人格定义</small>
        </div>
      )}

      {phase === 'quiz' && (
        <div className="tt-quiz">
          <header className="tt-quiz__header">
            <button type="button" onClick={previousQuestion} disabled={questionIndex === 0 || leaving} aria-label="返回上一题">
              <ArrowLeft aria-hidden="true" />
            </button>
            <div>
              <span>信号采集中</span>
              <strong>{String(questionIndex + 1).padStart(2, '0')}<i>/</i>{QUESTIONS.length}</strong>
            </div>
          </header>
          <div className="tt-progress" role="progressbar" aria-valuemin={0} aria-valuemax={QUESTIONS.length} aria-valuenow={questionIndex}>
            <i style={{ width: `${(questionIndex / QUESTIONS.length) * 100}%` }} />
          </div>
          <article className={`tt-question${leaving ? ' is-leaving' : ''}`} key={QUESTIONS[questionIndex].id}>
            <span>{QUESTIONS[questionIndex].scene}</span>
            <h3>{QUESTIONS[questionIndex].prompt}</h3>
            <div className="tt-answer-scale" role="radiogroup" aria-label="选择符合程度">
              {ANSWER_OPTIONS.map((option, optionIndex) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={answers[questionIndex] === option.value}
                  className={answers[questionIndex] === option.value ? 'is-selected' : ''}
                  onClick={() => chooseAnswer(option.value)}
                  style={{ '--answer-order': optionIndex } as React.CSSProperties}
                >
                  <i aria-hidden="true"><Check /></i>
                  <span>{option.shortLabel}</span>
                </button>
              ))}
            </div>
          </article>
          <p className="tt-quiz__counter" aria-live="polite">已记录 {answers.filter((answer) => answer !== null).length} 个性格瞬间</p>
        </div>
      )}

      {phase === 'result' && result && (
        <div className={`tt-result tt-result--${result.profile.kind}`}>
          <header className="tt-result__hero">
            <div className="tt-result__copy">
              <p>信号解析完成</p>
              <h2>{result.profile.label}</h2>
              <strong>{result.profile.title}</strong>
              <span>{result.profile.tagline}</span>
            </div>
            <div className="tt-result__score">
              <b>{result.overall}</b>
              <span>图灵倾向值</span>
              <small>/ 100</small>
            </div>
          </header>

          <section className="tt-spectrum" aria-label={`派系倾向光谱：${result.overall}`}>
            <div><span>冯诺依曼侧</span><span>均衡区</span><span>图灵侧</span></div>
            <div className="tt-spectrum__track"><i style={{ left: `${result.overall}%` }}><b>{result.overall}</b></i></div>
          </section>

          <div className="tt-result__charts">
            <RadarChart result={result} />
            <DimensionBars result={result} />
          </div>

          <section className="tt-profile">
            <div>
              <h3>人格侧写</h3>
              <p>{result.profile.description}</p>
            </div>
            <div>
              <h3>你的高光</h3>
              <ul>{result.profile.strengths.map((strength) => <li key={strength}><Check aria-hidden="true" />{strength}</li>)}</ul>
            </div>
            <div>
              <h3>偶尔留意</h3>
              <p>{result.profile.watchout}</p>
            </div>
          </section>

          <section className="tt-share-zone">
            <SharePreview result={result} qrCode={qrCode} />
            <div className="tt-share-zone__copy">
              <Sparkles aria-hidden="true" />
              <h3>把你的派系发出去</h3>
              <p>生成 1080 × 1920 竖版结果图。海报内含测试入口二维码，扫描即可重新开始。</p>
              <div className="tt-share-zone__actions">
                <button type="button" onClick={downloadPoster} disabled={exportState === 'working'}>
                  <Download aria-hidden="true" />{exportState === 'working' ? '生成中…' : '下载结果图'}
                </button>
                {supportsWebShare && (
                  <button type="button" className="is-secondary" onClick={sharePoster} disabled={exportState === 'working'}>
                    <Share2 aria-hidden="true" />分享
                  </button>
                )}
              </div>
              <span className="tt-share-zone__status" aria-live="polite">{actionMessage}</span>
            </div>
          </section>

          <button className="tt-restart" type="button" onClick={start}><RotateCcw aria-hidden="true" />再测一次</button>
        </div>
      )}
    </section>
  )
}

export default TuringTestGame
