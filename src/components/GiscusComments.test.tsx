import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import GiscusComments from './GiscusComments'

describe('Giscus comments', () => {
  it('mounts the configured Giscus client for pathname discussions', async () => {
    const { unmount } = render(<GiscusComments />)
    await waitFor(() => expect(document.querySelector('script[src="https://giscus.app/client.js"]')).toBeTruthy())
    const script = document.querySelector<HTMLScriptElement>('script[src="https://giscus.app/client.js"]')!
    expect(script.dataset.repo).toBe('TJYZphysics/TJYZphysics.github.io')
    expect(script.dataset.repoId).toBe('R_kgDOTUhB2g')
    expect(script.dataset.categoryId).toBe('DIC_kwDOTUhB2s4DBA9g')
    expect(script.dataset.mapping).toBe('pathname')
    expect(script.dataset.lang).toBe('zh-CN')
    unmount()
    expect(document.querySelector('script[src="https://giscus.app/client.js"]')).toBeNull()
  })
})
