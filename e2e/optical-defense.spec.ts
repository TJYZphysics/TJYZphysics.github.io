import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const freshSave = {
  version: 2,
  unlockedLevel: 1,
  stars: {},
  unlockedDevices: ['source-red', 'mirror', 'bulb'],
  settings: { sound: false, reduceMotion: true, beamGlow: true, gameSpeed: 1 },
}

async function advance(page: Page, seconds: number) {
  await page.evaluate((value) => window.dispatchEvent(new CustomEvent('optical-defense:advance', { detail: value })), seconds)
}

async function clickAfterInstantScroll(locator: Locator) {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }))
  await locator.click()
}

async function activateHole(page: Page, index: number) {
  const hole = page.locator(`[data-board-hole="${index}"]`)
  await hole.focus()
  await hole.press('Enter')
}

test.describe('光路塔防 smoke flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((save) => {
      const disableSmoothScroll = () => document.documentElement?.style.setProperty('scroll-behavior', 'auto', 'important')
      disableSmoothScroll()
      document.addEventListener('DOMContentLoaded', disableSmoothScroll, { once: true })
      localStorage.removeItem('tjyz-optical-defense-save-v1')
      if (!localStorage.getItem('tjyz-optical-defense-save-v2')) {
        localStorage.setItem('tjyz-optical-defense-save-v2', JSON.stringify(save))
      }
      sessionStorage.removeItem('tjyz-optical-current-level')
    }, freshSave)
  })

  test('renders the lab, builds a reflected attack path, and advances a wave deterministically', async ({ page }) => {
    await page.goto('/games?game=optical-defense')
    const game = page.getByTestId('optical-defense')
    await game.scrollIntoViewIfNeeded()
    await expect(game).toBeVisible()
    await expect(page.getByRole('heading', { name: '光路塔防' })).toBeVisible()
    await expect(page.getByTestId('optical-canvas')).toHaveAttribute('data-scene-ready', 'true')
    const canvas = page.getByTestId('optical-canvas').locator('canvas')
    await expect(canvas).toBeVisible()

    await page.getByTestId('tool-source-red').click()
    await activateHole(page, 0)
    await expect(page.locator('[role="status"]')).toContainText('红光源 已接入光路')
    await page.getByTestId('tool-mirror').click()
    await activateHole(page, 2)
    await expect(page.locator('[role="status"]')).toContainText('平面镜 已接入光路')
    await page.getByTestId('tool-bulb').click()
    await activateHole(page, 16)
    await expect(page.locator('[role="status"]')).toContainText('灯泡 已接入光路')
    await activateHole(page, 2)
    await expect(page.getByTestId('selected-device')).toContainText('平面镜')
    await expect(page.getByTestId('selected-device')).toContainText(/实际输入\s*50W/)
    await page.getByTestId('snap-mirror').click()
    await activateHole(page, 16)
    await expect(page.locator('[role="status"]')).toContainText('输出 1 已吸附至灯泡')

    await clickAfterInstantScroll(page.getByTestId('wave-control'))
    await expect(page.getByTestId('wave-control')).toContainText('暂停')
    await advance(page, 2)
    await expect(page.getByTestId('power-meter')).toContainText('/100W')
    await advance(page, 12)
    await expect.poll(async () => Number((await page.getByTestId('power-meter').innerText()).split('/')[1].replace('W', ''))).toBeGreaterThan(100)
    if (process.env.OPTICAL_CAPTURE) await game.screenshot({ path: process.env.OPTICAL_CAPTURE })
  })

  test('opens all nineteen levels and permits late-game capacitor play', async ({ page }) => {
    await page.goto('/games?game=optical-defense')
    await page.getByTestId('optical-defense').scrollIntoViewIfNeeded()
    await clickAfterInstantScroll(page.getByTestId('open-levels'))
    for (let levelId = 1; levelId <= 19; levelId += 1) {
      await expect(page.getByTestId(`level-${levelId}`)).toBeEnabled()
    }
    await page.getByTestId('level-19').click()
    await expect(page.getByTestId('optical-canvas')).toHaveAttribute('data-scene-ready', 'true')
    const canvas = page.getByTestId('optical-canvas').locator('canvas')
    await expect(canvas).toBeVisible()
    if (process.env.OPTICAL_LATE_CAPTURE) await page.getByTestId('optical-defense').screenshot({ path: process.env.OPTICAL_LATE_CAPTURE })
    await page.getByTestId('tool-source-blue').click()
    await activateHole(page, 0)
    await expect(page.locator('[role="status"]')).toContainText('蓝光源 已接入光路')
    await page.getByTestId('tool-capacitor').click()
    await activateHole(page, 1)
    await expect(page.locator('[role="status"]')).toContainText('储能电容 已接入光路')
    await clickAfterInstantScroll(page.getByTestId('wave-control'))
    await expect(page.getByTestId('wave-control')).toContainText('暂停')
    await advance(page, 1)
    await clickAfterInstantScroll(page.getByTestId('wave-control'))
    await expect(page.getByTestId('detonate-capacitor')).toBeEnabled()
    await page.getByTestId('detonate-capacitor').click()
    await clickAfterInstantScroll(page.getByTestId('wave-control'))
    await expect(page.getByTestId('wave-control')).toContainText('暂停')
    await advance(page, 0.2)
    await expect(page.locator('[role="status"]')).toContainText('电容释放完成')
  })

  test('limits instruments by level and opens the complete set from level nine', async ({ page }) => {
    await page.goto('/games?game=optical-defense')
    await page.getByTestId('optical-defense').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('tool-source-red')).toBeVisible()
    await expect(page.getByTestId('tool-collector')).toHaveCount(0)
    await clickAfterInstantScroll(page.getByTestId('open-levels'))
    await page.getByTestId('level-9').click()
    await expect(page.getByTestId('tool-collector')).toBeVisible()
    await expect(page.getByTestId('tool-photo-sensor')).toBeVisible()
    await expect(page.getByTestId('tool-capacitor')).toBeVisible()
  })

  test('keeps placement and upgrades made while the wave is running', async ({ page }) => {
    await page.goto('/games?game=optical-defense')
    await page.getByTestId('optical-defense').scrollIntoViewIfNeeded()
    await page.getByTestId('tool-source-red').click()
    await activateHole(page, 0)
    await clickAfterInstantScroll(page.getByTestId('wave-control'))
    await expect(page.getByTestId('wave-control')).toContainText('暂停')
    await page.getByTestId('tool-mirror').click()
    await activateHole(page, 2)
    await expect(page.getByTestId('selected-device')).toContainText('平面镜')
    await page.getByTestId('selected-device').getByRole('button', { name: /升级/ }).click()
    await advance(page, 0.5)
    await expect(page.getByTestId('selected-device')).toContainText('LV.2')
    await expect(page.getByTestId('wave-control')).toContainText('暂停')
  })

  test('attaches a sensor to an existing instrument and shows its embedded controls', async ({ page }) => {
    await page.goto('/games?game=optical-defense')
    await page.getByTestId('optical-defense').scrollIntoViewIfNeeded()
    await clickAfterInstantScroll(page.getByTestId('open-levels'))
    await page.getByTestId('level-9').click()
    await page.getByTestId('tool-mirror').click()
    await activateHole(page, 0)
    await page.getByTestId('tool-photo-sensor').click()
    await activateHole(page, 0)
    await expect(page.getByTestId('selected-device')).toContainText('附着传感器')
    await expect(page.locator('[role="status"]')).toContainText('传感器已附着')
  })

  test('opens the field manual from the top bar', async ({ page }) => {
    await page.goto('/games?game=optical-defense')
    await page.getByTestId('optical-defense').scrollIntoViewIfNeeded()
    await clickAfterInstantScroll(page.getByTestId('open-help'))
    await expect(page.getByTestId('help-dialog')).toBeVisible()
    await expect(page.getByTestId('help-dialog')).toContainText('收集器')
    await expect(page.getByTestId('help-dialog')).toContainText('敌人与抗性')
    if (process.env.OPTICAL_HELP_CAPTURE) await page.getByTestId('optical-defense').screenshot({ path: process.env.OPTICAL_HELP_CAPTURE })
  })

  test('keeps global shortcuts out of form controls and persists settings', async ({ page }) => {
    await page.goto('/games?game=optical-defense')
    await page.getByTestId('optical-defense').scrollIntoViewIfNeeded()
    await clickAfterInstantScroll(page.getByTestId('open-settings'))
    const sound = page.getByTestId('setting-sound')
    await sound.check()
    await sound.press('Space')
    await sound.press('Space')
    await expect(sound).toBeChecked()
    await page.getByRole('button', { name: '关闭设置' }).click()
    await expect(page.getByTestId('wave-control')).toContainText('启动波次')
    await page.reload()
    await page.getByTestId('optical-defense').scrollIntoViewIfNeeded()
    await clickAfterInstantScroll(page.getByTestId('open-settings'))
    await expect(page.getByTestId('setting-sound')).toBeChecked()
    await page.getByRole('button', { name: '关闭设置' }).click()
    const firstHole = page.locator('[data-board-hole="0"]')
    await firstHole.focus()
    await firstHole.press('Enter')
    await expect(page.getByTestId('power-meter')).toContainText('50/100W')
  })
})
