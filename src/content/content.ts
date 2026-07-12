import matter from 'gray-matter'

export interface MarkdownDocument {
  slug: string
  title: string
  body: string
  sourcePath: string
}

export interface BlogPost extends MarkdownDocument {
  date: string
  summary: string
  tags: string[]
  cover?: string
}

const toTitle = (path: string) => {
  const filename = path.split('/').pop()?.replace(/\.md$/i, '') ?? 'untitled'
  return filename
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const slugFromPath = (path: string) => path.split('/').pop()?.replace(/\.md$/i, '') ?? path

export function normalizePost(path: string, raw: string): BlogPost {
  const parsed = matter(raw)
  const tags = Array.isArray(parsed.data.tags)
    ? parsed.data.tags.map(String)
    : typeof parsed.data.tags === 'string'
      ? parsed.data.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean)
      : []

  return {
    slug: slugFromPath(path),
    title: typeof parsed.data.title === 'string' ? parsed.data.title : toTitle(path),
    date: typeof parsed.data.date === 'string' ? parsed.data.date : '',
    summary: typeof parsed.data.summary === 'string' ? parsed.data.summary : '',
    tags,
    cover: typeof parsed.data.cover === 'string' ? parsed.data.cover : undefined,
    body: parsed.content.trim(),
    sourcePath: path,
  }
}

export function normalizeDocument(path: string, raw: string): MarkdownDocument {
  const parsed = matter(raw)
  return {
    slug: slugFromPath(path),
    title: typeof parsed.data.title === 'string' ? parsed.data.title : toTitle(path),
    body: parsed.content.trim(),
    sourcePath: path,
  }
}

export function sortPosts(posts: BlogPost[]) {
  return [...posts].sort((left, right) => {
    if (!left.date && !right.date) return left.title.localeCompare(right.title, 'zh-CN')
    if (!left.date) return 1
    if (!right.date) return -1
    return new Date(right.date).getTime() - new Date(left.date).getTime()
  })
}

const blogModules = import.meta.glob('/blog/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const aboutModules = import.meta.glob('/about/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

export const getBlogPosts = () => sortPosts(
  Object.entries(blogModules).map(([path, raw]) => normalizePost(path, raw)),
)

export const getBlogPost = (slug: string) => getBlogPosts().find((post) => post.slug === slug)

export const getAboutDocument = (kind: 'introduction' | 'history') => {
  const entry = Object.entries(aboutModules).find(([path]) => path.endsWith(`/${kind}.md`))
  return entry ? normalizeDocument(entry[0], entry[1]) : undefined
}
