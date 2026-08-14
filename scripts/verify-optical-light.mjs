#!/usr/bin/env node
/**
 * 亮色「光路塔防」程序化核验：解码画布截图逐像素采样 + 断言 chrome 计算样式。
 * 核验三个投诉点：
 *   1. 光束不再被「洗白」→ 采样光束中点必须是饱和红色。
 *   2. 范围圈清爽明快 → 采样范围描边应接近强调色的浅色版（不是暗色）。
 *   3. 仪器配色协调 → 仪器身暗色、功能环高饱和、调色板图标同族同色。
 */
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.OPTICAL_BASE ?? 'http://127.0.0.1:5174'
const save = {
  version: 3,
  unlockedLevel: 20,
  stars: {},
  unlockedDevices: ['source-red', 'mirror', 'bulb'],
  settings: { sound: false, reduceMotion: true, beamGlow: true, gameSpeed: 1 },
  tutorial: { dismissed: false, completedLevels: [] },
}

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✅' : '  ❌'} ${name} — ${detail}`)
}

async function clickTool(page, kind) {
  await page.getByTestId(`tool-${kind}`).scrollIntoViewIfNeeded()
  await page.getByTestId(`tool-${kind}`).click()
}
async function activateHole(page, index) {
  const hole = page.locator(`[data-board-hole="${index}"]`)
  await hole.focus()
  await hole.press('Enter')
}
async function holeMap(page) {
  // 从键盘网格按钮读取逻辑坐标（百分比 → 1200×700）。
  return page.locator('[data-board-hole]').evaluateAll((els) => els.map((e) => ({
    id: e.getAttribute('data-board-hole'),
    x: parseFloat(e.style.left) / 100 * 1200,
    y: parseFloat(e.style.top) / 100 * 700,
  })))
}
async function shotShell(page) {
  const buf = await page.getByTestId('optical-canvas').screenshot()
  return PNG.sync.read(buf)
}
function px(png, x, y) {
  const xi = Math.max(0, Math.min(png.width - 1, Math.round(x)))
  const yi = Math.max(0, Math.min(png.height - 1, Math.round(y)))
  const i = (png.width * yi + xi) * 4
  return [png.data[i], png.data[i + 1], png.data[i + 2]]
}
const toImg = (png, lx, ly) => [lx / 1200 * png.width, ly / 700 * png.height]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1480, height: 980 } })
await page.addInitScript((s) => {
  localStorage.setItem('tjyz-theme', 'light')
  localStorage.setItem('tjyz-optical-defense-save-v3', JSON.stringify(s))
  sessionStorage.removeItem('tjyz-optical-current-level')
}, save)

// ---------------- 关卡 1：建好防线并开战 ----------------
await page.goto(`${BASE}/games?game=optical-defense`)
await page.getByTestId('optical-defense').scrollIntoViewIfNeeded()
await page.getByTestId('optical-canvas').locator('canvas').waitFor({ state: 'visible' })
await page.waitForTimeout(500)
const holes = await holeMap(page)
const src = holes[0]
const mir = holes[2]
const bulb = holes[16] ?? holes.at(-1)

await clickTool(page, 'source-red')
await activateHole(page, src.id)
await clickTool(page, 'mirror')
await activateHole(page, mir.id)
await clickTool(page, 'bulb')
await activateHole(page, bulb.id)
await activateHole(page, mir.id)
await page.getByTestId('snap-mirror').click()
await activateHole(page, bulb.id)
await page.getByTestId('wave-control').click()
await page.evaluate((v) => window.dispatchEvent(new CustomEvent('optical-defense:advance', { detail: v })), 12)
await page.waitForTimeout(600)

const png = await shotShell(page)
console.log(`画布截图 ${png.width}×${png.height}`)

// 辅助：在逻辑坐标附近小窗搜索满足谓词的最优点（孔位按钮可能偏移 1-2px）
function bestInWindow(lx, ly, radius, pred) {
  let best = null
  for (let dy = -radius; dy <= radius; dy += 2) {
    for (let dx = -radius; dx <= radius; dx += 2) {
      const c = px(png, ...toImg(png, lx + dx, ly + dy))
      const score = pred(c)
      if (score && (!best || score > best[0])) best = [score, c]
    }
  }
  return best ? best[1] : null
}

// 1) 台面底色：统计近白像素占比（网格线只是细线，台面应大面积近白）
let whiteCount = 0
let total = 0
for (let y = 0; y < png.height; y += 2) {
  for (let x = 0; x < png.width; x += 2) {
    const i = (png.width * y + x) * 4
    const r = png.data[i]; const g = png.data[i + 1]; const b = png.data[i + 2]
    total += 1
    if (r >= 238 && g >= 240 && b >= 244 && Math.abs(r - b) <= 12) whiteCount += 1
  }
}
const whiteFrac = whiteCount / total
check('台面近白纸（白色占比高）', whiteFrac > 0.3, `${(whiteFrac * 100).toFixed(1)}% 近白像素`)

// 2) 光束为饱和红（沿光源→镜面线段逐点采样取最饱和者）
let beamPixel = null
for (let t = 0.15; t <= 0.85; t += 0.1) {
  const c = bestInWindow(src.x + (mir.x - src.x) * t, src.y + (mir.y - src.y) * t, 6,
    (p) => p[0] - Math.max(p[1], p[2]))
  if (c) {
    const s = c[0] - Math.max(c[1], c[2])
    if (!beamPixel || s > beamPixel[0]) beamPixel = [s, c]
  }
}
const [bmr, bmg, bmb] = beamPixel ? beamPixel[1] : [0, 0, 0]
check('光束为饱和红（未被洗白）', bmr >= 160 && bmg <= 120 && bmb <= 130, `rgb(${bmr},${bmg},${bmb})`)

// 3) 仪器身为阳极氧化暗色（在孔位附近找最暗点）
const dark = bestInWindow(src.x, src.y, 14, (p) => p.every((v) => v <= 110) ? 220 - (p[0] + p[1] + p[2]) / 3 : 0)
check('仪器身暗色', !!dark && Math.max(...dark) <= 95, dark ? `rgb(${dark.join(',')})` : '未找到')

// 4) 仪器功能环高饱和红（在暗身周围找红色环）
const ring = bestInWindow(src.x, src.y, 30, (p) => p[0] - Math.max(p[1], p[2]) >= 90 ? p[0] - Math.max(p[1], p[2]) : 0)
check('仪器功能环高饱和红', !!ring && ring[0] >= 180 && ring[1] <= 110 && ring[2] <= 125, ring ? `rgb(${ring.join(',')})` : '未找到')

// 5) 灯泡范围圈：从中心向外扫描找最外沿非白像素，应为暖色浅描边
let foundRing = null
for (let r = 20; r <= 128; r += 2) {
  const [x, y] = toImg(png, bulb.x + r, bulb.y)
  const c = px(png, x, y)
  if (c[2] < 225 && c[0] - c[2] >= 18) { foundRing = c; break }
}
check('范围圈为明快浅色描边（非暗色）', !!foundRing, foundRing ? `rgb(${foundRing.join(',')})` : '未找到')

// 6) 敌人可见（深色小块沿路）—— 画布上统计高饱和像素数量（光束/范围/敌人）
let saturated = 0
let pastel = 0
for (let y = 0; y < png.height; y += 3) {
  for (let x = 0; x < png.width; x += 3) {
    const i = (png.width * y + x) * 4
    const r = png.data[i]; const g = png.data[i + 1]; const b = png.data[i + 2]
    if (Math.max(r, g, b) - Math.min(r, g, b) >= 90) saturated += 1
    else if (r >= 235 && g >= 205 && b <= 225 && r - b >= 18) pastel += 1
  }
}
check('画面存在足够的饱和色像素（光束/仪器/敌人）', saturated >= 150, `${saturated} px`)
check('存在浅色范围晕染像素', pastel >= 40, `${pastel} px`)

// ---------------- chrome 计算样式 ----------------
const chrome = await page.evaluate(() => {
  const el = (sel) => getComputedStyle(document.querySelector(sel))
  const svg = document.querySelector('[data-testid="tool-source-red"] svg')
  return {
    topbar: el('.optical-defense__topbar').backgroundColor,
    shell: el('.optical-defense__canvas-shell').backgroundColor,
    toolRed: getComputedStyle(svg).color,
    mission: el('.optical-defense__mission').backgroundImage,
  }
})
check('顶栏亮底', /rgb\(251, 251, 253\)/.test(chrome.topbar), chrome.topbar)
check('画布壳亮灰', /rgb\(230, 233, 239\)/.test(chrome.shell), chrome.shell)
check('红光源图标 = 高饱和红', /rgb\(221, 47, 58\)/.test(chrome.toolRed), chrome.toolRed)
check('任务条带暖调渐变', chrome.mission.includes('gradient') || chrome.mission.includes('rgb(243, 237, 223)'), chrome.mission.slice(0, 60))

// ---------------- 关卡 19：范围圈多样性 ----------------
await page.getByTestId('open-levels').click()
await page.getByTestId('level-19').click()
await page.getByTestId('optical-canvas').locator('canvas').waitFor({ state: 'visible' })
await page.waitForTimeout(400)
const holes19 = await holeMap(page)
const f = holes19[0]
await clickTool(page, 'source-blue')
await activateHole(page, f.id)
const termKinds = ['laser-emitter', 'radiation-source', 'frost-tower', 'brazier', 'accelerator', 'capacitor']
for (let i = 0; i < termKinds.length; i += 1) {
  const idx = holes19[i + 1]
  if (!idx) break
  await clickTool(page, termKinds[i])
  try { await activateHole(page, idx.id) } catch { /* skip */ }
}
await page.waitForTimeout(600)
const png19 = await shotShell(page)
// 统计多种浅色（红/蓝/紫/冰蓝/橙）范围晕染像素数量
let diverse = 0
const seen = new Set()
for (let y = 0; y < png19.height; y += 2) {
  for (let x = 0; x < png19.width; x += 2) {
    const i = (png19.width * y + x) * 4
    const r = png19.data[i]; const g = png19.data[i + 1]; const b = png19.data[i + 2]
    if (r >= 230 && g >= 205 && b <= 235 && (r - b >= 20 || b - r >= 16)) {
      diverse += 1
      seen.add(`${Math.round(r / 16)},${Math.round(g / 16)},${Math.round(b / 16)}`)
    }
  }
}
check('多色浅色范围圈（≥3 类色相）', seen.size >= 3, `${seen.size} 类色相 / ${diverse} px`)

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n核验结果：${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
