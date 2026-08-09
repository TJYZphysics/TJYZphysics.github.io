export const ANSWER_OPTIONS = [
  { value: 0, label: '完全不像我', shortLabel: '完全不像' },
  { value: 1, label: '不太像我', shortLabel: '不太像' },
  { value: 2, label: '一半一半', shortLabel: '一半一半' },
  { value: 3, label: '比较像我', shortLabel: '比较像' },
  { value: 4, label: '非常像我', shortLabel: '非常像' },
] as const

export type AnswerValue = typeof ANSWER_OPTIONS[number]['value']

export const DIMENSION_IDS = [
  'expression',
  'sensitivity',
  'rhythm',
  'social',
  'decision',
  'aura',
] as const

export type DimensionId = typeof DIMENSION_IDS[number]

export type Question = {
  id: number
  dimension: DimensionId
  prompt: string
  scene: string
  direction: 1 | -1
}

export type Dimension = {
  id: DimensionId
  label: string
  vonPole: string
  turingPole: string
  summary: string
}

export const DIMENSIONS: readonly Dimension[] = [
  { id: 'expression', label: '表达方式', vonPole: '直球', turingPole: '留白', summary: '你如何把心里的想法递给别人' },
  { id: 'sensitivity', label: '感受雷达', vonPole: '钝感', turingPole: '敏锐', summary: '你对情绪、气氛和细节的接收强度' },
  { id: 'rhythm', label: '生活节奏', vonPole: '排布', turingPole: '游走', summary: '你偏爱确定的秩序，还是顺着灵感转弯' },
  { id: 'social', label: '人群距离', vonPole: '外放', turingPole: '内收', summary: '你在人群与独处之间的充电方式' },
  { id: 'decision', label: '决定速度', vonPole: '果断', turingPole: '反刍', summary: '面对岔路时，你会立刻落子还是多看一会儿' },
  { id: 'aura', label: '气场质地', vonPole: '锋利', turingPole: '柔和', summary: '压力与分歧出现时，你自然流露的力量形状' },
] as const

export const QUESTIONS: readonly Question[] = [
  { id: 1, dimension: 'expression', direction: 1, scene: '一句话到了嘴边', prompt: '我常会换一种更委婉的说法，给对方留一点理解的空间。' },
  { id: 2, dimension: 'sensitivity', direction: 1, scene: '走进熟悉的房间', prompt: '即使没人说明，我也容易察觉气氛里很细小的变化。' },
  { id: 3, dimension: 'rhythm', direction: -1, scene: '普通的一天开始了', prompt: '我会先把要做的事排出清楚顺序，再放心开始。' },
  { id: 4, dimension: 'social', direction: -1, scene: '热闹正在发生', prompt: '人越多，我往往越有精神，也更容易进入状态。' },
  { id: 5, dimension: 'decision', direction: 1, scene: '两个选择都不错', prompt: '我会在脑中反复预演它们带来的细微感受。' },
  { id: 6, dimension: 'aura', direction: -1, scene: '意见正面相撞', prompt: '我通常会把立场说得清楚有力，不太绕弯。' },
  { id: 7, dimension: 'expression', direction: -1, scene: '朋友问我真实看法', prompt: '我倾向于直接给出结论，即使听起来不够圆润。' },
  { id: 8, dimension: 'sensitivity', direction: -1, scene: '一句无心的话落下', prompt: '只要对方没有恶意，我通常很快就能把它抛在脑后。' },
  { id: 9, dimension: 'rhythm', direction: 1, scene: '计划之外出现新念头', prompt: '如果那个念头足够吸引人，我愿意临时改变原来的安排。' },
  { id: 10, dimension: 'social', direction: 1, scene: '一场聚会结束', prompt: '哪怕聚会很开心，我也需要独处一阵才能真正恢复。' },
  { id: 11, dimension: 'decision', direction: -1, scene: '时间不允许犹豫', prompt: '我能快速抓住最重要的部分，然后承担自己的选择。' },
  { id: 12, dimension: 'aura', direction: 1, scene: '气氛开始紧绷', prompt: '我会下意识放轻语气，让场面先松下来。' },
  { id: 13, dimension: 'expression', direction: 1, scene: '很难描述的情绪', prompt: '比起准确命名，我更习惯借语气、画面或暗示让别人感受到它。' },
  { id: 14, dimension: 'sensitivity', direction: 1, scene: '对话已经结束', prompt: '我有时还会回想对方的停顿、眼神或某个词的分量。' },
  { id: 15, dimension: 'rhythm', direction: -1, scene: '熟悉的物品被挪动', prompt: '如果它不在平常的位置，我会明显觉得哪里不对。' },
  { id: 16, dimension: 'social', direction: -1, scene: '一群陌生人沉默着', prompt: '我常愿意先开口，给大家一个进入谈话的台阶。' },
  { id: 17, dimension: 'decision', direction: 1, scene: '没有标准答案', prompt: '我宁愿多等一会儿，也想把每种选择对人的影响想清楚。' },
  { id: 18, dimension: 'aura', direction: -1, scene: '压力忽然上升', prompt: '我的声音和动作会自然变得更坚定，带着大家往前走。' },
  { id: 19, dimension: 'expression', direction: -1, scene: '群聊突然冷场', prompt: '我不介意扔出一句鲜明的话，把气氛重新点起来。' },
  { id: 20, dimension: 'sensitivity', direction: -1, scene: '周围有些嘈杂', prompt: '我通常能屏蔽无关动静，继续专注于眼前的事情。' },
  { id: 21, dimension: 'rhythm', direction: 1, scene: '周末没有安排', prompt: '我享受这种空白，让当天的心情决定下一站。' },
  { id: 22, dimension: 'social', direction: 1, scene: '可以选择谈话方式', prompt: '比起在人群里成为焦点，我更喜欢和一两个人聊得很深。' },
  { id: 23, dimension: 'decision', direction: -1, scene: '大家都在等待方向', prompt: '即使信息还不完整，我也愿意先做决定，再根据变化调整。' },
  { id: 24, dimension: 'aura', direction: 1, scene: '朋友描述我的存在感', prompt: '他们更可能说我温和细腻，而不是强势醒目。' },
] as const
