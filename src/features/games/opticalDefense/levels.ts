import { LEVEL_CAPACITIES_W } from './rules'
import type { DeviceKind, LevelConfig, LevelWave, Point, WaveEnemy } from './types'

const BASE_DEVICES: DeviceKind[] = ['source-red', 'mirror', 'bulb']
const ALL_LEVEL_DEVICES: DeviceKind[] = [
  'source-red', 'source-green', 'source-blue', 'mirror', 'splitter', 'combiner', 'filter', 'collector',
  'bulb', 'laser-emitter', 'radiation-source', 'frost-tower', 'brazier', 'accelerator', 'shutter',
  'photo-sensor', 'capacitor',
]

const normal = (count: number, health = 34, routeIndex = 0): WaveEnemy => ({ kind: 'normal', count, intervalSeconds: 0.82, health, speed: 48, rewardCoins: 7, rewardPowerW: 1, routeIndex })
const fast = (count: number, health = 28, routeIndex = 0): WaveEnemy => ({ kind: 'fast', count, intervalSeconds: 0.58, health, speed: 72, rewardCoins: 9, rewardPowerW: 1, routeIndex })
const armored = (count: number, health = 110, routeIndex = 0): WaveEnemy => ({ kind: 'armored', count, intervalSeconds: 1.05, health, speed: 36, rewardCoins: 14, rewardPowerW: 1, routeIndex })
const resistant = (count: number, resistance: 'r' | 'g' | 'b', health = 84, routeIndex = 0): WaveEnemy => ({ kind: 'resistant', count, intervalSeconds: 0.9, health, speed: 44, rewardCoins: 14, rewardPowerW: 1, resistance, routeIndex })
const boss = (health = 620, routeIndex = 0): WaveEnemy => ({ kind: 'boss', count: 1, intervalSeconds: 1, health, speed: 26, rewardCoins: 110, rewardPowerW: 20, routeIndex })
const wave = (delaySeconds: number, ...enemies: WaveEnemy[]): LevelWave => ({ delaySeconds, enemies })

type GridCell = readonly [column: number, row: number]
type LayoutSpec = { columns: number; rows: number; cellSize: number; routes: GridCell[][] }

const layouts: LayoutSpec[] = [
  { columns: 14, rows: 8, cellSize: 84, routes: [[[0, 2], [2, 2], [2, 5], [13, 5]]] },
  { columns: 14, rows: 8, cellSize: 84, routes: [[[0, 1], [4, 1], [4, 4], [7, 4], [7, 2], [13, 2]]] },
  { columns: 14, rows: 8, cellSize: 84, routes: [[[0, 5], [2, 5], [2, 2], [5, 2], [5, 6], [13, 6]]] },
  { columns: 14, rows: 8, cellSize: 84, routes: [[[0, 3], [3, 3], [3, 1], [6, 1], [6, 4], [9, 4], [9, 5], [13, 5]]] },
  { columns: 14, rows: 8, cellSize: 84, routes: [[[0, 1], [2, 1], [2, 6], [5, 6], [5, 1], [8, 1], [8, 6], [11, 6], [11, 4], [13, 4]]] },
  { columns: 14, rows: 8, cellSize: 84, routes: [[[0, 4], [3, 4], [3, 1], [6, 1], [6, 4], [9, 4], [9, 2], [12, 2], [12, 4], [13, 4]]] },
  { columns: 14, rows: 8, cellSize: 84, routes: [[[0, 6], [1, 6], [1, 1], [4, 1], [4, 5], [7, 5], [7, 1], [10, 1], [10, 6], [13, 6]]] },
  { columns: 14, rows: 8, cellSize: 84, routes: [[[0, 3], [2, 3], [2, 1], [4, 1], [4, 3], [6, 3], [6, 5], [8, 5], [8, 3], [10, 3], [10, 1], [12, 1], [12, 3], [13, 3]]] },
  { columns: 14, rows: 8, cellSize: 84, routes: [[[0, 1], [3, 1], [3, 6], [10, 6], [10, 1], [13, 1]]] },
  { columns: 14, rows: 8, cellSize: 84, routes: [[[0, 5], [2, 5], [2, 2], [4, 2], [4, 5], [6, 5], [6, 7], [8, 7], [8, 5], [10, 5], [10, 2], [12, 2], [12, 4], [13, 4]]] },
  { columns: 16, rows: 9, cellSize: 76, routes: [[[0, 2], [4, 2], [4, 7], [9, 7], [9, 3], [15, 3]]] },
  { columns: 16, rows: 9, cellSize: 76, routes: [[[0, 6], [3, 6], [3, 1], [7, 1], [7, 6], [11, 6], [11, 2], [15, 2]]] },
  { columns: 16, rows: 9, cellSize: 76, routes: [[[0, 1], [5, 1], [5, 7], [10, 7], [10, 1], [15, 1]]] },
  { columns: 16, rows: 9, cellSize: 76, routes: [[[0, 1], [4, 1], [4, 4], [8, 4], [8, 6], [15, 6]], [[15, 2], [12, 2], [12, 4], [8, 4], [8, 6], [15, 6]]] },
  { columns: 16, rows: 9, cellSize: 76, routes: [[[0, 7], [2, 7], [2, 2], [6, 2], [6, 6], [10, 6], [10, 1], [14, 1], [14, 4], [15, 4]]] },
  { columns: 16, rows: 9, cellSize: 76, routes: [[[0, 4], [3, 4], [3, 1], [6, 1], [6, 7], [9, 7], [9, 2], [12, 2], [12, 6], [15, 6]]] },
  { columns: 16, rows: 9, cellSize: 76, routes: [[[0, 2], [2, 2], [2, 7], [5, 7], [5, 3], [8, 3], [8, 7], [11, 7], [11, 1], [14, 1], [14, 5], [15, 5]]] },
  { columns: 16, rows: 9, cellSize: 76, routes: [[[0, 1], [3, 1], [3, 4], [7, 4], [7, 7], [11, 7], [11, 4], [15, 4]], [[0, 7], [3, 7], [3, 4], [7, 4], [7, 1], [11, 1], [11, 4], [15, 4]]] },
  { columns: 16, rows: 9, cellSize: 76, routes: [[[0, 4], [2, 4], [2, 1], [5, 1], [5, 7], [8, 7], [8, 2], [11, 2], [11, 7], [14, 7], [14, 4], [15, 4]]] },
]

function expandRoute(waypoints: GridCell[]) {
  const expanded: GridCell[] = [waypoints[0]]
  waypoints.slice(1).forEach(([targetColumn, targetRow]) => {
    const [startColumn, startRow] = expanded.at(-1)!
    const columnStep = Math.sign(targetColumn - startColumn)
    const rowStep = Math.sign(targetRow - startRow)
    if (columnStep !== 0 && rowStep !== 0) throw new Error('Optical defense routes must follow the shared cell grid.')
    let column = startColumn
    let row = startRow
    while (column !== targetColumn || row !== targetRow) {
      column += columnStep
      row += rowStep
      expanded.push([column, row])
    }
  })
  return expanded
}

function createLayout(spec: LayoutSpec) {
  const board = { width: 1200, height: 700 }
  const gridWidth = spec.columns * spec.cellSize
  const gridHeight = spec.rows * spec.cellSize
  const grid = { columns: spec.columns, rows: spec.rows, cellSize: spec.cellSize, originX: (board.width - gridWidth) / 2, originY: (board.height - gridHeight) / 2 }
  const centerOf = ([column, row]: GridCell): Point => ({ x: grid.originX + column * grid.cellSize + grid.cellSize / 2, y: grid.originY + row * grid.cellSize + grid.cellSize / 2 })
  const routeMap = spec.routes.map((route) => expandRoute(route))
  const routeKeys = new Set(routeMap.flat().map(([column, row]) => `${column}:${row}`))
  const holes = Array.from({ length: spec.columns * spec.rows }, (_, index) => [index % spec.columns, Math.floor(index / spec.columns)] as const)
    .filter(([column, row]) => !routeKeys.has(`${column}:${row}`)).map(centerOf)
  const paths = spec.routes.map((route) => {
    const first = centerOf(route[0])
    const last = centerOf(route.at(-1)!)
    const entranceX = route[0][0] === 0 ? 0 : board.width
    const exitX = route.at(-1)![0] === spec.columns - 1 ? board.width : 0
    return [{ x: entranceX, y: first.y }, ...route.map(centerOf), { x: exitX, y: last.y }]
  })
  return { board, grid, holes, routeCells: [...routeKeys].map((key) => centerOf(key.split(':').map(Number) as unknown as GridCell)), paths, path: paths[0] }
}

type Definition = Omit<LevelConfig, 'id' | 'capacityW' | 'holes' | 'path' | 'paths' | 'routeCells' | 'board' | 'grid'>
const definitions: Definition[] = [
  { title: '第一次折返', lesson: '用红光源和镜面点亮灯泡，建立最基础的范围防线。', startingCoins: 170, coreHealth: 12, waves: [wave(0, normal(9, 12)), wave(2, normal(8, 16), fast(4, 14)), wave(2, normal(10, 20), fast(5, 16))], availableDevices: BASE_DEVICES, recommended: BASE_DEVICES },
  { title: '镜廊', lesson: '连续反射光束，并用激光持续追踪单个敌人。', startingCoins: 205, coreHealth: 12, waves: [wave(0, normal(12, 30)), wave(1.8, fast(8, 26), normal(8, 36)), wave(2, armored(3, 96), normal(10, 40))], availableDevices: [...BASE_DEVICES, 'laser-emitter'], recommended: ['source-red', 'mirror', 'laser-emitter'] },
  { title: '遮挡之后', lesson: '敌人会截断光束，用光闸建立可切换的备用路径。', startingCoins: 230, coreHealth: 11, waves: [wave(0, normal(14, 36)), wave(1.5, fast(8, 30), normal(10, 42)), wave(1.8, armored(4, 108), fast(8, 32)), wave(2, armored(4, 116), normal(12, 48))], availableDevices: [...BASE_DEVICES, 'laser-emitter', 'shutter'], recommended: ['source-red', 'mirror', 'shutter'] },
  { title: '三束之光', lesson: '分束器每一路都可自由吸附目标，合理分配输入功率。', startingCoins: 270, coreHealth: 11, waves: [wave(0, fast(10, 30), normal(8, 42)), wave(1.4, normal(12, 48), fast(10, 34)), wave(1.6, armored(5, 116), fast(10, 36)), wave(2, normal(10, 56), armored(5, 126))], availableDevices: [...BASE_DEVICES, 'splitter', 'laser-emitter', 'radiation-source'], recommended: ['source-red', 'splitter', 'laser-emitter'] },
  { title: '色彩反应', lesson: '合并 RGB 通道，用复色状态反应处理不同敌人。', startingCoins: 320, coreHealth: 10, waves: [wave(0, resistant(8, 'r', 86), resistant(8, 'g', 86)), wave(1.5, normal(10, 56), resistant(8, 'b', 90)), wave(1.7, resistant(6, 'r', 96), resistant(6, 'g', 96), resistant(6, 'b', 96)), wave(2, armored(5, 132), fast(10, 38))], availableDevices: [...BASE_DEVICES, 'source-green', 'source-blue', 'combiner', 'filter', 'brazier'], recommended: ['source-red', 'source-green', 'combiner'] },
  { title: '广域调度', lesson: '缩短后的范围需要更精确的终端位置与光能调度。', startingCoins: 350, coreHealth: 10, waves: [wave(0, normal(12, 58), fast(10, 40)), wave(1.4, armored(5, 138), normal(12, 64)), wave(1.5, fast(14, 42), normal(10, 68)), wave(1.7, armored(6, 148), resistant(8, 'r', 100)), wave(2, armored(6, 156), fast(12, 44))], availableDevices: [...BASE_DEVICES, 'source-green', 'splitter', 'laser-emitter', 'radiation-source', 'collector'], recommended: ['source-green', 'splitter', 'collector'] },
  { title: '抗性色谱', lesson: '滤出有效颜色，绕过强化后的单色抗性。', startingCoins: 390, coreHealth: 9, waves: [wave(0, resistant(10, 'r', 104), resistant(10, 'g', 104)), wave(1.4, resistant(10, 'b', 108), fast(12, 44)), wave(1.5, resistant(8, 'r', 112), resistant(8, 'g', 112), resistant(8, 'b', 112)), wave(1.7, armored(6, 164), resistant(10, 'b', 116)), wave(2, armored(6, 172), fast(14, 46))], availableDevices: [...BASE_DEVICES, 'source-green', 'source-blue', 'filter', 'combiner', 'frost-tower', 'brazier', 'collector'], recommended: ['source-blue', 'filter', 'frost-tower'] },
  { title: '自动光控', lesson: '把传感器附着到已有仪器，并用它控制光闸。', startingCoins: 430, coreHealth: 9, waves: [wave(0, fast(14, 46), normal(12, 70)), wave(1.3, armored(6, 176), resistant(10, 'r', 120)), wave(1.4, fast(16, 48), resistant(10, 'b', 124)), wave(1.6, armored(7, 188), normal(14, 80)), wave(2, armored(7, 198), fast(16, 50))], availableDevices: [...BASE_DEVICES, 'source-green', 'source-blue', 'laser-emitter', 'shutter', 'photo-sensor', 'filter', 'collector'], recommended: ['source-blue', 'photo-sensor', 'shutter'] },
  { title: '全仪器校准', lesson: '所有仪器从本关起开放，建立完整的光学防御系统。', startingCoins: 500, coreHealth: 9, waves: [wave(0, normal(14, 80), fast(12, 52)), wave(1.2, armored(7, 202), resistant(10, 'b', 132)), wave(1.4, armored(7, 214), fast(16, 54)), wave(1.6, resistant(8, 'r', 138), resistant(8, 'g', 138), resistant(8, 'b', 138)), wave(2, armored(8, 226), boss(680))], availableDevices: ALL_LEVEL_DEVICES, recommended: ['source-blue', 'capacitor', 'collector'] },
  { title: '白光终局', lesson: '综合分光、合光、状态控制与全图爆破击败首领。', startingCoins: 560, coreHealth: 8, waves: [wave(0, normal(16, 86), fast(14, 56)), wave(1.1, armored(8, 232), resistant(10, 'r', 144)), wave(1.2, fast(18, 58), armored(8, 244)), wave(1.4, resistant(9, 'r', 150), resistant(9, 'g', 150), resistant(9, 'b', 150)), wave(1.7, armored(9, 258), fast(16, 60)), wave(2.2, armored(6, 270), boss(760))], availableDevices: ALL_LEVEL_DEVICES, recommended: ['source-red', 'source-green', 'source-blue', 'combiner', 'capacitor'] },
  { title: '长廊回收', lesson: '扩展实验台需要用收集器回收多个范围终端的逸散能量。', startingCoins: 590, coreHealth: 9, waves: [wave(0, normal(18, 92), fast(14, 62)), wave(1.2, armored(8, 268), normal(14, 98)), wave(1.4, resistant(12, 'r', 156), resistant(12, 'b', 156)), wave(1.7, armored(9, 282), fast(18, 64)), wave(2, boss(800))], availableDevices: ALL_LEVEL_DEVICES, recommended: ['collector', 'radiation-source', 'splitter'] },
  { title: '折叠光井', lesson: '在更大的折线路径上维持多段稳定输出。', startingCoins: 620, coreHealth: 9, waves: [wave(0, fast(20, 64), normal(16, 100)), wave(1.2, armored(9, 288), resistant(12, 'g', 164)), wave(1.4, normal(18, 108), fast(20, 66)), wave(1.7, armored(10, 304), resistant(12, 'b', 172)), wave(2, boss(850))], availableDevices: ALL_LEVEL_DEVICES, recommended: ['mirror', 'combiner', 'laser-emitter'] },
  { title: '三色屏障', lesson: '三种抗性轮番出现，单色光路会很快失效。', startingCoins: 650, coreHealth: 8, waves: [wave(0, resistant(14, 'r', 172), resistant(14, 'g', 172)), wave(1.2, resistant(14, 'b', 178), armored(8, 312)), wave(1.4, resistant(10, 'r', 184), resistant(10, 'g', 184), resistant(10, 'b', 184)), wave(1.7, armored(10, 326), fast(20, 70)), wave(2, boss(900))], availableDevices: ALL_LEVEL_DEVICES, recommended: ['filter', 'combiner', 'brazier'] },
  { title: '双向会师', lesson: '两路敌人在中央会师，必须同时照顾左右入口。', startingCoins: 700, coreHealth: 10, waves: [wave(0, normal(12, 110, 0), normal(12, 110, 1)), wave(1.2, fast(14, 72, 0), fast(14, 72, 1)), wave(1.4, armored(7, 334, 0), resistant(10, 'r', 190, 1)), wave(1.7, resistant(10, 'b', 196, 0), armored(7, 344, 1)), wave(2, boss(940, 0), boss(940, 1))], availableDevices: ALL_LEVEL_DEVICES, recommended: ['splitter', 'collector', 'laser-emitter'] },
  { title: '螺旋增压', lesson: '长路径提高反应窗口，也要求更严谨的功率分配。', startingCoins: 720, coreHealth: 8, waves: [wave(0, normal(20, 116), fast(18, 74)), wave(1.2, armored(10, 352), resistant(14, 'g', 202)), wave(1.4, fast(24, 76), resistant(14, 'b', 208)), wave(1.7, armored(11, 366), normal(18, 124)), wave(2, boss(1000))], availableDevices: ALL_LEVEL_DEVICES, recommended: ['capacitor', 'frost-tower', 'collector'] },
  { title: '相位门阵', lesson: '用附着传感器和多组光闸动态改写光路。', startingCoins: 750, coreHealth: 8, waves: [wave(0, fast(22, 78), normal(18, 128)), wave(1.2, resistant(14, 'r', 214), armored(10, 374)), wave(1.4, fast(24, 80), resistant(14, 'b', 220)), wave(1.7, armored(12, 390), resistant(14, 'g', 226)), wave(2, boss(1060))], availableDevices: ALL_LEVEL_DEVICES, recommended: ['photo-sensor', 'shutter', 'combiner'] },
  { title: '能量瀑布', lesson: '串联收集器，把范围终端的逸散重新汇成有效光束。', startingCoins: 780, coreHealth: 8, waves: [wave(0, normal(22, 134), fast(20, 82)), wave(1.2, armored(12, 398), resistant(16, 'r', 232)), wave(1.4, resistant(12, 'g', 238), resistant(12, 'b', 238)), wave(1.7, armored(13, 414), fast(26, 84)), wave(2, boss(1120))], availableDevices: ALL_LEVEL_DEVICES, recommended: ['collector', 'radiation-source', 'brazier'] },
  { title: '交叉火线', lesson: '第二个双入口战场要求把火力投向两个相反方向。', startingCoins: 830, coreHealth: 10, waves: [wave(0, fast(16, 86, 0), fast(16, 86, 1)), wave(1.2, armored(8, 424, 0), armored(8, 424, 1)), wave(1.4, resistant(12, 'r', 246, 0), resistant(12, 'b', 246, 1)), wave(1.7, normal(20, 142, 0), resistant(14, 'g', 252, 1)), wave(2, boss(1180, 0), boss(1180, 1))], availableDevices: ALL_LEVEL_DEVICES, recommended: ['splitter', 'laser-emitter', 'capacitor'] },
  { title: '光谱风暴', lesson: '在最长路径上迎战重甲、抗性与首领的最终混编。', startingCoins: 900, coreHealth: 8, waves: [wave(0, normal(24, 150), fast(22, 90)), wave(1.2, armored(14, 438), resistant(16, 'r', 260)), wave(1.4, resistant(14, 'g', 268), resistant(14, 'b', 268)), wave(1.6, fast(28, 92), armored(14, 454)), wave(1.8, resistant(10, 'r', 276), resistant(10, 'g', 276), resistant(10, 'b', 276)), wave(2.2, armored(10, 470), boss(1320))], availableDevices: ALL_LEVEL_DEVICES, recommended: ['combiner', 'collector', 'accelerator', 'capacitor'] },
]

if (definitions.length !== layouts.length || definitions.length !== LEVEL_CAPACITIES_W.length) {
  throw new Error('Optical defense level definitions, layouts, and capacities must stay aligned.')
}

export const OPTICAL_DEFENSE_LEVELS: LevelConfig[] = definitions.map((definition, index) => {
  const layout = createLayout(layouts[index])
  return { ...definition, ...layout, id: index + 1, capacityW: LEVEL_CAPACITIES_W[index] }
})

export function getOpticalDefenseLevel(levelId: number) {
  return OPTICAL_DEFENSE_LEVELS.find((level) => level.id === levelId)
}
