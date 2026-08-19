import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Download, Factory, Play, RotateCcw, Ruler, Share2, Sparkles } from 'lucide-react'

import {
  HATS_BY_SIZE,
  QUESTIONS_BY_SIZE,
  type HatDefinition,
  type HatSize,
} from './data'
import { HatIllustration } from './HatIllustration'
import {
  createHatFactoryPosterBlob,
  createStartQrCode,
  getHatFactoryUrl,
  type HatPosterStyle,
} from './poster'
import { scoreHatFactory, type HatFactoryResult } from './scoring'
import './hatFactory.css'

type GamePhase = 'intro' | 'size-select' | 'quiz' | 'result'
type OptionalWebShareNavigator = Navigator & {
  share?: (data?: ShareData) => Promise<void>
  canShare?: (data?: ShareData) => boolean
}

type HatCopy = HatDefinition & {
  tagline: string
  description: string
  caution?: string
}

const SIZE_META: Record<HatSize, { label: string; english: string; range: string; copy: string }> = {
  large: { label: '大号帽子', english: 'GRAND ISSUE', range: '九款重磅型号', copy: '适合把普通小事办成重大工程的人。' },
  medium: { label: '中号帽子', english: 'STANDARD ISSUE', range: '九款日常型号', copy: '适合在会议、群聊和人情世故里反复横跳的人。' },
  small: { label: '小号帽子', english: 'POCKET ISSUE', range: '九款便携型号', copy: '适合动作不大、效果很足的生活艺术家。' },
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

function getPosterStyle(): HatPosterStyle {
  return document.documentElement.dataset.colorMode === 'light' ? 'comic' : 'archive'
}

function getHatCopy(hat: HatDefinition) {
  return hat as HatCopy
}

function SizeHatStack({ size }: { size: HatSize }) {
  const hats = HATS_BY_SIZE[size]
  const offsets = [-1, 0, 1]
  return (
    <div className={`hf-size-stack hf-size-stack--${size}`} aria-hidden="true">
      {offsets.map((offset, index) => (
        <HatIllustration key={hats[index * 3].name} name={hats[index * 3].name} className={`hf-size-stack__hat hf-size-stack__hat--${offset + 2}`} />
      ))}
    </div>
  )
}

function PosterPreview({ result, qrCode }: { result: HatFactoryResult; qrCode: string }) {
  const copy = getHatCopy(result.hat)
  const meta = SIZE_META[result.size]
  return (
    <div className="hf-poster-preview" aria-label={`${result.hat.name}结果海报预览`}>
      <div className="hf-poster-preview__texture" aria-hidden="true" />
      <header><span>TJYZ PHYSICS CLUB</span><b>{meta.label}</b></header>
      <p>帽子工厂 · 鉴定凭证</p>
      <HatIllustration name={result.hat.name} />
      <small>本厂建议为你生产</small>
      <h3>{result.hat.name}</h3>
      <strong>「{copy.tagline}」</strong>
      <footer>
        {qrCode ? <img src={qrCode} alt="扫描后开始帽子工厂测试" /> : <i aria-hidden="true" />}
        <span>扫码进厂<br />量头定制</span>
      </footer>
    </div>
  )
}

export function HatFactoryGame() {
  const [phase, setPhase] = useState<GamePhase>('intro')
  const [selectedSize, setSelectedSize] = useState<HatSize | null>(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [leaving, setLeaving] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const [exportState, setExportState] = useState<'idle' | 'working'>('idle')
  const [actionMessage, setActionMessage] = useState('')
  const transitionTimer = useRef<number | null>(null)
  const reducedMotion = useReducedMotion()
  const startUrl = useMemo(getHatFactoryUrl, [])
  const supportsWebShare = typeof navigator !== 'undefined' && typeof (navigator as OptionalWebShareNavigator).share === 'function'

  const questions = selectedSize ? QUESTIONS_BY_SIZE[selectedSize] : []
  const result = useMemo(() => {
    if (phase !== 'result' || !selectedSize || answers.length !== QUESTIONS_BY_SIZE[selectedSize].length) return null
    return scoreHatFactory(selectedSize, answers)
  }, [answers, phase, selectedSize])

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current)
  }, [])

  useEffect(() => {
    if (!result) return undefined
    let active = true
    createStartQrCode(startUrl, 180)
      .then((dataUrl) => { if (active) setQrCode(dataUrl) })
      .catch(() => { if (active) setQrCode('') })
    return () => { active = false }
  }, [result, startUrl])

  const openFactory = () => {
    setPhase('size-select')
    setActionMessage('')
  }

  const startQuiz = () => {
    if (!selectedSize) return
    setAnswers([])
    setQuestionIndex(0)
    setLeaving(false)
    setActionMessage('')
    setPhase('quiz')
  }

  const chooseAnswer = (optionId: string) => {
    if (leaving || !selectedSize) return
    const nextAnswers = [...answers]
    nextAnswers[questionIndex] = optionId
    setAnswers(nextAnswers)

    const advance = () => {
      setLeaving(false)
      if (questionIndex === questions.length - 1) setPhase('result')
      else setQuestionIndex((current) => current + 1)
    }

    if (reducedMotion) advance()
    else {
      setLeaving(true)
      transitionTimer.current = window.setTimeout(advance, 210)
    }
  }

  const previousQuestion = () => {
    if (questionIndex === 0 || leaving) return
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current)
    setLeaving(false)
    setQuestionIndex((current) => current - 1)
  }

  const changeSize = () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current)
    setPhase('size-select')
    setAnswers([])
    setQuestionIndex(0)
    setLeaving(false)
    setActionMessage('')
  }

  const createPoster = async () => {
    if (!result) throw new Error('No result is available.')
    const copy = getHatCopy(result.hat)
    return createHatFactoryPosterBlob({
      name: result.hat.name,
      size: result.size,
      sizeLabel: SIZE_META[result.size].label,
      tagline: copy.tagline,
      description: copy.description,
    }, getPosterStyle(), startUrl)
  }

  const downloadPoster = async () => {
    if (!result || exportState === 'working') return
    setExportState('working')
    setActionMessage('正在给帽子熨平褶子…')
    try {
      const blob = await createPoster()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `hat-factory-${result.hat.name}.png`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      setActionMessage('结果图已保存，帽子概不退换。')
    } catch {
      setActionMessage('缝纫机卡线了，请稍后再试。')
    } finally {
      setExportState('idle')
    }
  }

  const sharePoster = async () => {
    const shareNavigator = navigator as OptionalWebShareNavigator
    if (!result || exportState === 'working' || !shareNavigator.share) return
    setExportState('working')
    setActionMessage('正在打包出厂…')
    try {
      const blob = await createPoster()
      const file = new File([blob], `hat-factory-${result.hat.name}.png`, { type: 'image/png' })
      if (!shareNavigator.canShare || shareNavigator.canShare({ files: [file] })) {
        await shareNavigator.share({ title: `帽子工厂鉴定：${result.hat.name}`, text: getHatCopy(result.hat).tagline, files: [file] })
      } else {
        await shareNavigator.share({ title: '帽子工厂', text: `本厂建议为我生产：${result.hat.name}`, url: startUrl })
      }
      setActionMessage('分享面板已打开。')
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setActionMessage('暂时无法分享，请先保存结果图。')
      else setActionMessage('')
    } finally {
      setExportState('idle')
    }
  }

  const currentQuestion = questions[questionIndex]

  return (
    <section className={`hat-factory hf-phase--${phase}`} aria-label="帽子工厂历史戏仿测评">
      <div className="hat-factory__texture" aria-hidden="true" />
      <div className="hat-factory__rail" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>

      {phase === 'intro' && (
        <div className="hf-intro">
          <div className="hf-intro__copy">
            <div className="hf-factory-mark"><Factory aria-hidden="true" /><span>天津一中物理社<br /><b>帽子工厂</b></span></div>
            <p className="hf-eyebrow">HAT FACTORY / EST. SOMEWHERE IN HISTORY</p>
            <h2>来都来了，<br />量个头吧。</h2>
            <p className="hf-intro__lead">本厂根据你在群聊、食堂、会议和周末早晨的真实作风，定制一顶严丝合缝、想摘也摘不掉的生活帽子。</p>
            <button className="hf-primary-action" type="button" onClick={openFactory}><Play aria-hidden="true" />进入工厂</button>
            <small>纯属历史戏仿 · 不构成现实人格鉴定</small>
          </div>
          <div className="hf-intro__machine" aria-hidden="true">
            <span className="hf-intro__serial">HF-20/027</span>
            <div className="hf-intro__dial"><Ruler /><b>20</b><small>道质检工序</small></div>
            <HatIllustration name="走资派" />
            <div className="hf-intro__stamp">量头<br />定制</div>
            <div className="hf-intro__belt"><i /><i /><i /><i /><i /></div>
          </div>
        </div>
      )}

      {phase === 'size-select' && (
        <div className="hf-size-select">
          <header className="hf-section-header">
            <button type="button" onClick={() => setPhase('intro')} aria-label="返回工厂介绍"><ArrowLeft /></button>
            <div><p>第一道工序</p><h2>选择工厂尺码</h2><span>先决定帽子的分量，再决定帽子的款式。</span></div>
          </header>
          <div className="hf-size-grid" role="radiogroup" aria-label="选择帽子尺码">
            {(Object.keys(SIZE_META) as HatSize[]).map((size) => {
              const meta = SIZE_META[size]
              const selected = selectedSize === size
              return (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`hf-size-card hf-size-card--${size}${selected ? ' is-selected' : ''}`}
                  onClick={() => setSelectedSize(size)}
                >
                  <span className="hf-size-card__number">{size === 'large' ? '01' : size === 'medium' ? '02' : '03'}</span>
                  <SizeHatStack size={size} />
                  <span className="hf-size-card__check"><Check /></span>
                  <div><small>{meta.english}</small><h3>{meta.label}</h3><strong>{meta.range}</strong><p>{meta.copy}</p></div>
                </button>
              )
            })}
          </div>
          <button className="hf-primary-action hf-size-select__start" type="button" onClick={startQuiz} disabled={!selectedSize}>
            <Factory aria-hidden="true" />{selectedSize ? `启动${SIZE_META[selectedSize].label}生产线` : '请先选择工厂尺码'}
          </button>
        </div>
      )}

      {phase === 'quiz' && selectedSize && currentQuestion && (
        <div className="hf-quiz">
          <header className="hf-quiz__header">
            <button type="button" onClick={previousQuestion} disabled={questionIndex === 0 || leaving} aria-label="返回上一题"><ArrowLeft /></button>
            <div className="hf-quiz__factory"><Factory /><span>{SIZE_META[selectedSize].label}<small>正在质检</small></span></div>
            <div className="hf-quiz__count" aria-label={`工序 ${String(questionIndex + 1).padStart(2, '0')}/${questions.length}`}><span>工序</span><b>{String(questionIndex + 1).padStart(2, '0')}</b><i>/</i><strong>{questions.length}</strong></div>
          </header>
          <div className="hf-progress" role="progressbar" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={questionIndex + 1}>
            <i style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} />
          </div>
          <article className={`hf-question${leaving ? ' is-leaving' : ''}`} key={currentQuestion.id}>
            <div className="hf-question__scene"><span>{currentQuestion.scene}</span><b>生活样本 #{String(questionIndex + 1).padStart(2, '0')}</b></div>
            <h2>{currentQuestion.prompt}</h2>
            <div className="hf-option-grid" role="radiogroup" aria-label="选择你的处理方式">
              {currentQuestion.options.map((option, optionIndex) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={answers[questionIndex] === option.id}
                  className={answers[questionIndex] === option.id ? 'is-selected' : ''}
                  onClick={() => chooseAnswer(option.id)}
                  style={{ '--option-order': optionIndex } as React.CSSProperties}
                >
                  <span>{String.fromCharCode(65 + optionIndex)}</span>
                  <p>{option.text}</p>
                  <i><Check /></i>
                </button>
              ))}
            </div>
          </article>
          <footer className="hf-quiz__footer"><span>已完成 {answers.filter(Boolean).length} 道工序</span><button type="button" onClick={changeSize}>换一条生产线</button></footer>
        </div>
      )}

      {phase === 'result' && result && (
        <div className={`hf-result hf-result--${result.size}`}>
          <header className="hf-result__heading"><p>质检完成 / INSPECTION PASSED</p><span>{SIZE_META[result.size].label}生产线 · HF-20/027</span></header>
          <div className="hf-result__hero">
            <div className="hf-result__hat">
              <div className="hf-result__seal" aria-hidden="true">鉴定<br />完毕</div>
              <HatIllustration name={result.hat.name} labelled />
            </div>
            <div className="hf-result__copy">
              <span>本厂建议为你生产</span>
              <h2>{result.hat.name}</h2>
              <strong>「{getHatCopy(result.hat).tagline}」</strong>
              <p>{getHatCopy(result.hat).description}</p>
              {getHatCopy(result.hat).caution && <small>佩戴提示：{getHatCopy(result.hat).caution}</small>}
            </div>
          </div>
          <section className="hf-result__share">
            <PosterPreview result={result} qrCode={qrCode} />
            <div className="hf-result__actions">
              <Sparkles aria-hidden="true" />
              <h3>帽子已经出厂</h3>
              <p>保存 1080 × 1920 鉴定海报。深色主题生成复古档案版，浅色主题生成漫画工厂版。</p>
              <div>
                <button type="button" onClick={downloadPoster} disabled={exportState === 'working'}><Download />{exportState === 'working' ? '正在生产…' : '保存结果图'}</button>
                {supportsWebShare && <button type="button" className="is-secondary" onClick={sharePoster} disabled={exportState === 'working'}><Share2 />分享</button>}
              </div>
              <span aria-live="polite">{actionMessage}</span>
            </div>
          </section>
          <div className="hf-result__restart">
            <button type="button" onClick={startQuiz}><RotateCcw />同尺码再测一次</button>
            <button type="button" onClick={changeSize}><Ruler />换个尺码</button>
          </div>
        </div>
      )}
    </section>
  )
}

export default HatFactoryGame
