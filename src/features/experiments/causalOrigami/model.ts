export interface EventPoint { x: number; t: number }
export type Direction = -1 | 1
export type ToolKind = 'turn-left' | 'turn-right' | 'splitter'

export interface Placement {
  point: EventPoint
  tool: ToolKind
}

export type ToolInventory = Record<ToolKind, number>

export interface LightBranch {
  source: number
  path: EventPoint[]
  direction: Direction
  legal: boolean
  reachedTarget: boolean
  reason?: 'forbidden' | 'outside'
  violation?: EventPoint
}

export interface Level {
  width: number
  duration: number
  starts: [{ point: EventPoint; direction: Direction }, { point: EventPoint; direction: Direction }]
  target: EventPoint
  forbidden: EventPoint[]
  inventory: ToolInventory
}

export const eventKey = ({ x, t }: EventPoint) => `${x},${t}`

export const DEFAULT_LEVEL: Level = {
  width: 9,
  duration: 8,
  starts: [
    { point: { x: 0, t: 0 }, direction: 1 },
    { point: { x: 8, t: 0 }, direction: -1 },
  ],
  target: { x: 4, t: 8 },
  forbidden: [{ x: 4, t: 3 }, { x: 4, t: 4 }, { x: 4, t: 5 }],
  inventory: { 'turn-left': 2, 'turn-right': 2, splitter: 0 },
}

type PlacementFailureReason = 'outside' | 'start' | 'target' | 'forbidden' | 'inventory'

export function placeTool(
  placements: Map<string, ToolKind>,
  placement: Placement,
  level: Level,
):
  | { ok: true; placements: Map<string, ToolKind> }
  | { ok: false; reason: PlacementFailureReason; placements: Map<string, ToolKind> } {
  const key = eventKey(placement.point)
  if (
    placement.point.x < 0
    || placement.point.x >= level.width
    || placement.point.t < 0
    || placement.point.t > level.duration
  ) {
    return { ok: false, reason: 'outside', placements }
  }
  if (level.starts.some(({ point }) => eventKey(point) === key)) {
    return { ok: false, reason: 'start', placements }
  }
  if (eventKey(level.target) === key) {
    return { ok: false, reason: 'target', placements }
  }
  if (level.forbidden.some((point) => eventKey(point) === key)) {
    return { ok: false, reason: 'forbidden', placements }
  }

  const alreadyPlaced = placements.get(key)
  const used = [...placements.entries()].filter(([placedKey, tool]) => placedKey !== key && tool === placement.tool).length
  if (alreadyPlaced !== placement.tool && used >= level.inventory[placement.tool]) {
    return { ok: false, reason: 'inventory', placements }
  }

  const next = new Map(placements)
  next.set(key, placement.tool)
  return { ok: true, placements: next }
}

function directionsForTool(direction: Direction, tool: ToolKind | undefined): Direction[] {
  if (tool === 'turn-left') return [-1]
  if (tool === 'turn-right') return [1]
  if (tool === 'splitter') return [-1, 1]
  return [direction]
}

function branchStateKey(branch: LightBranch) {
  const point = branch.path[branch.path.length - 1]
  return `${branch.source}:${eventKey(point)}:${branch.direction}`
}

export function runLevel(level: Level, placements: Map<string, ToolKind>) {
  const forbidden = new Set(level.forbidden.map(eventKey))
  const branchesForSource = level.starts.map(({ point, direction }, source) => {
    let active: LightBranch[] = [{
      source,
      path: [{ ...point }],
      direction,
      legal: true,
      reachedTarget: eventKey(point) === eventKey(level.target),
    }]
    const finished: LightBranch[] = []

    while (active.length > 0 && active[0].path[active[0].path.length - 1].t < level.duration) {
      const next = new Map<string, LightBranch>()

      for (const branch of active) {
        const current = branch.path[branch.path.length - 1]
        const point = { x: current.x + branch.direction, t: current.t + 1 }
        const moved = { ...branch, path: [...branch.path, point] }

        if (point.x < 0 || point.x >= level.width) {
          finished.push({ ...moved, legal: false, reason: 'outside', violation: point })
          continue
        }
        if (forbidden.has(eventKey(point))) {
          finished.push({ ...moved, legal: false, reason: 'forbidden', violation: point })
          continue
        }
        if (eventKey(point) === eventKey(level.target)) {
          finished.push({ ...moved, reachedTarget: true })
          continue
        }

        for (const direction of directionsForTool(branch.direction, placements.get(eventKey(point)))) {
          const candidate = { ...moved, direction }
          next.set(branchStateKey(candidate), candidate)
        }
      }

      active = [...next.values()]
    }

    return [...finished, ...active]
  }) as [LightBranch[], LightBranch[]]

  const success = branchesForSource.every((branches) => (
    branches.some((branch) => branch.legal && branch.reachedTarget)
  ))

  return { branchesForSource, success }
}
