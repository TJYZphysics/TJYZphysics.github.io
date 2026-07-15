import { describe, expect, it } from 'vitest'
import { ELECTROMAGNETIC_LEVELS } from './levels'
import { createSimulation, stepSimulation } from './physics'

describe('electromagnetic sandbox simulation', () => {
  it('continues beyond the former 12 second preview while bounding path memory', () => {
    const sandbox = ELECTROMAGNETIC_LEVELS.at(-1)!
    const state = stepSimulation(createSimulation(sandbox), sandbox, 600, [])

    expect(state.elapsed).toBeGreaterThan(12)
    expect(state.status).toBe('free-play')
    expect(state.particles[0].status).toBe('active')
    expect(state.particles[0].path.length).toBeLessThanOrEqual(8192)
    expect(state.particles[0].path.at(-1)?.x).toBeGreaterThan(2000)
  })
})
