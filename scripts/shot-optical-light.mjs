#!/usr/bin/env node
/**
 * 亮色模式「光路塔防」手动核查截图。
 * 用法：node scripts/shot-optical-light.mjs
 * 前置：vite dev server 已启动（默认 http://127.0.0.1:5174）。
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'screenshots', 'optical-light-redesign')
mkdirSync(OUT, { recursive: true })

const BASE = process.env.OPTICAL_BASE ?? 'http://127.0.0.1:5174'
const save = {
  version: 3,
  unlockedLevel: 20,
  stars: {},
  unlockedDevices: ['source-red', 'mirror', 'bulb'],
  settings: { sound: false, reduceMotion: true, beamGlow: true, gameSpeed: 1 },
  tutorial: { dismissed: false, completedLevels: [] },
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function advance(page, seconds) {
  await page.evaluate((v) => window.dispatchEvent(new CustomEvent('optical-defense:advance', { detail: v })), seconds)
}

async function clickTool(page, kind) {
  await page.getByTestId(`tool-${kind}`).scrollIntoViewIfNeeded()
  await page.getByTestId(`tool-${kind}`).click()
}

async function holeIndices(page) {
  return page.locator('[data-board-hole]').evaluateAll((els) => els.map((e) => e.getAttribute('data-board-hole')))
}

async function activateHole(page, index) {
  const hole = page.locator(`[data-board-hole="${index}"]`)
  await hole.focus()
  await hole.press('Enter')
}

async function pickLevel(page, id) {
  await page.getByTestId('open-levels').click()
  await page.getByTestId(`level-${id}`).click()
  await page.getByTestId('optical-canvas').waitFor({ state: 'visible' })
  await page.waitForTimeout(400)
}

async function gameShot(page, name) {
  await page.getByTestId('optical-defense').screenshot({ path: join(OUT, `${name}.png`) })
  console.log('  saved', name)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1480, height: 980 } })
await page.addInitScript((s) => {
  localStorage.setItem('tjyz-theme', 'light')
  localStorage.setItem('tjyz-optical-defense-save-v3', JSON.stringify(s))
  sessionStorage.removeItem('tjyz-optical-current-level')
}, save)

console.log('→ 打开光路塔防（亮色）')
await page.goto(`${BASE}/games?game=optical-defense`)
await page.getByTestId('optical-defense').scrollIntoViewIfNeeded()
await page.getByTestId('optical-canvas').locator('canvas').waitFor({ state: 'visible' })
await page.getByTestId('optical-canvas').waitFor({ state: 'visible' })
await page.waitForTimeout(600)
await gameShot(page, '01-level1-build')

console.log('→ 关卡 1：放置 红光源 / 平面镜 / 灯泡 并吸附')
const l1Holes = await holeIndices(page)
const h0 = l1Holes[0]
const h2 = l1Holes[2]
const h16 = l1Holes[16] ?? l1Holes.at(-1)
await clickTool(page, 'source-red')
await activateHole(page, h0)
await clickTool(page, 'mirror')
await activateHole(page, h2)
await clickTool(page, 'bulb')
await activateHole(page, h16)
// 选中镜面 → 吸附到灯泡，产生光路
await activateHole(page, h2)
await page.getByTestId('snap-mirror').click()
await activateHole(page, h16)
await page.waitForTimeout(500)
await gameShot(page, '02-level1-built')

console.log('→ 关卡 1：启动波次并推进 12s（光束 / 敌人 / 击杀）')
await page.getByTestId('wave-control').click()
await advance(page, 12)
await page.waitForTimeout(500)
await gameShot(page, '03-level1-combat')

console.log('→ 关卡 19：放置多台攻击终端展示范围圈')
await pickLevel(page, 19)
const l19Holes = await holeIndices(page)
const first = l19Holes[0]
const terminals = ['laser-emitter', 'radiation-source', 'frost-tower', 'brazier', 'accelerator', 'capacitor']
await clickTool(page, 'source-blue')
await activateHole(page, first)
for (let i = 0; i < terminals.length; i += 1) {
  const idx = l19Holes[i + 1] ?? l19Holes.at(-1)
  if (idx === undefined) break
  await clickTool(page, terminals[i])
  try {
    await activateHole(page, idx)
  } catch {
    console.log(`  跳过 ${terminals[i]}（无孔位 ${idx}）`)
  }
}
await page.waitForTimeout(600)
await gameShot(page, '04-level19-ranges')

console.log('→ 关卡 9：选中一台仪器展示检查器配色')
await pickLevel(page, 9)
const l9Holes = await holeIndices(page)
await clickTool(page, 'prism-splitter')
await activateHole(page, l9Holes[0])
await page.waitForTimeout(300)
await gameShot(page, '05-level9-inspector')

await browser.close()
console.log('完成 →', OUT)
