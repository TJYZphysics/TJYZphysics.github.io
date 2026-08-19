import {
  HAT_NAMES_BY_SIZE,
  HATS_BY_SIZE,
  QUESTIONS_BY_SIZE,
  type HatDefinition,
  type HatName,
  type HatSize,
} from './data'

export type HatFactoryResult = {
  size: HatSize
  hat: HatDefinition
  verdict: string
  answeredCount: number
}

export function scoreHatFactory(size: HatSize, optionIds: readonly string[]): HatFactoryResult {
  const questions = QUESTIONS_BY_SIZE[size]
  if (optionIds.length !== questions.length) {
    throw new Error(`Expected ${questions.length} answers for ${size}, received ${optionIds.length}.`)
  }

  const scores = new Map<HatName, number>(HAT_NAMES_BY_SIZE[size].map((name) => [name, 0]))

  questions.forEach((question, index) => {
    const optionId = optionIds[index]
    const option = question.options.find(({ id }) => id === optionId)
    if (!option) throw new Error(`Invalid answer "${optionId}" for question ${question.id}.`)

    option.weights.forEach(([name, weight]) => {
      if (!scores.has(name)) throw new Error(`Hat ${name} does not belong to the ${size} production line.`)
      scores.set(name, (scores.get(name) ?? 0) + weight)
    })
  })

  // Array order is the documented stable priority: ties never depend on object iteration.
  const winningName = HAT_NAMES_BY_SIZE[size].reduce((winner, candidate) => (
    (scores.get(candidate) ?? 0) > (scores.get(winner) ?? 0) ? candidate : winner
  ))
  const hat = HATS_BY_SIZE[size].find(({ name }) => name === winningName)
  if (!hat) throw new Error(`Missing definition for result hat: ${winningName}`)

  return { size, hat, verdict: hat.verdict, answeredCount: optionIds.length }
}
