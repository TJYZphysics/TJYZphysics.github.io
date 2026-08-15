import { useEffect } from 'react'

export const SITE_URL = 'https://tjyzphysics.github.io'
export const SITE_NAME = '天津一中物理社 · TJYZ Physics'

interface PageMeta {
  title: string
  description: string
  /** 以 / 结尾的站点内路径，用于 canonical 与 og:url，例如 `/about/`。 */
  path?: string
  jsonLd?: object | object[]
  image?: string
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function upsertJsonLd(id: string, data: object | object[]) {
  const existing = document.getElementById(id)
  if (existing) existing.remove()
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.id = id
  script.textContent = JSON.stringify(data)
  document.head.appendChild(script)
}

/**
 * 为每个路由动态设置标题、描述、canonical、Open Graph 与 JSON-LD 结构化数据。
 * SPA 是客户端渲染，搜索引擎（Google/Bing 会执行 JS）与真实用户看到的标签由此校正。
 */
export function usePageMeta({ title, description, path = '/', jsonLd, image }: PageMeta) {
  const url = `${SITE_URL}${path}`
  const jsonLdSerialized = jsonLd ? JSON.stringify(jsonLd) : null

  useEffect(() => {
    document.title = title
    upsertMeta('name', 'description', description)
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', url)
    upsertCanonical(url)
    if (image) upsertMeta('property', 'og:image', image.startsWith('http') ? image : `${SITE_URL}${image}`)
    if (jsonLdSerialized) upsertJsonLd('page-jsonld', JSON.parse(jsonLdSerialized))
    else document.getElementById('page-jsonld')?.remove()
  }, [title, description, url, image, jsonLdSerialized])
}

/** 站点组织信息的 JSON-LD，供首页与关于页复用。 */
export const organizationJsonLd = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: '天津一中物理社',
  alternateName: ['天津市第一中学物理社', 'TJYZ Physics', 'PT物理社'],
  url: `${SITE_URL}/`,
  description: '天津市第一中学学生物理社团，围绕 CYPT 开放性物理研究、实验探究与科普分享展开活动。',
  logo: `${SITE_URL}/about/team-mark.jpg`,
  parentOrganization: { '@type': 'EducationalOrganization', name: '天津市第一中学' },
  knowsAbout: ['物理学', 'CYPT', 'IYPT', '物理实验', '物理竞赛'],
}

/** 面包屑 JSON-LD，供内页复用。 */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  }
}
