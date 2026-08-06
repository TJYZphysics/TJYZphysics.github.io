#!/usr/bin/env node
/**
 * 管理者的验收工具（明卷）。执行者不许修改本文件。
 *
 * 两种模式：
 *   node scripts/verify-perf.mjs --baseline   先跑出"优化前"基线，存入 scripts/.perf-baseline.json
 *   node scripts/verify-perf.mjs              对比基线 + 硬指标，全部达标退出码 0，否则 1
 *
 * 它自己：npm run build → 解析产物体积 → 起 vite preview → 用 CDP 连 headless Chrome
 * （CPU 4x 节流 + 390×844@3x）测各实验 FPS、移动端布局重叠，跑 npm test 看是否全绿。
 *
 * 零 npm 依赖：Node ≥21 内置全局 fetch 与 WebSocket。
 */
import { spawnSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_FILE = join(dirname(fileURLToPath(import.meta.url)), '.perf-baseline.json')
const MODE = process.argv.includes('--baseline') ? 'baseline' : 'check'

// ------------------------------------------------------------------ 硬指标
const HARD = {
  indexJsGzipKB: 190,        // 主包 gzip，从 275.50 降到 ≤190
  indexCssGzipKB: 24,        // 全局 CSS gzip，从 26.31 降到 ≤24
  potentialGzipKB: 120,      // 电势曲面(three.js) chunk gzip，从 144.15 降到 ≤120
  minFps: 30,                // 凡基线 <30 的实验必须 ≥30
  maxWorstGapMs: 100,        // 每个实验的帧间隔不能超过验收上限
  minTests: 174,              // 保证物理/关卡回归覆盖没有被删减
  noRegressFps: 0,           // 任何实验不得低于自己基线
}

const LABS = [
  { key: 'wave',       url: '/experiments' },
  { key: 'threeBody',  url: '/experiments?experiment=three-body', action: 'threeBody:start' },
  { key: 'electromagnetic', url: '/experiments?experiment=electromagnetic', action: 'em:sandbox+run' },
  { key: 'potential',  url: '/experiments?experiment=potential' },
  { key: 'collision',  url: '/experiments?experiment=collision', action: 'collision:run' },
  { key: 'pursuit',    url: '/experiments?experiment=pursuit', action: 'pursuit:run' },
  { key: 'projectile', url: '/experiments?experiment=projectile', action: 'projectile:run' },
  { key: 'causal',     url: '/experiments?experiment=causal', action: 'causal:none' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (s) => console.log(s)

const ANSI_ESCAPE_RE = /\u001B\][\s\S]*?(?:\u0007|\u001B\\)|\u001B\[[0-?]*[ -/]*[@-~]/g

function stripAnsi(value) {
  return String(value ?? '').replace(ANSI_ESCAPE_RE, '').replace(/\r/g, '')
}

function parseViteGzip(output, assetPattern) {
  for (const line of stripAnsi(output).split('\n')) {
    if (!assetPattern.test(line)) continue
    const match = line.match(/\bgzip:\s*([\d]+(?:[.,][\d]+)?)\s*kB\b/i)
    if (match) return Number(match[1].replace(',', '.'))
  }
  return null
}

function parseVitestSummary(output) {
  const clean = stripAnsi(output)
  const line = clean.split('\n').map((entry) => entry.trim()).filter((entry) => /^Tests\b/.test(entry)).at(-1)
  if (!line) return { error: 'Vitest summary line not found' }

  const totalMatch = line.match(/\((\d+)\)\s*$/)
  const total = totalMatch ? Number(totalMatch[1]) : null
  const count = (label) => {
    const match = line.match(new RegExp(`(\\d+)\\s+${label}\\b`, 'i'))
    return match ? Number(match[1]) : 0
  }
  const passed = count('passed')
  const failed = count('failed')
  const skipped = count('skipped')
  const todo = count('todo')
  const counted = passed + failed + skipped + todo
  if (total == null || counted > total || counted === 0) {
    return { error: `Unparseable Vitest summary: ${line}` }
  }
  return { line, total, passed, failed, skipped, todo }
}

// ------------------------------------------------------------- 构建 + 体积
function build() {
  log('> npm run build ...')
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, encoding: 'utf8', shell: true })
  if (r.status !== 0) throw new Error('BUILD FAILED:\n' + (r.stderr || r.stdout).slice(0, 2000))
  const out = r.stdout + r.stderr
  const sizes = {
    indexJsGzipKB: parseViteGzip(out, /(?:^|[/\\])index-[A-Za-z0-9_-]+\.js\b/),
    indexCssGzipKB: parseViteGzip(out, /(?:^|[/\\])index-[A-Za-z0-9_-]+\.css\b/),
    potentialGzipKB: parseViteGzip(out, /\bPotentialFieldLab-[A-Za-z0-9_-]+\.js\b/),
  }
  for (const [k, v] of Object.entries(sizes)) if (v == null) log('WARN 解析不到 ' + k + '，按失败处理')
  return sizes
}

// ------------------------------------------------------------ CDP 迷你客户端
function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const mid = ++id
          pending.set(mid, { res, rej })
          ws.send(JSON.stringify({ id: mid, method, params }))
        })
      },
      close() { ws.close() },
    })
    ws.onerror = (e) => reject(e)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id)
        msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result)
      }
    }
  })
}

let CHROME = process.env.CHROME_PATH || ''
if (!CHROME) {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser',
  ]
  CHROME = candidates.find((c) => existsSync(c)) || ''
}
if (!CHROME) { log('找不到 Chrome，设 CHROME_PATH 环境变量'); process.exit(1) }

async function launchChrome() {
  const port = 9300 + Math.floor(Math.random() * 500)
  const profile = join(ROOT, 'scripts', '.chrome-tmp', String(port))
  mkdirSync(profile, { recursive: true })
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-extensions',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' })
  // 等调试端口就绪
  for (let i = 0; i < 50; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
      if (v.webSocketDebuggerUrl) return { port, proc, versionWs: v.webSocketDebuggerUrl }
    } catch { await sleep(200) }
  }
  throw new Error('Chrome 调试端口未就绪')
}

async function newPage(port) {
  // 建一个空白页，拿它自己的 ws
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
  const info = await res.json()
  return info
}

// ------------------------------------------------------------- 页面测量
async function measureFps(client, base, url, action) {
  await client.send('Page.navigate', { url: base + url })
  await new Promise((r) => setTimeout(r, 2800))
  if (action === 'threeBody:start') {
    const r = await client.send('Runtime.evaluate', { expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('开始模拟'));if(b){b.click();return true}return false})()`, returnByValue: true })
    if (!r.result?.value) log('  ! 未找到三体「开始模拟」按钮')
    await sleep(900)
  }
  if (action === 'collision:run') {
    await client.send('Runtime.evaluate', { expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('开始')||x.textContent.trim()==='开始');if(b){b.click();return true}return false})()` })
    await sleep(900)
  }
  if (action === 'pursuit:run') {
    await client.send('Runtime.evaluate', { expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('开始'));if(b){b.click();return true}return false})()` })
    await sleep(900)
  }
  if (action === 'projectile:run') {
    await client.send('Runtime.evaluate', { expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('发射')||x.textContent.includes('运行'));if(b){b.click();return true}return false})()` })
    await sleep(900)
  }
  if (action === 'em:sandbox+run') {
    await client.send('Runtime.evaluate', { expression: `(()=>{const b=document.querySelectorAll('.em-guide__level-badge');if(b.length)b[b.length-1].click();return true})()` })
    await sleep(900)
    await client.send('Runtime.evaluate', { expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('发射'));if(b){b.click();return true}return false})()` })
    await sleep(900)
  }
  const expr = `new Promise((resolve)=>{const W=3000,start=performance.now();let frames=0,worst=0,last=start;const cb=(t)=>{frames++;const g=t-last;if(g>worst)worst=g;last=t;if(t-start<W)requestAnimationFrame(cb);else resolve({fps:frames/W*1000,worstGapMs:worst})};requestAnimationFrame(cb)})`
  const r = await client.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  return r.result.value
}

async function layoutCheck(client, base, width, height = 844) {
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 3, mobile: true })
  await client.send('Page.navigate', { url: base + '/experiments?experiment=electromagnetic' })
  await new Promise((r) => setTimeout(r, 2200))
  const em = await client.send('Runtime.evaluate', {
    expression: `(()=>{const strip=document.querySelector('.em-guide__level-strip');if(!strip)return 100;const clip=strip.getBoundingClientRect();const q=[...strip.querySelectorAll(':scope > button')];const arr=[...document.querySelectorAll('.em-guide__level-arrow')];let worst=0;for(const a of arr){const ra=a.getBoundingClientRect();for(const b of q){const raw=b.getBoundingClientRect();const rb={left:Math.max(raw.left,clip.left),right:Math.min(raw.right,clip.right),top:Math.max(raw.top,clip.top),bottom:Math.min(raw.bottom,clip.bottom)};const bw=Math.max(0,rb.right-rb.left),bh=Math.max(0,rb.bottom-rb.top);if(!bw||!bh)continue;const ix=Math.min(ra.right,rb.right)-Math.max(ra.left,rb.left);const iy=Math.min(ra.bottom,rb.bottom)-Math.max(ra.top,rb.top);if(ix>1&&iy>1){const ar=ix*iy,min=Math.min(ra.width*ra.height,bw*bh);if(min>0)worst=Math.max(worst,ar/min)}}}return worst*100})()`, returnByValue: true,
  })
  const emOverlap = em.result.value ?? 0
  // 首页当前可见卡片文字与页面级横向溢出
  await client.send('Page.navigate', { url: base + '/' })
  await new Promise((r) => setTimeout(r, 2000))
  const card = await client.send('Runtime.evaluate', {
    expression: `(()=>{let bad=false;[...document.querySelectorAll('.post-carousel__item--current a.post-card')].forEach(el=>{const r=el.getBoundingClientRect();if(r.width<2)return;for(const node of el.querySelectorAll('h3,p,.post-card__meta,.post-card__link')){const t=node.getBoundingClientRect();if(t.left<r.left-1||t.right>r.right+1)bad=true}});return bad})()`, returnByValue: true,
  })
  const page = await client.send('Runtime.evaluate', {
    expression: `document.documentElement.scrollWidth > window.innerWidth + 1`, returnByValue: true,
  })
  return { width, emOverlap: Math.round(emOverlap), postCardOverflow: card.result.value, pageOverflow: page.result.value }
}

// ------------------------------------------------------------------ 主流程
async function main() {
  log(`模式：${MODE === 'baseline' ? '采集基线' : '对照基线+硬指标'}`)
  const sizes = build()
  log('产物 gzip 体积(kB)：' + JSON.stringify(sizes))
  const missingSizes = Object.entries(sizes).filter(([, value]) => value == null).map(([key]) => key)
  if (missingSizes.length > 0) {
    log('构建产物体积解析失败：' + missingSizes.join(', '))
    process.exitCode = 1
    return
  }

  // 起 preview
  const previewPort = 9290 + Math.floor(Math.random() * 100)
  const viteCli = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  const preview = spawn(process.execPath, [viteCli, 'preview', '--port', String(previewPort), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
  const base = `http://localhost:${previewPort}`
  let previewReady = false
  for (let i = 0; i < 60; i++) {
    try { await fetch(base); previewReady = true; break } catch { await sleep(300) }
  }
  if (!previewReady) { cleanup(null, preview); throw new Error('Vite preview 未就绪') }

  const { port, proc, versionWs } = await launchChrome()
  const tab = await newPage(port)
  const client = await cdp(tab.webSocketDebuggerUrl)
  await client.send('Page.enable')
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })

  const fps = {}
  for (const lab of LABS) {
    try {
      const m = await measureFps(client, base, lab.url, lab.action)
      fps[lab.key] = m
      log(`  FPS ${lab.key.padEnd(16)} ${m.fps.toFixed(1)}  (worst gap ${m.worstGapMs.toFixed(0)}ms)`)
    } catch (e) {
      log(`  FPS ${lab.key.padEnd(16)} ERROR ${e.message.slice(0, 60)}`)
      fps[lab.key] = { fps: 0, worstGapMs: 9999 }
    }
  }

  const layouts = []
  for (const width of [320, 360, 390]) {
    try { layouts.push(await layoutCheck(client, base, width)) }
    catch (e) { layouts.push({ width, emOverlap: 999, postCardOverflow: true, pageOverflow: true }) }
  }
  layouts.forEach((l) => log(`  布局@${l.width} EM重叠 ${l.emOverlap}%  卡片溢出 ${l.postCardOverflow}  页面横溢 ${l.pageOverflow}`))

  const testRun = spawnSync('npm', ['test'], { cwd: ROOT, encoding: 'utf8', shell: true, timeout: 240000 })
  const testGreen = testRun.status === 0
  const testSummary = parseVitestSummary((testRun.stdout || '') + (testRun.stderr || ''))
  const skipped = testSummary.skipped ?? null
  const testCount = testSummary.total ?? null
  log(`  测试：${testGreen ? 'PASS' : 'FAIL'}  ${testCount ?? '?'} tests (passed=${testSummary.passed ?? '?'}, failed=${testSummary.failed ?? '?'}, skipped=${skipped ?? '?'}, todo=${testSummary.todo ?? '?'})`)

  const report = { date: new Date().toISOString().slice(0, 10), sizes, fps, layouts, testGreen, skipped, testCount, testPassed: testSummary.passed ?? null, testFailed: testSummary.failed ?? null, testTodo: testSummary.todo ?? null, testParseError: testSummary.error ?? null }

  if (MODE === 'baseline') {
    writeFileSync(BASELINE_FILE, JSON.stringify(report, null, 2))
    log('\n基线已写入 ' + BASELINE_FILE)
    client.close()
    cleanup(proc, preview)
    process.exitCode = 0
    return
  }

  // 对照 + 硬指标
  if (!existsSync(BASELINE_FILE)) {
    log('\n没有基线文件。先跑：node scripts/verify-perf.mjs --baseline')
    client.close()
    cleanup(proc, preview)
    process.exitCode = 1
    return
  }
  const baseReport = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  const failures = []
  if (sizes.indexJsGzipKB > HARD.indexJsGzipKB) failures.push(`主包 gzip ${sizes.indexJsGzipKB}KB > ${HARD.indexJsGzipKB}KB`)
  if (sizes.indexCssGzipKB > HARD.indexCssGzipKB) failures.push(`全局 CSS gzip ${sizes.indexCssGzipKB}KB > ${HARD.indexCssGzipKB}KB`)
  if (sizes.potentialGzipKB > HARD.potentialGzipKB) failures.push(`电势 chunk gzip ${sizes.potentialGzipKB}KB > ${HARD.potentialGzipKB}KB`)
  for (const lab of LABS) {
    const now = fps[lab.key]?.fps ?? 0
    const prev = baseReport.fps?.[lab.key]?.fps ?? 0
    if (now < HARD.minFps && prev < HARD.minFps) failures.push(`${lab.key} FPS ${now.toFixed(1)} 仍 < ${HARD.minFps}（基线 ${prev.toFixed(1)}）`)
    // 已达标实验只拦「明显退化」：容忍 ±15% 测量噪声
    else if (now < prev * 0.85) failures.push(`${lab.key} FPS 明显退化 ${prev.toFixed(1)}→${now.toFixed(1)}`)
    if ((fps[lab.key]?.worstGapMs ?? Infinity) > HARD.maxWorstGapMs) failures.push(`${lab.key} worst gap ${(fps[lab.key]?.worstGapMs ?? Infinity).toFixed(0)}ms > ${HARD.maxWorstGapMs}ms`)
  }
  for (const l of layouts) {
    if (l.emOverlap > 0) failures.push(`EM 重叠@${l.width} 仍有 ${l.emOverlap}%`)
    if (l.postCardOverflow) failures.push(`首页卡片溢出@${l.width}`)
    if (l.pageOverflow) failures.push(`页面横向溢出@${l.width}`)
  }
  if (!testGreen) failures.push('npm test 失败')
  if (testSummary.error) failures.push(`测试摘要解析失败：${testSummary.error}`)
  if (testCount == null || testCount < HARD.minTests) failures.push(`测试数量 ${testCount ?? '?'} < ${HARD.minTests}`)
  if (skipped == null || skipped > 0) failures.push(`测试被跳过 ${skipped ?? '?'} 个`)

  log('\n========== 验收结果 ==========')
  if (failures.length === 0) log('全部通过 ✓')
  else failures.forEach((f) => log('✗ ' + f))
  client.close()
  cleanup(proc, preview)
  process.exitCode = failures.length === 0 ? 0 : 1
}

function terminateProcessTree(proc) {
  if (!proc?.pid) return
  if (process.platform === 'win32') {
    // Vite can create a child node process on Windows; terminate only this run's tree.
    spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' })
    return
  }
  try { proc.kill() } catch {}
}

function cleanup(chromeProc, previewProc) {
  terminateProcessTree(chromeProc)
  terminateProcessTree(previewProc)
}

main().catch((e) => { log('FATAL ' + e.stack); process.exitCode = 1 })
