#!/usr/bin/env node
/**
 * 亮色主题验收工具。执行者不许修改本文件。
 *
 * 检查：
 *   1. `claude-light` 选择器在 src 中为 0（App.tsx 里的 localStorage 旧值映射
 *      'claude-light'→'light' 是需求明确保留的，单独豁免）。
 *   2. light-theme-demo.html 的 SHA256 必须等于 C67B53DB...（禁改禁删）。
 *   3. 起 vite preview + headless Chrome，在亮色模式下断言五个核心 token 的
 *      computed style 精确匹配钴蓝航天 palette。
 *
 * 零 npm 依赖：Node ≥21 内置 fetch 与 WebSocket。
 */
import { spawnSync, spawn } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEMO_HASH = 'c67b53db10021876298d7de297e95709c2691000755832677a00ded55328634e'

// 五个核心 token → 期望精确值（来自 light-theme-demo.html 的 A02「钴蓝航天」）
const CORE_TOKENS = {
  '--bg': '#f4f5f8',
  '--surface': '#fdfdff',
  '--ink': '#171a22',
  '--cyan': '#2453c7',
  '--line': '#cdd1db',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (s) => console.log(s)

const ANSI_ESCAPE_RE = /\u001B\][\s\S]*?(?:\u0007|\u001B\\)|\u001B\[[0-?]*[ -/]*[@-~]/g
const stripAnsi = (value) => String(value ?? '').replace(ANSI_ESCAPE_RE, '').replace(/\r/g, '')

// ------------------------------------------------------------ 断言 1：claude-light = 0
function checkClaudeLightSelectors() {
  const failures = []
  const r = spawnSync('grep', ['-rn', 'claude-light', join('src')], { cwd: ROOT, encoding: 'utf8', shell: true })
  const lines = stripAnsi(r.stdout).split('\n').filter((line) => line.includes('claude-light'))
  for (const line of lines) {
    // App.tsx 的 localStorage 映射是需求明确保留的旧值迁移，豁免
    if (line.includes('src/App.tsx')) continue
    failures.push('残留 claude-light 选择器：' + line)
  }
  return failures
}

// ------------------------------------------------------------ 断言 2：demo SHA256
function checkDemoHash() {
  const failures = []
  const file = join(ROOT, 'light-theme-demo.html')
  if (!existsSync(file)) {
    failures.push('light-theme-demo.html 缺失（禁删）')
    return failures
  }
  const hash = createHash('sha256').update(readFileSync(file)).digest('hex')
  if (hash !== DEMO_HASH) {
    failures.push(`light-theme-demo.html SHA256 不匹配：${hash}\n期望：${DEMO_HASH}`)
  }
  return failures
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
  const port = 9700 + Math.floor(Math.random() * 200)
  const profile = join(ROOT, 'scripts', '.light-chrome-tmp', String(port))
  mkdirSync(profile, { recursive: true })
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-extensions',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' })
  for (let i = 0; i < 50; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
      if (v.webSocketDebuggerUrl) return { port, proc }
    } catch { await sleep(200) }
  }
  throw new Error('Chrome 调试端口未就绪')
}

// ------------------------------------------------------------ 断言 3：五个核心 token
async function checkCoreTokens(base) {
  const { port, proc } = await launchChrome()
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
    const info = await res.json()
    const client = await cdp(info.webSocketDebuggerUrl)
    await client.send('Page.enable')
    await client.send('Page.navigate', { url: base + '/' })
    // 等 React 挂载完成（大 bundle 在无头 Chrome 里加载较慢）
    let mounted = false
    for (let i = 0; i < 40; i++) {
      await sleep(250)
      const probe = await client.send('Runtime.evaluate', {
        expression: `Boolean(document.querySelector('.site-header'))`,
        returnByValue: true,
      })
      if (probe.result?.value) { mounted = true; break }
    }
    if (!mounted) throw new Error('首页未在 10s 内挂载')
    await client.send('Runtime.evaluate', {
      expression: `document.documentElement.dataset.theme='light';document.documentElement.dataset.colorMode='light'`,
    })
    await sleep(400)
    const r = await client.send('Runtime.evaluate', {
      expression: `(()=>{const cs=getComputedStyle(document.documentElement);const out={};${Object.keys(CORE_TOKENS).map((k) => `out[${JSON.stringify(k)}]=cs.getPropertyValue(${JSON.stringify(k)}).trim()`).join(';')};out['__diag']=[document.documentElement.dataset.colorMode,document.documentElement.dataset.theme,document.styleSheets.length,cs.getPropertyValue('--cyan').trim(),getComputedStyle(document.body).backgroundColor];return out})()`,
      returnByValue: true,
    })
    client.close()
    if (r.exceptionDetails) {
      return [`Runtime.evaluate 抛异常: ${JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)}`]
    }
    const values = r.result.value || {}
    const diag = values.__diag
    if (Array.isArray(diag)) {
      log(`  (diag: colorMode=${diag[0]} theme=${diag[1]} stylesheets=${diag[2]} --cyan='${diag[3]}' bodyBg=${diag[4]})`)
    }
    delete values.__diag
    const failures = []
    for (const [token, expected] of Object.entries(CORE_TOKENS)) {
      const actual = (values[token] || '').toLowerCase()
      if (actual !== expected.toLowerCase()) {
        failures.push(`${token} 期望 ${expected} 实际 ${actual}`)
      } else {
        log(`  ✓ ${token} = ${actual}`)
      }
    }
    return failures
  } finally {
    try { spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' }) } catch {}
  }
}

async function main() {
  log('亮色主题验收：')
  log('\n[1] claude-light 选择器')
  const selectorFailures = checkClaudeLightSelectors()
  if (selectorFailures.length === 0) log('  ✓ 0 处（App.tsx localStorage 旧值映射豁免）')
  else selectorFailures.forEach((f) => log('  ✗ ' + f))

  log('\n[2] light-theme-demo.html SHA256')
  const hashFailures = checkDemoHash()
  if (hashFailures.length === 0) log(`  ✓ ${DEMO_HASH}`)
  else hashFailures.forEach((f) => log('  ✗ ' + f))

  log('\n[3] 五个核心 token computed style（亮色）')
  // 起 vite preview
  const previewPort = 9800 + Math.floor(Math.random() * 100)
  const viteCli = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  const preview = spawn(process.execPath, [viteCli, 'preview', '--port', String(previewPort), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
  const base = `http://localhost:${previewPort}`
  let ready = false
  for (let i = 0; i < 60; i++) {
    try { await fetch(base); ready = true; break } catch { await sleep(300) }
  }
  let tokenFailures = ['vite preview 未就绪']
  if (ready) tokenFailures = await checkCoreTokens(base)
  try { spawnSync('taskkill', ['/pid', String(preview.pid), '/t', '/f'], { stdio: 'ignore' }) } catch {}

  const all = [...selectorFailures, ...hashFailures, ...tokenFailures]
  log('\n========== 验收结果 ==========')
  if (all.length === 0) log('全部通过 ✓')
  else all.forEach((f) => log('✗ ' + f))
  process.exitCode = all.length === 0 ? 0 : 1
}

main().catch((e) => { log('FATAL ' + e.stack); process.exitCode = 1 })
