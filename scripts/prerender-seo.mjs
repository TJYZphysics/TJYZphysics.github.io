// 预渲染脚本：为 SPA 的各内容路由生成带完整 SEO 元数据与可见内容的静态 HTML 快照，
// 并生成 sitemap.xml。快照供不执行 JavaScript 的搜索引擎（如百度）读取正文；
// 真实浏览器会通过 <script> 立即跳转回交互式站点。运行于 `npm run build` 之后，输出到 dist/。
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(import.meta.url), '..', '..')
const dist = join(root, 'dist')
const SITE_URL = 'https://tjyzphysics.github.io'
const SITE_NAME = '天津一中物理社 · TJYZ Physics'

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23080b1a'/%3E%3Cpath d='M4 12c4-7 8 7 12 0s8 7 12 0M4 20c4-7 8 7 12 0s8 7 12 0' fill='none' stroke='%2363e7ff' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E"

// ---------------------------------------------------------------------------
// Markdown 工具（最小实现，覆盖本仓库博客/about 所用语法）
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderInline(text) {
  const codes = []
  let out = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c)
    return `@@CODE_${codes.length - 1}@@`
  })
  out = escapeHtml(out)
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/@@CODE_(\d+)@@/g, (_, i) => `<code>${escapeHtml(codes[i] ?? '')}</code>`)
  return out
}

function renderTable(rows) {
  const dataRows = rows.filter((r) => !r.separator)
  if (!dataRows.length) return ''
  const rowHtml = (cells, tag) => `<tr>${cells.map((c) => `<${tag}>${renderInline(c)}</${tag}>`).join('')}</tr>`
  const thead = `<thead>${rowHtml(dataRows[0], 'th')}</thead>`
  const tbody = dataRows.length > 1 ? `<tbody>${dataRows.slice(1).map((r) => rowHtml(r, 'td')).join('')}</tbody>` : ''
  return `<table>${thead}${tbody}</table>`
}

function renderMarkdown(md, headingShift = 0) {
  const out = []
  let listType = null
  let inTable = false
  let tableRows = []
  let inQuote = false
  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null }
  }
  const closeTable = () => {
    if (inTable) { out.push(renderTable(tableRows)); tableRows = []; inTable = false }
  }
  const closeQuote = () => {
    if (inQuote) { out.push('</blockquote>'); inQuote = false }
  }

  for (const raw of md.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const trimmed = line.trim()

    if (trimmed.startsWith('|') && trimmed.includes('|')) {
      closeList(); closeQuote()
      if (!inTable) { inTable = true; tableRows = [] }
      const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) tableRows.push({ separator: true })
      else tableRows.push(cells)
      continue
    }
    closeTable()

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      closeList(); closeQuote()
      const level = Math.min(6, heading[1].length + headingShift)
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      continue
    }
    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      closeList()
      if (!inQuote) { inQuote = true; out.push('<blockquote>') }
      out.push(`<p>${renderInline(quote[1])}</p>`)
      continue
    }
    closeQuote()

    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      if (listType !== 'ul') { closeList(); listType = 'ul'; out.push('<ul>') }
      out.push(`<li>${renderInline(ul[1])}</li>`)
      continue
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      if (listType !== 'ol') { closeList(); listType = 'ol'; out.push('<ol>') }
      out.push(`<li>${renderInline(ol[1])}</li>`)
      continue
    }

    if (!trimmed) { closeList(); continue }
    closeList()
    out.push(`<p>${renderInline(line)}</p>`)
  }
  closeList(); closeTable(); closeQuote()
  return out.join('\n')
}

function parseScalar(value) {
  const t = value.trim()
  if (t.startsWith('[') && t.endsWith(']')) {
    return t.slice(1, -1).split(',').map((i) => i.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  }
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true'
  return t.replace(/^['"]|['"]$/g, '')
}

function parseFrontMatter(raw) {
  const normalized = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return { data: {}, body: normalized }
  const end = normalized.indexOf('\n---\n', 4)
  if (end < 0) return { data: {}, body: normalized }
  const data = {}
  let listKey = ''
  normalized.slice(4, end).split('\n').forEach((line) => {
    const listItem = line.match(/^\s*-\s+(.+)$/)
    if (listItem && listKey) {
      const cur = Array.isArray(data[listKey]) ? data[listKey] : []
      cur.push(parseScalar(listItem[1]))
      data[listKey] = cur
      return
    }
    const pair = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
    if (!pair) return
    listKey = pair[1]
    data[listKey] = pair[2] ? parseScalar(pair[2]) : []
  })
  return { data, body: normalized.slice(end + 5) }
}

function readMarkdown(relPath) {
  return readFileSync(join(root, relPath), 'utf8')
}

function slugFromPath(p) {
  return p.split('/').pop().replace(/\.md$/i, '')
}

// 去除正文开头的标题行（与 front matter title 重复时）
function stripLeadingTitle(body, title) {
  const trimmed = body.trimStart()
  const firstHeading = trimmed.match(/^#\s+(.+)\n+/)
  if (firstHeading && firstHeading[1].trim() === String(title).trim()) {
    return trimmed.slice(firstHeading[0].length).trim()
  }
  return trimmed.trim()
}

// ---------------------------------------------------------------------------
// 页面模板
// ---------------------------------------------------------------------------
function buildPage({ route, title, description, keywords, contentHtml, jsonLd, image }) {
  const canonical = `${SITE_URL}${route}/`
  const ogImage = image
    ? `<meta property="og:image" content="${image.startsWith('http') ? image : SITE_URL + image}" />\n    <meta name="twitter:image" content="${image.startsWith('http') ? image : SITE_URL + image}" />\n    `
    : ''
  const ld = jsonLd
    ? `  <script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n  </script>\n  `
    : ''

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#080b1a" />
    <meta name="applicable-device" content="pc,mobile" />
    <meta name="renderer" content="webkit" />
    <meta name="robots" content="index,follow" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="keywords" content="${escapeHtml(keywords)}" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:locale" content="zh_CN" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    ${ogImage}<link rel="icon" href="${FAVICON}" />
${ld}    <script>
      // 不执行 JS 的搜索引擎爬虫读取上方静态正文；真实浏览器跳转回交互式站点。
      sessionStorage.setItem('tjyzphysics:redirect', ${JSON.stringify(route)} + location.search + location.hash)
      location.replace('/')
    </script>
    <style>
      :root{color-scheme:dark}
      *{box-sizing:border-box}
      body{margin:0;background:#080b1a;color:#e6edf7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;line-height:1.8}
      .bar{display:flex;align-items:center;gap:.75rem;padding:1.1rem 1.5rem;border-bottom:1px solid #16203a;font-size:.85rem}
      .bar a{color:#63e7ff;text-decoration:none;letter-spacing:.14em;font-weight:600}
      .bar span{color:#7b8aa3}
      main{max-width:52rem;margin:0 auto;padding:3rem 1.5rem 5rem}
      h1{color:#fff;font-size:1.95rem;line-height:1.3;margin:0 0 1rem}
      h2{color:#fff;font-size:1.35rem;margin:2.2rem 0 .6rem}
      h3{color:#dbe5f3;font-size:1.1rem;margin:1.6rem 0 .4rem}
      .lead{color:#c2d0e2;font-size:1.05rem;margin:0 0 1.8rem}
      .meta{color:#8b9cb4;font-size:.85rem;margin:0 0 2rem}
      p{color:#c2d0e2;margin:0 0 1rem}
      ul,ol{margin:0 0 1rem;padding-left:1.4rem}
      li{margin:.35rem 0}
      a{color:#63e7ff}
      img{max-width:100%;border-radius:.5rem;margin:1rem 0}
      table{border-collapse:collapse;width:100%;margin:1rem 0;font-size:.92rem}
      th,td{border:1px solid #22304d;padding:.55rem .7rem;text-align:left}
      th{color:#fff;background:#0d1730}
      blockquote{border-left:3px solid #63e7ff;margin:1rem 0;padding:.2rem 0 .2rem 1rem;color:#9fb0c9}
      code{background:#0d1730;padding:.1rem .4rem;border-radius:.3rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
      .cards{display:grid;gap:1rem;margin-top:1.5rem}
      .card{border:1px solid #1c2946;border-radius:.6rem;padding:1rem 1.1rem}
      .card b{color:#fff;display:block;margin-bottom:.2rem}
      .card small{color:#8b9cb4}
      footer.bar{margin-top:3rem}
    </style>
  </head>
  <body>
    <header class="bar"><a href="/">TJYZ PHYSICS</a><span>天津一中物理社</span></header>
    <main>
${contentHtml}
    </main>
    <footer class="bar"><span>© 2026 TJYZ Physics · 为往圣继绝学，为万世开太平</span></footer>
  </body>
</html>
`
}

// ---------------------------------------------------------------------------
// 内容数据
// ---------------------------------------------------------------------------
const EXPERIMENTS = [
  ['三体模拟器', '引力与混沌'],
  ['碰撞模拟器', '动量传递'],
  ['波的传播', '干涉与衍射'],
  ['追及相遇', '相对运动'],
  ['平抛运动', '运动的分解'],
  ['电势曲面', '点电荷与场强'],
  ['电磁画布', '无界电磁实验室'],
]
const GAMES = [
  ['图灵测试', '图灵与冯诺依曼的神奇测试'],
  ['三维五子', '建议电脑端游玩'],
  ['电磁指南', '电场与洛伦兹力'],
  ['光路寻踪', '镜片与棱镜'],
  ['光路塔防', '几何光学实验台'],
  ['魔鬼天平', '只看比较，不看数字'],
]
const VIDEOS = [
  ['IYPT比赛介绍', '用滚动与自动播放推进的交互式网页影片，了解 IYPT 的研究流程、物理对抗与团队协作。', '/videos/iypt-introduction/'],
  ['IYPT 2027 题目介绍', '通过滚动或自动播放浏览 IYPT 2027 十七道正式题目的网页动画。', '/videos/iypt-2027-problems/'],
]

const orgLd = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: '天津一中物理社',
  alternateName: ['天津市第一中学物理社', 'TJYZ Physics', 'PT物理社'],
  url: `${SITE_URL}/`,
  description: '天津市第一中学学生物理社团，围绕 CYPT 开放性物理研究、实验探究与科普分享展开活动。',
  logo: `${SITE_URL}/about/team-mark.jpg`,
  parentOrganization: { '@type': 'EducationalOrganization', name: '天津市第一中学' },
}

function breadcrumb(items) {
  return { '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE_URL}${path}` })) }
}

const KEYWORDS =
  '天津一中,天津市第一中学,天津一中物理社,天津市第一中学物理社,天津一中物理,天津一中社团,天津一中PT,天津一中PT物理社,CYPT,IYPT,物理社'

// ---------------------------------------------------------------------------
// 博客文章
// ---------------------------------------------------------------------------
function loadBlogPosts() {
  const dir = join(root, 'blog')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const raw = readFileSync(join(dir, f), 'utf8')
      const { data, body } = parseFrontMatter(raw)
      const slug = slugFromPath(f)
      const title = typeof data.title === 'string' ? data.title : slug
      return {
        slug,
        title,
        summary: typeof data.summary === 'string' ? data.summary : '',
        date: typeof data.date === 'string' ? data.date : '',
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        cover: typeof data.cover === 'string' ? data.cover : undefined,
        body: stripLeadingTitle(body, title),
      }
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

function postPage(post) {
  const route = `/blog/${post.slug}`
  const tags = post.tags.length ? `<span>${post.tags.map(escapeHtml).join(' · ')}</span>` : ''
  const date = post.date ? `<span>${post.date}</span>` : ''
  const metaHtml = `<p class="meta">${[tags, date].filter(Boolean).join('　')}</p>`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.summary,
        datePublished: post.date,
        url: `${SITE_URL}${route}/`,
        author: { '@id': `${SITE_URL}/#organization` },
        publisher: { '@id': `${SITE_URL}/#organization` },
        mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}${route}/` },
        inLanguage: 'zh-CN',
      },
      orgLd,
      breadcrumb([['主页', '/'], ['物理笔记', '/blog/'], [post.title, `${route}/`]]),
    ],
  }
  const contentHtml = `<h1>${escapeHtml(post.title)}</h1>
${metaHtml}${renderMarkdown(post.body)}`
  return buildPage({
    route,
    title: `${post.title} · 天津一中物理社 | TJYZ Physics`,
    description: post.summary || '天津一中物理社的物理笔记。',
    keywords: KEYWORDS,
    image: post.cover,
    contentHtml,
    jsonLd,
  })
}

// ---------------------------------------------------------------------------
// 列表页 / 关于页
// ---------------------------------------------------------------------------
function cardList(items) {
  return `<div class="cards">${items
    .map(([title, sub], i) => `<div class="card"><b>${String(i + 1).padStart(2, '0')} · ${escapeHtml(title)}</b><small>${escapeHtml(sub)}</small></div>`)
    .join('\n')}</div>`
}

function writeStaticPages() {
  // 关于我们
  const intro = parseFrontMatter(readMarkdown('about/introduction.md'))
  const history = parseFrontMatter(readMarkdown('about/history.md'))
  const aboutContent =
    `<h1>关于我们 · 天津一中物理社</h1>
<p class="lead">天津一中物理社（天津市第一中学物理社 / PT 物理社）是天津市第一中学的学生物理社团，围绕观察、实验、表达展开。</p>
<h2>${escapeHtml(typeof intro.data.title === 'string' ? intro.data.title : '关于 PT 物理社')}</h2>
${renderMarkdown(intro.body)}
<h2>${escapeHtml(typeof history.data.title === 'string' ? history.data.title : '社团历史')}</h2>
${renderMarkdown(history.body, 1)}`
  write(join(dist, 'about'), 'index.html', buildPage({
    route: '/about',
    title: '关于我们 · 天津一中物理社 | 天津市第一中学物理社',
    description: '天津一中物理社简介与历史：CYPT 物理竞赛、科研训练、社团活动与历年成绩。一群因好奇而聚在一起的学生。',
    keywords: KEYWORDS,
    image: '/about/team-mark.jpg',
    contentHtml: aboutContent,
    jsonLd: { '@context': 'https://schema.org', '@graph': [orgLd, breadcrumb([['主页', '/'], ['关于我们', '/about/']])] },
  }))

  // 博客列表
  const posts = loadBlogPosts()
  const blogListHtml = posts
    .map(
      (p) => `<div class="card"><a href="/blog/${encodeURIComponent(p.slug)}/"><b>${escapeHtml(p.title)}</b></a><small>${escapeHtml(p.summary)}${p.date ? ` · ${p.date}` : ''}</small></div>`,
    )
    .join('\n')
  write(join(dist, 'blog'), 'index.html', buildPage({
    route: '/blog',
    title: '物理笔记 · 天津一中物理社 | TJYZ Physics',
    description: '天津一中物理社的物理笔记：实验过程、现象观察、阅读笔记与社团思考。',
    keywords: KEYWORDS,
    contentHtml: `<h1>物理笔记</h1>\n<p class="lead">把过程写下来，答案才有机会被重新检验。</p>\n<div class="cards">${blogListHtml}</div>`,
    jsonLd: { '@context': 'https://schema.org', '@graph': [breadcrumb([['主页', '/'], ['物理笔记', '/blog/']])] },
  }))

  // 文章页
  for (const post of posts) {
    write(join(dist, 'blog', post.slug), 'index.html', postPage(post))
  }

  // 实验 / 游戏 / 视频 / 导航
  const listPages = [
    {
      route: '/experiments',
      title: '互动实验 · 天津一中物理社 | TJYZ Physics',
      description: '七个浏览器互动物理实验：三体模拟器、碰撞模拟器、波的传播、追及相遇、平抛运动、电势曲面与电磁画布。',
      h1: '互动实验',
      lead: '调整质量、速度与时空路径，在浏览器里观察系统如何回应你的每一次选择。',
      cards: cardList(EXPERIMENTS),
    },
    {
      route: '/games',
      title: '物理游戏 · 天津一中物理社 | TJYZ Physics',
      description: '六个互动物理游戏：图灵测试、三维五子、电磁指南、光路寻踪、光路塔防与魔鬼天平。',
      h1: '物理游戏',
      lead: '奇奇怪怪的小东西。',
      cards: cardList(GAMES),
    },
    {
      route: '/videos',
      title: '视频 · 天津一中物理社 | TJYZ Physics',
      description: '交互式物理网页影片：IYPT 比赛介绍与 IYPT 2027 赛题，用滚动与自动播放推进。',
      h1: '视频',
      lead: '这里的影片由网页原生呈现。滚动、播放，在时间轴上看见物理。',
      cards: `<div class="cards">${VIDEOS.map(([t, s, href]) => `<div class="card"><a href="${href}"><b>${escapeHtml(t)}</b></a><small>${escapeHtml(s)}</small></div>`).join('\n')}</div>`,
    },
    {
      route: '/navigation',
      title: '导航 · 天津一中物理社 | TJYZ Physics',
      description: '物理学习与科研常用站点、AI 工具、论文与软件资源导航。',
      h1: '导航',
      lead: '发现工具，抵达知识。物理学习与科研常用站点、AI 工具、论文与软件资源汇总。',
      cards: '',
    },
  ]
  for (const p of listPages) {
    const contentHtml = `<h1>${escapeHtml(p.h1)}</h1>\n<p class="lead">${escapeHtml(p.lead)}</p>${p.cards ? '\n' + p.cards : ''}`
    write(join(dist, p.route.slice(1)), 'index.html', buildPage({
      route: p.route,
      title: p.title,
      description: p.description,
      keywords: KEYWORDS,
      contentHtml,
      jsonLd: { '@context': 'https://schema.org', '@graph': [breadcrumb([['主页', '/'], [p.h1, `${p.route}/`]])] },
    }))
  }
}

// ---------------------------------------------------------------------------
// sitemap.xml
// ---------------------------------------------------------------------------
function writeSitemap() {
  const today = new Date().toISOString().slice(0, 10)
  const posts = loadBlogPosts()
  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0', lastmod: today },
    { loc: `${SITE_URL}/about/`, priority: '0.9', lastmod: today },
    { loc: `${SITE_URL}/blog/`, priority: '0.8', lastmod: today },
    ...posts.map((p) => ({ loc: `${SITE_URL}/blog/${p.slug}/`, priority: '0.7', lastmod: p.date || today })),
    { loc: `${SITE_URL}/experiments/`, priority: '0.6', lastmod: today },
    { loc: `${SITE_URL}/games/`, priority: '0.6', lastmod: today },
    { loc: `${SITE_URL}/videos/`, priority: '0.6', lastmod: today },
    { loc: `${SITE_URL}/videos/iypt-introduction/`, priority: '0.5', lastmod: today },
    { loc: `${SITE_URL}/videos/iypt-2027-problems/`, priority: '0.5', lastmod: today },
    { loc: `${SITE_URL}/navigation/`, priority: '0.5', lastmod: today },
  ]
  const body = urls
    .map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <priority>${u.priority}</priority>\n  </url>`)
    .join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
  writeFileSync(join(dist, 'sitemap.xml'), xml, 'utf8')
}

// ---------------------------------------------------------------------------
// 工具与入口
// ---------------------------------------------------------------------------
function write(dir, file, content) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, file), content, 'utf8')
}

if (!existsSync(dist)) {
  console.error('[prerender] dist/ 不存在，请先运行 `vite build`。')
  process.exit(1)
}

writeStaticPages()
writeSitemap()
console.log('[prerender] 静态 SEO 页面与 sitemap.xml 已写入 dist/。')
