import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MarkdownArticle, { getArticleHeadings } from './MarkdownArticle'

describe('MarkdownArticle', () => {
  it('creates stable unique table-of-contents anchors', () => {
    expect(getArticleHeadings('## 运动方程\n### 解法\n## 运动方程')).toEqual([
      { depth: 2, id: '运动方程', text: '运动方程' },
      { depth: 3, id: '解法', text: '解法' },
      { depth: 2, id: '运动方程-1', text: '运动方程' },
    ])
  })

  it('renders KaTeX, highlighted code and an accessible image lightbox', () => {
    render(<MarkdownArticle body={'## 方程\n\n$E=mc^2$\n\n```js\nconst c = 3\n```\n\n![实验图](/experiment.png)'} />)
    expect(document.querySelector('.katex')).toBeInTheDocument()
    expect(document.querySelector('code.hljs')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '放大图片：实验图' }))
    expect(screen.getByRole('dialog', { name: '图片预览' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭图片预览' }))
    expect(screen.queryByRole('dialog', { name: '图片预览' })).not.toBeInTheDocument()
  })
})
