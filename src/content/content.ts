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

interface FrontMatterResult { data: Record<string, unknown>; content: string }

function parseScalar(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  }
  return trimmed.replace(/^['"]|['"]$/g, '')
}

function parseFrontMatter(raw: string): FrontMatterResult {
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return { data: {}, content: normalized }
  const end = normalized.indexOf('\n---\n', 4)
  if (end < 0) return { data: {}, content: normalized }
  const data: Record<string, unknown> = {}
  let listKey = ''
  normalized.slice(4, end).split('\n').forEach((line) => {
    const listItem = line.match(/^\s*-\s+(.+)$/)
    if (listItem && listKey) {
      const current = Array.isArray(data[listKey]) ? data[listKey] as unknown[] : []
      current.push(parseScalar(listItem[1]))
      data[listKey] = current
      return
    }
    const pair = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
    if (!pair) return
    listKey = pair[1]
    data[listKey] = pair[2] ? parseScalar(pair[2]) : []
  })
  return { data, content: normalized.slice(end + 5) }
}

export function normalizePost(path: string, raw: string): BlogPost {
  const parsed = parseFrontMatter(raw)
  const tags = Array.isArray(parsed.data.tags)
    ? parsed.data.tags.map(String)
    : typeof parsed.data.tags === 'string'
      ? parsed.data.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean)
      : []

  const title = typeof parsed.data.title === 'string' ? parsed.data.title : toTitle(path)
  const content = parsed.content.trimStart()
  const firstHeading = content.match(/^#\s+(.+)\n+/)
  const body = firstHeading?.[1].trim() === title.trim()
    ? content.slice(firstHeading[0].length).trim()
    : content.trim()
  return {
    slug: slugFromPath(path),
    title,
    date: typeof parsed.data.date === 'string' ? parsed.data.date : '',
    summary: typeof parsed.data.summary === 'string' ? parsed.data.summary : '',
    tags,
    cover: typeof parsed.data.cover === 'string' ? parsed.data.cover : undefined,
    body,
    sourcePath: path,
  }
}

export function normalizeDocument(path: string, raw: string): MarkdownDocument {
  const parsed = parseFrontMatter(raw)
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
