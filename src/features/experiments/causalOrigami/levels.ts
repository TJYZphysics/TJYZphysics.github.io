import { eventKey, placeTool, type Direction, type EventPoint, type Level, type Placement, type ToolKind } from './model'

export interface LightPathLevel extends Level {
  id: string
  order: number
  name: string
  difficulty: '入门' | '进阶' | '挑战' | '专家'
  hint: string
  solution: Placement[]
}

interface Route { start: number; directions: Direction[] }

const layouts = [
  [0, 8, 4], [1, 7, 3], [0, 6, 4], [2, 8, 4],
  [1, 5, 3], [3, 7, 5], [0, 8, 4], [2, 6, 4],
  [0, 6, 4], [2, 8, 4], [1, 7, 5], [0, 8, 4],
  [1, 5, 3], [3, 7, 5], [0, 6, 2], [2, 8, 6],
  [0, 8, 4], [1, 7, 3], [0, 6, 4], [2, 8, 4],
] as const

function routesBetween(start: number, target: number): Route[] {
  const routes: Route[] = []
  for (let mask = 0; mask < 256; mask += 1) {
    const directions = Array.from({ length: 8 }, (_, step) => ((mask >> step) & 1 ? 1 : -1) as Direction)
    let x = start
    let valid = true
    for (const direction of directions) {
      x += direction
      if (x < 0 || x >= 9) valid = false
    }
    if (valid && x === target && directions.some((direction, index) => index > 0 && direction !== directions[index - 1])) routes.push({ start, directions })
  }
  return routes
}

function routePoints(route: Route): EventPoint[] {
  let x = route.start
  return [{ x, t: 0 }, ...route.directions.map((direction, index) => ({ x: x += direction, t: index + 1 }))]
}

function routePlacements(route: Route, splitterChange: number | undefined): Placement[] {
  const points = routePoints(route)
  let change = 0
  return route.directions.flatMap((direction, index) => {
    const next = route.directions[index + 1]
    if (next === undefined || next === direction) return []
    const tool: ToolKind = change++ === splitterChange ? 'splitter' : next === -1 ? 'turn-left' : 'turn-right'
    return [{ point: { ...points[index + 1] }, tool }]
  })
}

function buildLevel(order: number): LightPathLevel {
  const [leftStart, rightStart, targetX] = layouts[order - 1]
  const leftRoutes = routesBetween(leftStart, targetX)
  const rightRoutes = routesBetween(rightStart, targetX)
  const splitterStage = order >= 9
  let selected: { routes: [Route, Route]; solution: Placement[] } | undefined
  const offset = order * 7

  for (let attempt = 0; attempt < leftRoutes.length * rightRoutes.length; attempt += 1) {
    const left = leftRoutes[(offset + Math.floor(attempt / rightRoutes.length)) % leftRoutes.length]
    const right = rightRoutes[(offset * 3 + attempt) % rightRoutes.length]
    const leftSolution = routePlacements(left, splitterStage ? 0 : undefined)
    const rightSolution = routePlacements(right, order >= 13 ? 0 : undefined)
    const merged = new Map<string, Placement>()
    let conflict = false
    for (const placement of [...leftSolution, ...rightSolution]) {
      const existing = merged.get(eventKey(placement.point))
      if (existing && existing.tool !== placement.tool) conflict = true
      merged.set(eventKey(placement.point), placement)
    }
    if (conflict) continue
    const solution = [...merged.values()]
    if (order >= 13 && !solution.some(({ tool }) => tool === 'splitter')) continue
    if (order >= 13 && !solution.some(({ tool }) => tool !== 'splitter')) continue
    selected = { routes: [left, right], solution }
    break
  }
  if (!selected) throw new Error(`Unable to construct level ${order}`)

  const pathKeys = new Set(selected.routes.flatMap(routePoints).map(eventKey))
  const forbiddenCount = order <= 4 ? order - 1 : order <= 8 ? order - 2 : order <= 12 ? order - 4 : order <= 16 ? order - 6 : order - 8
  const candidates: EventPoint[] = []
  for (let t = 1; t < 8; t += 1) for (let x = 0; x < 9; x += 1) {
    const point = { x, t }
    if (!pathKeys.has(eventKey(point))) candidates.push(point)
  }
  const forbidden = Array.from({ length: forbiddenCount }, (_, index) => ({ ...candidates[(order * 11 + index * 13) % candidates.length] }))
  const counts = { 'turn-left': 0, 'turn-right': 0, splitter: 0 }
  selected.solution.forEach(({ tool }) => { counts[tool] += 1 })
  const inventory = order >= 17 ? { ...counts } : {
    'turn-left': counts['turn-left'] + (order % 3 === 0 ? 1 : 0),
    'turn-right': counts['turn-right'] + (order % 3 === 1 ? 1 : 0),
    splitter: counts.splitter + (order >= 9 && order % 2 === 0 ? 1 : 0),
  }

  return {
    id: `light-path-${String(order).padStart(2, '0')}`,
    order,
    name: order <= 4 ? `偏转初识 ${order}` : order <= 8 ? `禁区绕行 ${order - 4}` : order <= 12 ? `分光选择 ${order - 8}` : order <= 16 ? `镜片协奏 ${order - 12}` : `非对称极限 ${order - 16}`,
    difficulty: order <= 4 ? '入门' : order <= 12 ? '进阶' : order <= 16 ? '挑战' : '专家',
    hint: order < 9 ? '观察每次偏转后剩余的传播时间。' : order < 13 ? '利用分光保留一条可达终点的分支。' : '让分光与偏转器接力完成会合。',
    width: 9,
    duration: 8,
    starts: [
      { point: { x: leftStart, t: 0 }, direction: selected.routes[0].directions[0] },
      { point: { x: rightStart, t: 0 }, direction: selected.routes[1].directions[0] },
    ],
    target: { x: targetX, t: 8 },
    forbidden,
    inventory,
    budget: selected.solution.length,
    solution: selected.solution.map(({ point, tool }) => ({ point: { ...point }, tool })),
  }
}

export const LIGHT_PATH_LEVELS: LightPathLevel[] = Array.from({ length: 20 }, (_, index) => buildLevel(index + 1))

export function replaySolution(level: LightPathLevel): Map<string, ToolKind> {
  let placements = new Map<string, ToolKind>()
  for (const placement of level.solution) {
    const result = placeTool(placements, placement, level)
    if (!result.ok) throw new Error(`Invalid solution for ${level.id}: ${result.reason}`)
    placements = result.placements
  }
  return placements
}
