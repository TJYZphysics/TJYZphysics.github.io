import { placeTool, type Level, type Placement, type ToolKind } from './model'

export interface LightPathLevel extends Level {
  id: string
  order: number
  name: string
  difficulty: '入门' | '进阶' | '挑战' | '专家'
  hint: string
  solution: Placement[]
}

const turns: Placement[] = [
  { point: { x: 6, t: 6 }, tool: 'turn-left' },
  { point: { x: 2, t: 6 }, tool: 'turn-right' },
]
const splits: Placement[] = [
  { point: { x: 6, t: 6 }, tool: 'splitter' },
  { point: { x: 2, t: 6 }, tool: 'splitter' },
]

const forbiddenSets = [
  [],
  [{ x: 4, t: 2 }],
  [{ x: 1, t: 3 }, { x: 7, t: 3 }],
  [{ x: 1, t: 5 }, { x: 7, t: 5 }],
  [{ x: 0, t: 4 }, { x: 8, t: 4 }, { x: 4, t: 6 }],
] as const

function makeLevel(order: number): LightPathLevel {
  const usesSplitter = order >= 9
  const solution = usesSplitter ? splits : turns
  const difficulty = order <= 4 ? '入门' : order <= 12 ? '进阶' : order <= 16 ? '挑战' : '专家'
  const inventory = usesSplitter
    ? { 'turn-left': order >= 13 ? 1 : 0, 'turn-right': order >= 13 ? 1 : 0, splitter: order >= 17 ? 2 : 3 }
    : { 'turn-left': order >= 5 ? 1 : 2, 'turn-right': order >= 5 ? 1 : 2, splitter: 0 }
  return {
    id: `light-path-${String(order).padStart(2, '0')}`,
    order,
    name: order <= 4 ? `偏转初识 ${order}` : order <= 8 ? `绕行约束 ${order - 4}` : order <= 12 ? `分光入门 ${order - 8}` : order <= 16 ? `镜片组合 ${order - 12}` : `非对称挑战 ${order - 16}`,
    difficulty,
    hint: usesSplitter ? '保留前进分支，同时让反向分支在终点会合。' : '在合适的时间改变两束光的方向。',
    width: 9,
    duration: 8,
    starts: [
      { point: { x: 0, t: 0 }, direction: 1 },
      { point: { x: 8, t: 0 }, direction: -1 },
    ],
    target: { x: 4, t: 8 },
    forbidden: [...forbiddenSets[Math.min(4, Math.floor((order - 1) / 4))]],
    inventory,
    budget: solution.length,
    solution: solution.map((placement) => ({ point: { ...placement.point }, tool: placement.tool })),
  }
}

export const LIGHT_PATH_LEVELS: LightPathLevel[] = Array.from({ length: 20 }, (_, index) => makeLevel(index + 1))

export function replaySolution(level: LightPathLevel): Map<string, ToolKind> {
  let placements = new Map<string, ToolKind>()
  for (const placement of level.solution) {
    const result = placeTool(placements, placement, level)
    if (!result.ok) throw new Error(`Invalid solution for ${level.id}: ${result.reason}`)
    placements = result.placements
  }
  return placements
}
