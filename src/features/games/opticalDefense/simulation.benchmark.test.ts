import { writeFileSync, mkdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { OPTICAL_DEFENSE_LEVELS } from './levels'
import {
  augmentRecommended, buildRecommended, buildWrong, simulate,
} from './benchmark-strategies'
import type { BenchmarkMetrics } from './benchmark-strategies'

describe('optical defense deterministic campaign benchmark', () => {
  it('runs legal recommended and counter-example policies for all nineteen levels', () => {
    const results = OPTICAL_DEFENSE_LEVELS.map((level) => {
      const recommendedBuild = augmentRecommended(buildRecommended(level), level)
      const wrongBuild = buildWrong(level)
      expect(recommendedBuild.usedPowerW).toBeLessThanOrEqual(level.capacityW)
      expect(recommendedBuild.coins).toBeGreaterThanOrEqual(0)
      expect(recommendedBuild.placements.every((placement) => level.availableDevices.includes(placement.kind))).toBe(true)
      return {
        recommended: simulate(level, 'recommended', recommendedBuild),
        wrong: simulate(level, 'wrong', wrongBuild),
      }
    })

    results.forEach(({ recommended, wrong }) => {
      expect(recommended.kills, `L${recommended.levelId} recommended kills`).toBeGreaterThanOrEqual(wrong.kills)
      expect(recommended.coreHealth, `L${recommended.levelId} recommended core`).toBeGreaterThanOrEqual(wrong.coreHealth)
      expect(recommended.peakPowerW).toBeLessThanOrEqual(recommended.endingCapacityW)
      expect(recommended.spentCoins).toBeGreaterThanOrEqual(0)
    })
    const statusSampleCount = results.reduce((sum, item) => sum + item.recommended.statusSurvivalSamples, 0)
    const weightedStatusSurvival = results.reduce((sum, item) => sum
      + item.recommended.averageStatusSurvivalSeconds * item.recommended.statusSurvivalSamples, 0) / Math.max(1, statusSampleCount)
    expect(weightedStatusSurvival).toBeGreaterThanOrEqual(3)

    // 难度验收代理目标：所有推荐阵容胜利且核心不低于各段阈值。
    results.forEach(({ recommended, wrong }) => {
      const level = OPTICAL_DEFENSE_LEVELS[recommended.levelId - 1]
      const thresholdRatio = recommended.levelId <= 3 ? 0.8 : recommended.levelId <= 10 ? 0.6 : 0.25
      const threshold = Math.ceil(level.coreHealth * thresholdRatio)
      expect(recommended.phase, `L${recommended.levelId} recommended victory`).toBe('victory')
      expect(recommended.coreHealth, `L${recommended.levelId} recommended core >= ${threshold}`).toBeGreaterThanOrEqual(threshold)
      if (recommended.levelId <= 10 && recommended.levelId >= 4) {
        // 忽略关卡机制的单色阵容应明显泄漏。
        expect(wrong.leaks, `L${recommended.levelId} wrong monochrome leaks`).toBeGreaterThanOrEqual(Math.ceil(level.coreHealth / 2))
      }
      if (recommended.levelId >= 11) {
        // 无状态组合或无抗性应对的阵容应失败。
        expect(wrong.phase, `L${recommended.levelId} wrong no-status build fails`).toBe('defeat')
      }
    })
    expect(results[8].recommended.capacitorDetonations).toBeGreaterThanOrEqual(1)

    const benchmarkReport = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.OPTICAL_BENCHMARK_REPORT
    if (benchmarkReport) {
      mkdirSync('test-results', { recursive: true })
      writeFileSync('test-results/optical-benchmark.json', JSON.stringify({
        generatedAt: new Date().toISOString(),
        levels: OPTICAL_DEFENSE_LEVELS.map((level) => {
          const build = augmentRecommended(buildRecommended(level), level)
          return {
            id: level.id,
            capacityW: level.capacityW,
            startingCoins: level.startingCoins,
            coreHealth: level.coreHealth,
            build: build.placements.map((placement) => `${placement.kind}@${placement.holeId}:L${placement.upgradeLevel ?? 1}`).join(' | '),
            buildCoins: build.coins,
            buildPower: build.usedPowerW,
          }
        }),
        results: results.flatMap(({ recommended, wrong }) => [recommended, wrong]).map((metrics) => ({
          level: metrics.levelId,
          policy: metrics.policy,
          phase: metrics.phase,
          core: metrics.coreHealth,
          kills: metrics.kills,
          leaks: metrics.leaks,
          firstKill: metrics.firstKillSeconds,
          status: metrics.statusTriggers,
          statusSamples: metrics.statusSurvivalSamples,
          statusLife: metrics.averageStatusSurvivalSeconds,
          damageW: metrics.damagePerWatt,
          damageCoin: metrics.damagePerCoin,
          power: metrics.peakPowerW,
          capacity: metrics.endingCapacityW,
          coins: metrics.spentCoins,
          elapsed: metrics.elapsedSeconds,
          capacitor: metrics.capacitorDetonations,
        })),
      }, null, 2))
    }
  }, 120_000)
})
