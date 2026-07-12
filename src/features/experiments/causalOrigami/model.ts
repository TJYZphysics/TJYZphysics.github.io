export interface EventPoint { x: number; t: number }
export type Direction = -1 | 1

export interface Level {
  width: number
  duration: number
  starts: [{ point: EventPoint; direction: Direction }, { point: EventPoint; direction: Direction }]
  target: EventPoint
  forbidden: EventPoint[]
  budget: number
  allowedSolutionPoints: EventPoint[]
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
  budget: 4,
  allowedSolutionPoints: [{ x: 2, t: 2 }, { x: 6, t: 2 }, { x: 0, t: 4 }, { x: 8, t: 4 }],
}

export function propagateSignal(start: EventPoint, initialDirection: Direction, folds: Map<string, Direction>, duration: number) {
  const path: EventPoint[] = [{ ...start }]
  let current = { ...start }
  let direction = initialDirection
  while (current.t < duration) {
    current = { x: current.x + direction, t: current.t + 1 }
    path.push(current)
    direction = folds.get(eventKey(current)) ?? direction
  }
  return path
}

export interface SignalTrace {
  path: EventPoint[]
  legal: boolean
  reason?: 'forbidden' | 'outside'
  violation?: EventPoint
}

export function traceSignal(start: EventPoint, initialDirection: Direction, folds: Map<string, Direction>, level: Level): SignalTrace {
  const path: EventPoint[] = [{ ...start }]
  let current = { ...start }
  let direction = initialDirection
  const forbidden = new Set(level.forbidden.map(eventKey))
  while (current.t < level.duration) {
    current = { x: current.x + direction, t: current.t + 1 }
    path.push(current)
    if (current.x < 0 || current.x >= level.width) {
      return { path, legal: false, reason: 'outside', violation: { ...current } }
    }
    if (forbidden.has(eventKey(current))) {
      return { path, legal: false, reason: 'forbidden', violation: { ...current } }
    }
    direction = folds.get(eventKey(current)) ?? direction
  }
  return { path, legal: true }
}

export function placeFold(folds: Map<string, Direction>, point: EventPoint, direction: Direction, level: Level):
  | { ok: true; folds: Map<string, Direction> }
  | { ok: false; reason: 'forbidden' | 'budget' | 'outside'; folds: Map<string, Direction> } {
  const key = eventKey(point)
  if (point.x < 0 || point.x >= level.width || point.t <= 0 || point.t >= level.duration) return { ok: false, reason: 'outside', folds }
  if (level.forbidden.some((item) => eventKey(item) === key)) return { ok: false, reason: 'forbidden', folds }
  if (!folds.has(key) && folds.size >= level.budget) return { ok: false, reason: 'budget', folds }
  const next = new Map(folds)
  next.set(key, direction)
  return { ok: true, folds: next }
}

export function runLevel(level: Level, folds: Map<string, Direction>) {
  const traces = level.starts.map(({ point, direction }) => traceSignal(point, direction, folds, level)) as [SignalTrace, SignalTrace]
  const paths = traces.map((trace) => trace.path) as [EventPoint[], EventPoint[]]
  const invalid = traces.find((trace) => !trace.legal)
  if (invalid) {
    return { paths, success: false, legal: false, reason: invalid.reason, violation: invalid.violation }
  }
  const a = paths[0].find((point) => eventKey(point) === eventKey(level.target))
  const b = paths[1].find((point) => eventKey(point) === eventKey(level.target))
  return { paths, success: Boolean(a && b), legal: true, meeting: a && b ? { ...level.target } : undefined }
}
