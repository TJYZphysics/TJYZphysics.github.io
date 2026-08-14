import { describe, expect, it } from 'vitest'

import {
  LEGACY_OPTICAL_SAVE_KEY, OPTICAL_SAVE_KEY, readOpticalSave, readOpticalSaveResult, V2_OPTICAL_SAVE_KEY, writeOpticalSave,
} from './storage'

describe('optical defense save data', () => {
  it('opens all levels by default and persists stars and settings', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    const save = readOpticalSave(storage)
    expect(save.unlockedLevel).toBe(20)
    expect(save.unlockedDevices).toEqual(['source-red', 'mirror', 'bulb'])
    expect(writeOpticalSave({ ...save, unlockedLevel: 4, settings: { ...save.settings, sound: false, gameSpeed: 3 } }, storage)).toBe(true)
    expect(values.has(OPTICAL_SAVE_KEY)).toBe(true)
    expect(readOpticalSave(storage)).toMatchObject({
      version: 3,
      unlockedLevel: 20,
      settings: { sound: false, gameSpeed: 3 },
      tutorial: { dismissed: false, completedLevels: [] },
    })
  })

  it('migrates legacy progress and restores devices introduced by unlocked levels', () => {
    const result = readOpticalSaveResult({
      getItem: (key: string) => key === LEGACY_OPTICAL_SAVE_KEY ? JSON.stringify({ unlockedLevel: 4, stars: { 1: 2 } }) : null,
    })
    expect(result.recovered).toBe(true)
    expect(result.save.unlockedLevel).toBe(20)
    expect(result.save.unlockedDevices).toContain('splitter')
    expect(result.save.stars[1]).toBe(2)
  })

  it('migrates v2 stars and settings without losing progress and initializes tutorial state', () => {
    const result = readOpticalSaveResult({
      getItem: (key: string) => key === V2_OPTICAL_SAVE_KEY ? JSON.stringify({
        version: 2,
        unlockedLevel: 7,
        stars: { 1: 3, 6: 2 },
        unlockedDevices: ['source-red', 'mirror', 'bulb', 'splitter', 'prism-splitter'],
        settings: { sound: false, reduceMotion: true, beamGlow: false, gameSpeed: 3 },
      }) : null,
    })
    expect(result.recovered).toBe(true)
    expect(result.save).toMatchObject({
      version: 3,
      unlockedLevel: 20,
      stars: { 1: 3, 6: 2 },
      settings: { sound: false, reduceMotion: true, beamGlow: false, gameSpeed: 3 },
      tutorial: { dismissed: false, completedLevels: [] },
    })
    expect(result.save.unlockedDevices).toContain('prism-splitter')
  })

  it('preserves valid v3 tutorial completion and dismissal state', () => {
    const result = readOpticalSaveResult({ getItem: (key: string) => key === OPTICAL_SAVE_KEY ? JSON.stringify({
      version: 3,
      unlockedLevel: 20,
      stars: { 1: 2 },
      unlockedDevices: ['source-red', 'mirror', 'bulb'],
      settings: { sound: true, reduceMotion: false, beamGlow: true, gameSpeed: 2 },
      tutorial: { dismissed: true, completedLevels: [1, 3, 6, 6, 99] },
    }) : null })
    expect(result.recovered).toBe(false)
    expect(result.save.tutorial).toEqual({ dismissed: true, completedLevels: [1, 3, 6] })
  })

  it('clamps malformed fields and filters unknown device identifiers', () => {
    const result = readOpticalSaveResult({ getItem: () => JSON.stringify({
      version: 2,
      unlockedLevel: 99,
      stars: { 0: 2, 1: 99, 2: -4, 3: 'bad' },
      unlockedDevices: ['source-red', 'unknown-device', 'mirror', 'mirror'],
      settings: { sound: 'yes', reduceMotion: true, beamGlow: 1, gameSpeed: 99 },
    }) })
    expect(result.save.unlockedLevel).toBe(20)
    expect(result.save.stars).toEqual({ 1: 3, 2: 0 })
    expect(result.save.unlockedDevices).toEqual(['source-red', 'mirror', 'bulb'])
    expect(result.save.settings).toEqual({ sound: true, reduceMotion: true, beamGlow: true, gameSpeed: 1 })
    expect(result.save.tutorial).toEqual({ dismissed: false, completedLevels: [] })
  })

  it('recovers invalid JSON and reports failed writes', () => {
    expect(readOpticalSaveResult({ getItem: () => '{broken' })).toMatchObject({ recovered: true, save: { unlockedLevel: 20 } })
    expect(writeOpticalSave(readOpticalSave({ getItem: () => null }), { setItem: () => { throw new Error('quota') } })).toBe(false)
  })
})
