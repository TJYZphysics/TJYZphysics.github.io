import { DIMENSIONS, DIMENSION_IDS, QUESTIONS, type AnswerValue, type DimensionId } from './data'

export type ResultKind = 'turing' | 'von-neumann' | 'balanced'

export type DimensionScore = {
  id: DimensionId
  label: string
  vonPole: string
  turingPole: string
  summary: string
  value: number
  leaning: string
}

export type ResultProfile = {
  kind: ResultKind
  label: string
  title: string
  tagline: string
  description: string
  strengths: readonly string[]
  watchout: string
}

export type AssessmentResult = {
  overall: number
  dimensions: DimensionScore[]
  profile: ResultProfile
}

export const RESULT_PROFILES: Record<ResultKind, ResultProfile> = {
  turing: {
    kind: 'turing',
    label: '图灵派',
    title: '柔光观察者',
    tagline: '长发只是传说，细腻才是你的超能力。',
    description: '你习惯先接住气氛，再决定如何回应。你对含蓄的情绪、关系中的细节和未说出口的部分格外敏锐；比起抢先抵达，你更在意沿途是否有值得停留的东西。',
    strengths: ['读懂细微情绪', '为复杂感受留出空间', '在变化中保有想象力'],
    watchout: '想得太完整才出发，偶尔会让好时机从指尖溜走。',
  },
  'von-neumann': {
    kind: 'von-neumann',
    label: '冯诺依曼派',
    title: '直进建造者',
    tagline: '格子衫只是外壳，推进力才是你的底色。',
    description: '你喜欢把混乱压缩成清楚的下一步。面对分歧和不确定，你倾向于直接表达、快速落子，并用行动让局面继续向前；旁人常能从你身上获得稳定而鲜明的方向感。',
    strengths: ['把模糊变成行动', '在压力下保持方向', '坦率而可靠地表达'],
    watchout: '推进得太快时，容易错过别人尚未来得及说出的那一小部分。',
  },
  balanced: {
    kind: 'balanced',
    label: '均衡型',
    title: '双相变奏者',
    tagline: '格子衫和格子裙，你可以看心情切换。',
    description: '你的性格不会长期停在光谱的一端。需要推进时，你能果断地给出方向；值得体会时，你也愿意放慢速度听见暗流。情境而不是标签，决定了你下一秒呈现哪一面。',
    strengths: ['在直接与柔和之间切换', '兼顾效率和人的感受', '适应不同关系与场景'],
    watchout: '两种声音同时出现时，可能会花更多时间确认自己真正想要什么。',
  },
}

export function classifyResult(overall: number): ResultKind {
  if (overall >= 57) return 'turing'
  if (overall <= 43) return 'von-neumann'
  return 'balanced'
}

export function scoreAssessment(answers: readonly AnswerValue[]): AssessmentResult {
  if (answers.length !== QUESTIONS.length) {
    throw new Error(`Expected ${QUESTIONS.length} answers, received ${answers.length}.`)
  }

  const dimensions = DIMENSION_IDS.map((dimensionId) => {
    const questions = QUESTIONS.filter(({ dimension }) => dimension === dimensionId)
    const signedTotal = questions.reduce((total, question) => {
      const answer = answers[question.id - 1]
      if (answer === undefined) throw new Error(`Missing answer for question ${question.id}.`)
      return total + (answer - 2) * question.direction
    }, 0)
    const value = Math.round(50 + (signedTotal / (questions.length * 2)) * 50)
    const definition = DIMENSIONS.find(({ id }) => id === dimensionId)
    if (!definition) throw new Error(`Unknown dimension: ${dimensionId}`)
    return {
      ...definition,
      value,
      leaning: value > 56 ? definition.turingPole : value < 44 ? definition.vonPole : '均衡',
    }
  })

  const overall = Math.round(dimensions.reduce((total, item) => total + item.value, 0) / dimensions.length)
  return { overall, dimensions, profile: RESULT_PROFILES[classifyResult(overall)] }
}
