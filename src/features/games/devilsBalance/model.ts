export const COLOR_DEFS = [
  { id: 'red', name: '红', fullName: '红色', hex: '#ef5b5b', soft: 'rgba(239, 91, 91, .18)' },
  { id: 'yellow', name: '黄', fullName: '黄色', hex: '#f4bd4e', soft: 'rgba(244, 189, 78, .18)' },
  { id: 'green', name: '绿', fullName: '绿色', hex: '#53c69a', soft: 'rgba(83, 198, 154, .18)' },
  { id: 'blue', name: '蓝', fullName: '蓝色', hex: '#5a9cf6', soft: 'rgba(90, 156, 246, .18)' },
  { id: 'purple', name: '紫', fullName: '紫色', hex: '#b38af5', soft: 'rgba(179, 138, 245, .18)' },
] as const

export type ColorId = typeof COLOR_DEFS[number]['id']
export type ScaleResult = '>' | '<' | '='
export type WeightAssignment = Record<ColorId, number>
export type Pan = Record<ColorId, number>
export type Trays = [Pan, Pan, Pan, Pan]

export interface BalanceReference {
  color: ColorId
  weight: number
}

export interface DevilBalanceLevel {
  id: string
  order: number
  name: string
  difficulty: '入门' | '进阶' | '挑战' | '专家'
  description: string
  hint: string
  reference: BalanceReference
  target: WeightAssignment
  inventoryPerColor: number
  playerLimit: number
  maxTurns: number
  npcPhases: Trays[]
  solutionPlan: Trays[]
}

export const COLOR_IDS = COLOR_DEFS.map(({ id }) => id) as ColorId[]

export function emptyPan(): Pan {
  return { red: 0, yellow: 0, green: 0, blue: 0, purple: 0 }
}

export function emptyTrays(): Trays {
  return [emptyPan(), emptyPan(), emptyPan(), emptyPan()]
}

export function cloneTrays(trays: Trays): Trays {
  return trays.map((pan) => ({ ...pan })) as Trays
}

export function countPan(pan: Pan): number {
  return COLOR_IDS.reduce((total, color) => total + pan[color], 0)
}

export function countTrays(trays: Trays): number {
  return trays.reduce((total, pan) => total + countPan(pan), 0)
}

export function addPan(left: Pan, right: Pan): Pan {
  return COLOR_IDS.reduce((next, color) => {
    next[color] = left[color] + right[color]
    return next
  }, emptyPan())
}

export function addTrays(left: Trays, right: Trays): Trays {
  return left.map((pan, index) => addPan(pan, right[index])) as Trays
}

export function weightOfPan(pan: Pan, weights: WeightAssignment): number {
  return COLOR_IDS.reduce((total, color) => total + pan[color] * weights[color], 0)
}

export function evaluateScale(trays: Trays, weights: WeightAssignment, scaleIndex: 0 | 1): ScaleResult {
  const left = weightOfPan(trays[scaleIndex * 2], weights)
  const right = weightOfPan(trays[scaleIndex * 2 + 1], weights)
  return left === right ? '=' : left > right ? '>' : '<'
}

export function evaluateTrays(trays: Trays, weights: WeightAssignment): [ScaleResult, ScaleResult] {
  return [evaluateScale(trays, weights, 0), evaluateScale(trays, weights, 1)]
}

export function assignmentKey(weights: WeightAssignment): string {
  return COLOR_IDS.map((color) => weights[color]).join('-')
}

export function enumerateAssignments(reference: BalanceReference): WeightAssignment[] {
  const candidates: WeightAssignment[] = []
  const current = { red: 0, yellow: 0, green: 0, blue: 0, purple: 0 }
  current[reference.color] = reference.weight

  const visit = (index: number, used: Set<number>) => {
    if (index === COLOR_IDS.length) {
      candidates.push({ ...current })
      return
    }
    const color = COLOR_IDS[index]
    if (color === reference.color) {
      visit(index + 1, used)
      return
    }
    for (let weight = 1; weight <= 10; weight += 1) {
      if (used.has(weight)) continue
      current[color] = weight
      used.add(weight)
      visit(index + 1, used)
      used.delete(weight)
    }
  }

  visit(0, new Set([reference.weight]))
  return candidates
}

export function filterCandidates(
  candidates: WeightAssignment[],
  trays: Trays,
  results: [ScaleResult, ScaleResult],
): WeightAssignment[] {
  return candidates.filter((candidate) => {
    const measured = evaluateTrays(trays, candidate)
    return measured[0] === results[0] && measured[1] === results[1]
  })
}

export function deriveSolvedWeights(candidates: WeightAssignment[]): Partial<WeightAssignment> {
  if (candidates.length === 0) return {}
  return COLOR_IDS.reduce<Partial<WeightAssignment>>((solved, color) => {
    const weight = candidates[0][color]
    if (candidates.every((candidate) => candidate[color] === weight)) solved[color] = weight
    return solved
  }, {})
}

export function countColor(pan: Pan, color: ColorId): number {
  return pan[color]
}

export function validatePlayerTrays(
  trays: Trays,
  remaining: Record<ColorId, number>,
  limit: number,
): { ok: true } | { ok: false; reason: 'limit' | 'inventory' } {
  if (countTrays(trays) > limit) return { ok: false, reason: 'limit' }
  for (const color of COLOR_IDS) {
    const count = trays.reduce((total, pan) => total + pan[color], 0)
    if (count > remaining[color]) return { ok: false, reason: 'inventory' }
  }
  return { ok: true }
}

export function subtractInventory(
  remaining: Record<ColorId, number>,
  trays: Trays,
): Record<ColorId, number> {
  return COLOR_IDS.reduce((next, color) => {
    next[color] = remaining[color] - trays.reduce((total, pan) => total + pan[color], 0)
    return next
  }, { ...remaining })
}

export function isInventoryEmpty(remaining: Record<ColorId, number>): boolean {
  return COLOR_IDS.every((color) => remaining[color] <= 0)
}

export function traysKey(trays: Trays): string {
  return trays.map((pan) => COLOR_IDS.map((color) => pan[color]).join('')).join('|')
}
