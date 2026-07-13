import type {
  Collector,
  ElectromagneticLevel,
  Obstacle,
  ParticleDefinition,
  Placement,
  PlacementKind,
  Vector2,
} from './physics'

const WORLD = { kind: 'finite' as const, width: 18, height: 12 }
const ALL_TOOLS: readonly PlacementKind[] = [
  'positive-charge', 'negative-charge', 'electric-field', 'magnetic-field', 'velocity-selector',
]

function particle(
  id: string,
  startPosition: Vector2,
  startVelocity: Vector2,
  charge = 1,
  mass = 1,
  color = '#70e7ff',
): ParticleDefinition {
  return { id, label: id, charge, mass, radius: 0.18, color, startPosition, startVelocity }
}

const collector = (id: string, x: number, y: number, radius = 1.15, particleIds?: string[]): Collector => ({
  id, label: id, position: { x, y }, radius,
  accepts: particleIds ? { particleIds } : undefined,
})

const circle = (id: string, x: number, y: number, radius: number): Obstacle => ({
  id, shape: 'circle', position: { x, y }, radius,
})

const wall = (id: string, x: number, y: number, width: number, height: number): Obstacle => ({
  id, shape: 'rectangle', position: { x, y }, size: { x: width, y: height },
})

const charge = (id: string, kind: 'positive-charge' | 'negative-charge', x: number, y: number, strength = 1): Placement => ({
  id, kind, position: { x, y }, strength,
})

const region = (
  id: string,
  kind: 'electric-field' | 'magnetic-field' | 'velocity-selector',
  x: number, y: number, width: number, height: number,
  strength: number, rotation = 0, direction: 1 | -1 = 1, selectorSpeed?: number,
): Placement => ({ id, kind, position: { x, y }, size: { x: width, y: height }, strength, rotation, direction, selectorSpeed })

function level(config: Omit<ElectromagneticLevel, 'world' | 'fixedPlacements' | 'goal' | 'maxSimulationTime'> & Partial<Pick<ElectromagneticLevel, 'world' | 'fixedPlacements' | 'goal' | 'maxSimulationTime'>>): ElectromagneticLevel {
  return {
    world: WORLD,
    fixedPlacements: [],
    goal: 'collect-all',
    maxSimulationTime: 6,
    ...config,
  }
}

const AUTHORED_LEVELS: readonly ElectromagneticLevel[] = [
  level({
    id: 1, title: '同号相斥', subtitle: '初级 · 正电荷', difficulty: 'beginner',
    briefing: '放置一个正电荷，让正粒子绕过中央障碍。', hint: '把场源放在轨道上方，粒子会被向下推开。',
    particles: [particle('α', { x: 1, y: 6 }, { x: 4, y: 0 })], obstacles: [circle('岩礁', 9, 6, 0.85)],
    collectors: [collector('收集器', 16, 8.5, 1.8)], availableTools: ['positive-charge'], placementLimits: { 'positive-charge': 1 },
    referenceSolution: [charge('参考正电荷', 'positive-charge', 7, 4, 1.1)],
  }),
  level({
    id: 2, title: '负负相斥', subtitle: '初级 · 负粒子', difficulty: 'beginner',
    briefing: '负粒子也遵循同号相斥。', hint: '负电荷放在粒子上方。',
    particles: [particle('β⁻', { x: 1, y: 6 }, { x: 4.2, y: 0 }, -1, 1, '#ff8fb3')], obstacles: [wall('挡板', 9, 5.8, 1, 2.1)],
    collectors: [collector('收集器', 16, 10.5, 1.2)], availableTools: ['negative-charge'], placementLimits: { 'negative-charge': 1 },
    referenceSolution: [charge('参考负电荷', 'negative-charge', 5.5, 3.5, 1.8)],
  }),
  level({
    id: 3, title: '异号相吸', subtitle: '初级 · 引力弯道', difficulty: 'beginner',
    briefing: '用一个负电荷把正粒子拉向下方出口。', hint: '场源不要离轨道太近。',
    particles: [particle('p⁺', { x: 1, y: 4 }, { x: 4, y: 0 })], obstacles: [circle('障碍', 10, 4, 0.9)],
    collectors: [collector('收集器', 16, 7.2, 1.8)], availableTools: ['negative-charge'], placementLimits: { 'negative-charge': 1 },
    referenceSolution: [charge('参考负电荷', 'negative-charge', 7, 6, 1.15)],
  }),
  level({
    id: 4, title: '反向思考', subtitle: '初级 · 负粒子受力', difficulty: 'beginner',
    briefing: '用正电荷吸引负粒子。', hint: '先判断电场方向，再乘上粒子电性。',
    particles: [particle('e⁻', { x: 1, y: 4 }, { x: 4.1, y: 0 }, -1, 1, '#ff8fb3')], obstacles: [wall('挡板', 10, 4, 1, 2)],
    collectors: [collector('收集器', 16, 9.8, 1.2)], availableTools: ['positive-charge'], placementLimits: { 'positive-charge': 1 },
    referenceSolution: [charge('参考正电荷', 'positive-charge', 5.5, 7, 1.8)],
  }),
  level({
    id: 5, title: '惯性更大', subtitle: '初级 · 质量', difficulty: 'beginner',
    briefing: '较重粒子不容易偏转，需要更强或更近的场源。', hint: '质量变大时，加速度会减小。',
    particles: [particle('重离子', { x: 1, y: 7 }, { x: 4, y: 0 }, 1, 2, '#ffd06b')], obstacles: [circle('障碍', 10, 7, 0.95)],
    collectors: [collector('收集器', 16, 4.7, 1.7)], availableTools: ['positive-charge'], placementLimits: { 'positive-charge': 1 },
    referenceSolution: [charge('参考正电荷', 'positive-charge', 7, 9, 1.7)],
  }),
  level({
    id: 6, title: '高速掠过', subtitle: '初级 · 速度', difficulty: 'beginner',
    briefing: '高速粒子与场源作用时间短。', hint: '把电荷靠近预计轨迹，但避免过度偏转。',
    particles: [particle('快质子', { x: 1, y: 7 }, { x: 5.4, y: 0 })], obstacles: [wall('窄门', 10, 7.1, 0.8, 1.8)],
    collectors: [collector('收集器', 16.5, 5, 1.65)], availableTools: ['positive-charge'], placementLimits: { 'positive-charge': 1 },
    referenceSolution: [charge('参考正电荷', 'positive-charge', 7.2, 8.8, 1.4)], maxSimulationTime: 5,
  }),

  level({
    id: 7, title: '推拉协奏', subtitle: '中级 · 吸引与排斥', difficulty: 'intermediate',
    briefing: '同时利用上方排斥和下方吸引。', hint: '两个力可以指向同一侧。',
    particles: [particle('p⁺', { x: 1, y: 5 }, { x: 4.3, y: 0 })], obstacles: [circle('中央障碍', 9, 4.6, 1)], collectors: [collector('下出口', 16, 10.5, 1.4)],
    availableTools: ['positive-charge', 'negative-charge'], placementLimits: { 'positive-charge': 1, 'negative-charge': 1 },
    referenceSolution: [charge('推', 'positive-charge', 6.5, 3, 0.9), charge('拉', 'negative-charge', 9, 8, 0.9)],
  }),
  level({
    id: 8, title: '电性镜像', subtitle: '中级 · 负粒子双场源', difficulty: 'intermediate',
    briefing: '对负粒子复现上一关的向下合力。', hint: '交换两种场源的符号。',
    particles: [particle('e⁻', { x: 1, y: 5 }, { x: 4.3, y: 0 }, -1, 1, '#ff8fb3')], obstacles: [circle('中央障碍', 9, 4.6, 1)], collectors: [collector('下出口', 16, 10.5, 1.4)],
    availableTools: ['positive-charge', 'negative-charge'], placementLimits: { 'positive-charge': 1, 'negative-charge': 1 },
    referenceSolution: [charge('推', 'negative-charge', 6.5, 3, 0.9), charge('拉', 'positive-charge', 9, 8, 0.9)],
  }),
  level({
    id: 9, title: 'S 形航线', subtitle: '中级 · 两次转向', difficulty: 'intermediate',
    briefing: '先向下绕开第一堵墙，再向上回到出口。', hint: '两个同号电荷分置轨道两侧。',
    particles: [particle('p⁺', { x: 1, y: 5.5 }, { x: 4.2, y: 0 })], obstacles: [wall('上墙', 7, 3.1, 1.1, 6.2), wall('下墙', 12, 8.9, 1.1, 6.2)], collectors: [collector('出口', 16.5, 1.5, 1.2)],
    availableTools: ['positive-charge'], placementLimits: { 'positive-charge': 2 }, referenceSolution: [charge('转向一', 'positive-charge', 5.4, 3.5, 1.8), charge('转向二', 'positive-charge', 8.5, 10, 3.2)],
  }),
  level({
    id: 10, title: '狭缝聚焦', subtitle: '中级 · 电透镜', difficulty: 'intermediate',
    briefing: '用异号场源把粒子束引入窄出口。', hint: '接近出口处的吸引可修正方向。',
    particles: [particle('离子', { x: 1, y: 8 }, { x: 4.4, y: 0 })], obstacles: [wall('上板', 13, 2.7, 1, 5.4), wall('下板', 13, 9.3, 1, 5.4)], collectors: [collector('狭缝', 16.5, 6, 0.7)],
    availableTools: ['positive-charge', 'negative-charge'], placementLimits: { 'positive-charge': 1, 'negative-charge': 1 }, referenceSolution: [charge('排斥校正', 'positive-charge', 7, 9.5, 0.7), charge('吸引聚焦', 'negative-charge', 12, 6.8, 0.5)],
  }),
  level({
    id: 11, title: '电性分流', subtitle: '中级 · 双粒子', difficulty: 'intermediate',
    briefing: '把一正一负两颗粒子送到各自出口。', hint: '同一电场对两种电性的作用方向相反。',
    particles: [particle('正束', { x: 1, y: 6 }, { x: 4, y: 0 }, 1, 1, '#70e7ff'), particle('负束', { x: 1, y: 6 }, { x: 4, y: 0 }, -1, 1, '#ff8fb3')], obstacles: [circle('分流岛', 10, 6, 1.2)],
    collectors: [collector('上出口', 16, 1.5, 1.2, ['正束']), collector('下出口', 16, 10.5, 1.2, ['负束'])], availableTools: ['positive-charge'], placementLimits: { 'positive-charge': 1 }, referenceSolution: [charge('分流核心', 'positive-charge', 7, 7.8, 1.15)],
  }),
  level({
    id: 12, title: '三体电场', subtitle: '中级 · 场的叠加', difficulty: 'intermediate',
    briefing: '三枚点电荷共同塑造一条弯曲通道。', hint: '先用前两枚完成主转向，第三枚只做微调。',
    particles: [particle('探针', { x: 1, y: 8.5 }, { x: 4.2, y: 0 })], obstacles: [circle('A', 7.5, 7.5, .82), circle('B', 12, 4.5, .82)], collectors: [collector('终点', 16.5, 4.5, 1.2)],
    availableTools: ['positive-charge', 'negative-charge'], placementLimits: { 'positive-charge': 2, 'negative-charge': 1 }, referenceSolution: [charge('P1', 'positive-charge', 5.5, 10, 1.8), charge('N1', 'negative-charge', 9.8, 7, .8), charge('P2', 'positive-charge', 13.2, 2, .6)],
  }),

  level({
    id: 13, title: '平行板偏转', subtitle: '高级 · 匀强电场', difficulty: 'advanced',
    briefing: '在有限区域内用匀强电场画出抛物线。', hint: '正粒子的加速度与电场同向。', particles: [particle('p⁺', { x: 1, y: 9 }, { x: 4, y: 0 })], obstacles: [wall('直线封锁', 10, 8.7, 1.1, 2.8)], collectors: [collector('上出口', 16, 2, 1.2)], availableTools: ['electric-field'], placementLimits: { 'electric-field': 1 }, referenceSolution: [region('偏转板', 'electric-field', 7, 6, 10, 11, 1.25, -Math.PI / 2)],
  }),
  level({
    id: 14, title: '负电荷抛线', subtitle: '高级 · 电场反向', difficulty: 'advanced',
    briefing: '同样的电场会让负粒子向相反方向偏转。', hint: '场方向向上，负粒子却向下。', particles: [particle('e⁻', { x: 1, y: 3 }, { x: 4, y: 0 }, -1, 1, '#ff8fb3')], obstacles: [wall('直线封锁', 10, 3.3, 1.1, 2.8)], collectors: [collector('下出口', 16, 10, 1.2)], availableTools: ['electric-field'], placementLimits: { 'electric-field': 1 }, referenceSolution: [region('偏转板', 'electric-field', 7, 6, 10, 11, 1.25, -Math.PI / 2)],
  }),
  level({
    id: 15, title: '四分之一圆', subtitle: '高级 · 洛伦兹力', difficulty: 'advanced',
    briefing: '用匀强磁场让正粒子转过九十度。', hint: '半径满足 r = mv/(qB)。', particles: [particle('p⁺', { x: 2, y: 10 }, { x: 4, y: 0 })], obstacles: [wall('右侧封锁', 11, 8.5, 1, 7)], collectors: [collector('转角出口', 6, 6, 0.8)], availableTools: ['magnetic-field'], placementLimits: { 'magnetic-field': 1 }, referenceSolution: [region('分析磁场', 'magnetic-field', 7, 6, 12, 12, 1)], maxSimulationTime: 5,
  }),
  level({
    id: 16, title: '反粒子弧线', subtitle: '高级 · 电性与磁场', difficulty: 'advanced',
    briefing: '负电荷在同一磁场中向相反方向转弯。', hint: '洛伦兹力方向随电性翻转。', particles: [particle('e⁻', { x: 2, y: 2 }, { x: 4, y: 0 }, -1, 1, '#ff8fb3')], obstacles: [wall('右侧封锁', 11, 3.5, 1, 7)], collectors: [collector('转角出口', 6, 6, 0.8)], availableTools: ['magnetic-field'], placementLimits: { 'magnetic-field': 1 }, referenceSolution: [region('分析磁场', 'magnetic-field', 7, 6, 12, 12, 1)], maxSimulationTime: 5,
  }),
  level({
    id: 17, title: '速度选择器', subtitle: '高级 · 电磁抵消', difficulty: 'advanced',
    briefing: '补偿预置电场，让设计速度直线穿过狭长通道。', hint: '空布局会被固定电场带偏；调节选择器使 E总=vB。', particles: [particle('v=4', { x: 1, y: 6 }, { x: 4, y: 0 })], obstacles: [wall('上极板', 8, 2.5, 11, 1), wall('下极板', 8, 9.5, 11, 1)], collectors: [collector('直通口', 16.5, 6, 0.65)], availableTools: ['velocity-selector'], placementLimits: { 'velocity-selector': 1 }, fixedPlacements: [region('预置偏转电场', 'electric-field', 8, 6, 12, 5.5, 1, Math.PI / 2)], referenceSolution: [region('选择器', 'velocity-selector', 8, 6, 12, 5.5, 1, 0, 1, 3)], maxSimulationTime: 5,
  }),
  level({
    id: 18, title: '电磁复合弯道', subtitle: '高级 · 选择后分析', difficulty: 'advanced',
    briefing: '先抵消预置电场完成准直，再用磁场转入出口。', hint: '缺少选择器会偏转；缺少分析磁场会撞终端墙。', particles: [particle('标准离子', { x: 1, y: 9 }, { x: 4, y: 0 })], obstacles: [wall('终端墙', 13.5, 8.5, 1, 7)], collectors: [collector('分析口', 10.5, 4, 0.75)], availableTools: ['velocity-selector', 'magnetic-field'], placementLimits: { 'velocity-selector': 1, 'magnetic-field': 1 }, fixedPlacements: [region('预置偏转电场', 'electric-field', 3.5, 9, 5, 3, 1, Math.PI / 2)], referenceSolution: [region('选择器', 'velocity-selector', 3.5, 9, 5, 3, 1, 0, 1, 3), region('弯转磁场', 'magnetic-field', 9, 6.5, 7, 11, 0.8)], maxSimulationTime: 6,
  }),

  level({
    id: 19, title: '质量双谱线', subtitle: '专家 · 双质量分离', difficulty: 'expert',
    briefing: '相同速度与电荷、不同质量的离子必须进入不同出口。', hint: '较重粒子的回旋半径更大。', particles: [particle('轻离子', { x: 2, y: 10 }, { x: 4, y: 0 }, 1, 1), particle('重离子', { x: 2, y: 10 }, { x: 4, y: 0 }, 1, 2, '#ffd06b')], obstacles: [wall('束流挡板', 12, 10, .8, 2)], collectors: [collector('轻谱线', 6, 6, 0.65, ['轻离子']), collector('重谱线', 10, 2, 0.75, ['重离子'])], availableTools: ['magnetic-field'], placementLimits: { 'magnetic-field': 1 }, referenceSolution: [region('谱仪磁场', 'magnetic-field', 7, 6.5, 11, 11, 1)], maxSimulationTime: 6,
  }),
  level({
    id: 20, title: '正负分束', subtitle: '专家 · 电性分离', difficulty: 'expert',
    briefing: '把等质量的正负粒子分到上下出口。', hint: '扩大磁场覆盖上下两条四分之一圆弧，并判断磁场方向。', particles: [particle('正离子', { x: 2, y: 6 }, { x: 4, y: 0 }), particle('负离子', { x: 2, y: 6 }, { x: 4, y: 0 }, -1, 1, '#ff8fb3')], obstacles: [wall('前挡板', 10, 6, 1, 3)], collectors: [collector('上谱线', 6, 2, 0.65, ['正离子']), collector('下谱线', 6, 10, 0.65, ['负离子'])], availableTools: ['magnetic-field'], placementLimits: { 'magnetic-field': 1 }, referenceSolution: [region('双向磁场', 'magnetic-field', 4.25, 6, 5.5, 9, 1)], maxSimulationTime: 5,
  }),
  level({
    id: 21, title: '三重质量谱', subtitle: '专家 · 三出口', difficulty: 'expert',
    briefing: '把三种质量的离子分辨到三个紧邻出口。', hint: '所有粒子的 q、v、B 相同，半径只与质量成正比。', particles: [particle('m₁', { x: 2, y: 10 }, { x: 3, y: 0 }, 1, 1), particle('m₂', { x: 2, y: 10 }, { x: 3, y: 0 }, 1, 5 / 3, '#9da8ff'), particle('m₃', { x: 2, y: 10 }, { x: 3, y: 0 }, 1, 7 / 3, '#ffd06b')], obstacles: [wall('谱线隔板一', 6, 5.8, 0.25, 2), wall('谱线隔板二', 8, 3.8, 0.25, 2), wall('束流挡板', 11, 10, .8, 2)], collectors: [collector('m₁口', 5, 7, 0.48, ['m₁']), collector('m₂口', 7, 5, 0.48, ['m₂']), collector('m₃口', 9, 3, 0.48, ['m₃'])], availableTools: ['magnetic-field'], placementLimits: { 'magnetic-field': 1 }, referenceSolution: [region('高分辨磁场', 'magnetic-field', 5.5, 6.5, 8.5, 9.5, 1)], maxSimulationTime: 6,
  }),
  level({
    id: 22, title: '电荷量鉴别', subtitle: '专家 · q/m', difficulty: 'expert',
    briefing: '质量相同但电荷量不同，轨道半径也不同。', hint: '电荷量越大，半径越小。', particles: [particle('|q|=1', { x: 2, y: 10 }, { x: 4, y: 0 }), particle('|q|=2', { x: 2, y: 10 }, { x: 4, y: 0 }, 2, 1, '#b08cff')], obstacles: [circle('中心屏蔽', 5, 7.7, 0.35), wall('束流挡板', 8, 10, .8, 1.8)], collectors: [collector('单电荷口', 6, 6, 0.55, ['|q|=1']), collector('双电荷口', 4, 8, 0.55, ['|q|=2'])], availableTools: ['magnetic-field'], placementLimits: { 'magnetic-field': 1 }, referenceSolution: [region('电荷谱仪', 'magnetic-field', 4, 8, 5, 5, 1)], maxSimulationTime: 5,
  }),
  level({
    id: 23, title: '速度与质量', subtitle: '专家 · 双参数反演', difficulty: 'expert',
    briefing: '三颗粒子的质量与速度都不同，必须从 qB 曲率中辨认。', hint: '比较动量 mv，而不是只比较速度。', particles: [particle('A', { x: 2, y: 10 }, { x: 3, y: 0 }, 1, 1), particle('B', { x: 2, y: 10 }, { x: 4, y: 0 }, 1, 1.25, '#9da8ff'), particle('C', { x: 2, y: 10 }, { x: 3, y: 0 }, 1, 2, '#ffd06b')], obstacles: [wall('屏蔽一', 6.2, 5.9, 0.22, 1.7), wall('屏蔽二', 8.2, 3.9, 0.22, 1.7), wall('束流挡板', 10, 10, .8, 2)], collectors: [collector('A口', 5, 7, 0.5, ['A']), collector('B口', 7, 5, 0.5, ['B']), collector('C口', 8, 4, 0.5, ['C'])], availableTools: ['magnetic-field'], placementLimits: { 'magnetic-field': 1 }, referenceSolution: [region('动量分析磁场', 'magnetic-field', 5, 7, 7.5, 7, 1)], maxSimulationTime: 6,
  }),
  level({
    id: 24, title: '简化质谱仪', subtitle: '专家 · 综合终局', difficulty: 'expert',
    briefing: '先抵消预置电场完成准直，再在分析磁场中按质量分流。', hint: '两个装置都不可缺少：选择器补偿固定偏转，磁场按 mv 分谱。', particles: [particle('同位素-1', { x: 1, y: 10 }, { x: 4, y: 0 }, 1, 0.75), particle('同位素-2', { x: 1, y: 10 }, { x: 4, y: 0 }, 1, 1.25, '#9da8ff'), particle('同位素-3', { x: 1, y: 10 }, { x: 4, y: 0 }, 1, 1.75, '#ffd06b')], obstacles: [wall('分析屏', 14.5, 7, 0.8, 8)], collectors: [collector('轻同位素', 8, 7, 0.52, ['同位素-1']), collector('中同位素', 10, 5, 0.52, ['同位素-2']), collector('重同位素', 12, 3, 0.52, ['同位素-3'])], availableTools: ['velocity-selector', 'magnetic-field'], placementLimits: { 'velocity-selector': 1, 'magnetic-field': 1 }, fixedPlacements: [region('预置偏转电场', 'electric-field', 3, 10, 4, 2.8, 1, Math.PI / 2)], referenceSolution: [region('准直选择器', 'velocity-selector', 3, 10, 4, 2.8, 1, 0, 1, 3), region('质量分析区', 'magnetic-field', 8.75, 6.5, 8, 8, 1)], maxSimulationTime: 7,
  }),

  level({
    id: 25, title: '无界电磁实验室', subtitle: '沙盒 · 完全自由', difficulty: 'sandbox',
    briefing: '无限画布、无限器件、没有目标。搭建你自己的加速器、选择器或质谱仪。', hint: '拖动画布探索；所有器件都可以无限放置。',
    world: { kind: 'infinite', initialViewport: { width: 18, height: 12 } }, particles: [particle('自由粒子', { x: 0, y: 0 }, { x: 4, y: 0 })], obstacles: [], collectors: [], availableTools: ALL_TOOLS, placementLimits: {}, fixedPlacements: [], referenceSolution: [], goal: 'free-play', maxSimulationTime: undefined,
  }),
] as const

export const ELECTROMAGNETIC_LEVELS: readonly ElectromagneticLevel[] = AUTHORED_LEVELS

export const LEVEL_COUNT = ELECTROMAGNETIC_LEVELS.length

export function getElectromagneticLevel(id: number): ElectromagneticLevel {
  const found = ELECTROMAGNETIC_LEVELS.find((candidate) => candidate.id === id)
  if (!found) throw new RangeError(`Unknown electromagnetic guide level: ${id}`)
  return found
}
