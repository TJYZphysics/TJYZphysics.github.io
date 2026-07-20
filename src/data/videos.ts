export interface HtmlVideo {
  slug: string
  title: string
  summary: string
  tags: string[]
  href: string
  chapters: number
}

export const htmlVideos: HtmlVideo[] = [
  {
    slug: 'iypt-introduction',
    title: 'IYPT比赛介绍',
    summary: '用滚动与自动播放推进的交互式网页影片，了解 IYPT 的研究流程、物理对抗与团队协作。',
    tags: ['IYPT', '初级'],
    href: '/videos/iypt-introduction/index.html',
    chapters: 20,
  },
  {
    slug: 'iypt-2027-problems',
    title: '2027 IYPT 题目介绍',
    summary: '通过滚动或自动播放浏览 IYPT 2027 十七道正式题目的网页动画，并查看官方题目资料。',
    tags: ['IYPT', '初级', '题目', 'CYPT'],
    href: '/videos/iypt-2027-problems/index.html',
    chapters: 19,
  },
]
