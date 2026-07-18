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
]
