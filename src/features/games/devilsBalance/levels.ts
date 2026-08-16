import { cloneTrays, emptyPan, type DevilBalanceLevel, type Pan, type Trays, type ColorId } from './model'

const p = (values: Partial<Pan> = {}): Pan => ({ ...emptyPan(), ...values })
const t = (a: Partial<Pan>, b: Partial<Pan>, c: Partial<Pan>, d: Partial<Pan>): Trays => [p(a), p(b), p(c), p(d)]

const BASE_LEVELS: DevilBalanceLevel[] = [
  {
    id: 'devils-balance-01', order: 1, name: '第一枚砝码', difficulty: '入门',
    description: '先学会把已知的红色基准放进推理链。', hint: '从红色基准开始，把每次结果当成一条不等式。',
    reference: { color: 'red', weight: 5 }, target: { red: 5, yellow: 2, green: 7, blue: 4, purple: 9 },
    inventoryPerColor: 5, playerLimit: 3, maxTurns: 8,
    npcPhases: [
      t({}, { purple: 1 }, { green: 1 }, { purple: 1 }), t({}, {}, { blue: 1 }, {}),
      t({}, { red: 1, blue: 1 }, {}, {}), t({ green: 1 }, { yellow: 1, blue: 1 }, {}, {}),
    ],
    solutionPlan: [
      t({ blue: 1 }, { green: 1 }, { yellow: 1 }, {}), t({}, { green: 1 }, {}, { yellow: 2 }),
      t({ purple: 1 }, {}, { yellow: 1 }, {}), t({}, { blue: 1 }, { purple: 1 }, {}),
    ],
  },
  {
    id: 'devils-balance-02', order: 2, name: '交叉读数', difficulty: '入门',
    description: '双天平同时给出信号，开始观察颜色之间的相对顺序。', hint: '一边锁定黄色，一边用另一台天平排除候选。',
    reference: { color: 'yellow', weight: 4 }, target: { red: 3, yellow: 4, green: 8, blue: 1, purple: 6 },
    inventoryPerColor: 5, playerLimit: 3, maxTurns: 8,
    npcPhases: [
      t({}, { yellow: 1 }, {}, { red: 1 }), t({}, { red: 1, yellow: 1 }, { red: 1 }, {}),
      t({}, {}, {}, {}),
    ],
    solutionPlan: [
      t({}, {}, { purple: 1 }, { red: 1 }), t({ green: 1 }, {}, { purple: 1 }, { green: 1 }),
      t({ blue: 2 }, { yellow: 1 }, {}, {}),
    ],
  },
  {
    id: 'devils-balance-03', order: 3, name: '双盘校准', difficulty: '入门',
    description: '用更少的自有方块，借助 NPC 的投放完成第一次校准。', hint: '不要追着一个颜色猜，两个天平可以同时缩小两个区间。',
    reference: { color: 'green', weight: 2 }, target: { red: 8, yellow: 6, green: 2, blue: 9, purple: 4 },
    inventoryPerColor: 5, playerLimit: 3, maxTurns: 8,
    npcPhases: [
      t({}, {}, {}, {}), t({ red: 1 }, {}, {}, { red: 1 }),
      t({ red: 1 }, {}, {}, { red: 1 }), t({ purple: 1 }, { blue: 1 }, {}, {}),
    ],
    solutionPlan: [
      t({ red: 1 }, { purple: 2 }, {}, {}), t({ purple: 1 }, { yellow: 2 }, {}, {}),
      t({}, { blue: 1 }, { yellow: 1 }, {}), t({ green: 1, purple: 1 }, {}, {}, { purple: 1 }),
    ],
  },
  {
    id: 'devils-balance-04', order: 4, name: '盲区边缘', difficulty: '进阶',
    description: '已知颜色换到蓝图之外，必须重新建立参照关系。', hint: '蓝色基准不是唯一的支点，先找到能稳定比较的组合。',
    reference: { color: 'blue', weight: 3 }, target: { red: 1, yellow: 4, green: 6, blue: 3, purple: 8 },
    inventoryPerColor: 5, playerLimit: 2, maxTurns: 8,
    npcPhases: [
      t({}, { yellow: 1 }, { red: 1 }, { purple: 1 }), t({}, { yellow: 1 }, { purple: 1 }, {}),
      t({ green: 1 }, { yellow: 1, purple: 1 }, {}, {}),
    ],
    solutionPlan: [
      t({ purple: 1 }, { yellow: 1 }, {}, {}), t({ red: 1, blue: 1 }, {}, {}, {}),
      t({ green: 1 }, {}, {}, { purple: 1 }),
    ],
  },
  {
    id: 'devils-balance-05', order: 5, name: '噪声之中', difficulty: '进阶',
    description: 'NPC 投放变得更嘈杂，但每一枚方块都仍然是线索。', hint: '先读清 NPC 的两边，再决定自己的两枚方块要补在哪。',
    reference: { color: 'purple', weight: 6 }, target: { red: 9, yellow: 3, green: 7, blue: 2, purple: 6 },
    inventoryPerColor: 5, playerLimit: 2, maxTurns: 8,
    npcPhases: [
      t({ yellow: 1, purple: 1 }, {}, {}, {}), t({}, {}, { purple: 1 }, { green: 1 }),
      t({ green: 1 }, { blue: 1 }, {}, { purple: 1 }), t({}, { red: 1 }, { purple: 1 }, { yellow: 1 }),
    ],
    solutionPlan: [
      t({}, { red: 1 }, { purple: 1 }, {}), t({ yellow: 1 }, { blue: 1 }, {}, {}),
      t({}, { purple: 1 }, { purple: 1 }, {}), t({ green: 1 }, {}, {}, { yellow: 1 }),
    ],
  },
  {
    id: 'devils-balance-06', order: 6, name: '不对称证据', difficulty: '进阶',
    description: '两台天平的证据不再同步，留意每条记录对应的那一台。', hint: '把结果写成“左盘总重”和“右盘总重”的比较，不要混淆两台天平。',
    reference: { color: 'red', weight: 5 }, target: { red: 5, yellow: 8, green: 1, blue: 6, purple: 10 },
    inventoryPerColor: 5, playerLimit: 2, maxTurns: 9,
    npcPhases: [
      t({}, {}, { green: 3 }, {}), t({}, {}, { yellow: 1 }, { green: 1, blue: 1 }),
      t({ red: 1 }, { blue: 1 }, { yellow: 1 }, {}),
    ],
    solutionPlan: [
      t({}, {}, { red: 1 }, { purple: 1 }), t({}, { red: 1 }, {}, { green: 1 }),
      t({}, {}, { green: 1 }, { purple: 1 }),
    ],
  },
  {
    id: 'devils-balance-07', order: 7, name: '临界重量', difficulty: '挑战',
    description: '多个颜色接近临界值，平衡结果成为最有价值的证据。', hint: '看到“=”时，优先把它记录成精确方程，而不是模糊的排序。',
    reference: { color: 'yellow', weight: 6 }, target: { red: 2, yellow: 6, green: 9, blue: 4, purple: 7 },
    inventoryPerColor: 5, playerLimit: 2, maxTurns: 9,
    npcPhases: [
      t({ red: 1 }, {}, {}, { purple: 1 }), t({}, { yellow: 1 }, { green: 1 }, { purple: 1 }),
      t({}, { blue: 1 }, {}, { red: 1, yellow: 1 }), t({ yellow: 1 }, { purple: 1 }, {}, {}),
    ],
    solutionPlan: [
      t({ red: 1 }, { blue: 1 }, {}, {}), t({}, {}, {}, { red: 1 }),
      t({ purple: 1 }, {}, { purple: 1 }, {}), t({}, {}, { blue: 1 }, {}),
    ],
  },
  {
    id: 'devils-balance-08', order: 8, name: '换位实验', difficulty: '挑战',
    description: '已知参照改为绿色，方块资源也更紧张。', hint: '换一个颜色并不会改变候选空间的规则，只会改变你的第一步。',
    reference: { color: 'green', weight: 4 }, target: { red: 8, yellow: 1, green: 4, blue: 10, purple: 3 },
    inventoryPerColor: 5, playerLimit: 2, maxTurns: 8,
    npcPhases: [
      t({}, {}, {}, { red: 1, yellow: 2 }), t({ red: 1 }, { green: 1, purple: 1 }, {}, {}),
      t({}, {}, { purple: 1 }, { green: 1 }),
    ],
    solutionPlan: [
      t({ yellow: 1 }, {}, { blue: 1 }, {}), t({}, {}, {}, { red: 1 }),
      t({ blue: 1 }, {}, { yellow: 1 }, {}),
    ],
  },
  {
    id: 'devils-balance-09', order: 9, name: '紫色回声', difficulty: '专家',
    description: '信息被拆成多回合回声，必须保留每条历史记录。', hint: '回看历史记录，寻找两次同色比较之间的差值。',
    reference: { color: 'blue', weight: 7 }, target: { red: 4, yellow: 9, green: 2, blue: 7, purple: 6 },
    inventoryPerColor: 5, playerLimit: 2, maxTurns: 10,
    npcPhases: [
      t({}, { green: 1 }, { green: 1 }, { yellow: 1 }), t({}, { red: 1, green: 1 }, {}, {}),
      t({}, { green: 2 }, {}, { green: 1 }), t({ purple: 1 }, { blue: 1 }, { blue: 1 }, {}),
      t({ blue: 1 }, {}, { red: 1 }, {}),
    ],
    solutionPlan: [
      t({}, { green: 1 }, { blue: 1 }, {}), t({ purple: 1 }, {}, {}, {}),
      t({ red: 1 }, {}, { purple: 1 }, {}), t({ green: 1 }, {}, {}, {}),
      t({}, { purple: 1 }, { blue: 1 }, {}),
    ],
  },
  {
    id: 'devils-balance-10', order: 10, name: '最后的秤盘', difficulty: '专家',
    description: '十关终局：组合投放少而信息密，任何一枚方块都不能浪费。', hint: '把两台天平当成一个联立系统，最后一次投放要服务于唯一解。',
    reference: { color: 'purple', weight: 5 }, target: { red: 6, yellow: 2, green: 10, blue: 1, purple: 5 },
    inventoryPerColor: 5, playerLimit: 2, maxTurns: 8,
    npcPhases: [
      t({ purple: 1 }, { yellow: 2 }, {}, {}), t({ blue: 1 }, {}, { blue: 1 }, {}),
      t({}, {}, { red: 1, yellow: 1 }, { green: 1 }),
    ],
    solutionPlan: [
      t({}, { blue: 1 }, {}, { purple: 1 }), t({}, {}, { purple: 1 }, { red: 1 }),
      t({}, {}, { blue: 1 }, {}),
    ],
  },
]

function seededPhase(seed: number, pieceLimit = 3): Trays {
  let state = seed >>> 0
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
  const trays = [emptyPan(), emptyPan(), emptyPan(), emptyPan()] as Trays
  const count = Math.floor(next() * (pieceLimit + 1))
  const colors: ColorId[] = ['red', 'yellow', 'green', 'blue', 'purple']
  for (let index = 0; index < count; index += 1) {
    const color = colors[Math.floor(next() * colors.length)]
    const pan = Math.floor(next() * 4)
    trays[pan][color] += 1
  }
  return trays
}

export function npcPhase(level: DevilBalanceLevel, turnIndex: number): Trays {
  return cloneTrays(level.npcPhases[turnIndex] ?? seededPhase(level.order * 7919 + turnIndex * 104729))
}

export const DEVILS_BALANCE_LEVELS = BASE_LEVELS
