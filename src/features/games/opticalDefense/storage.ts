import { ALL_DEVICE_KINDS } from './types'
import type { DeviceKind, SaveData } from './types'
import { OPTICAL_DEFENSE_LEVELS } from './levels'

export const OPTICAL_SAVE_KEY = 'tjyz-optical-defense-save-v3'
export const V2_OPTICAL_SAVE_KEY = 'tjyz-optical-defense-save-v2'
export const LEGACY_OPTICAL_SAVE_KEY = 'tjyz-optical-defense-save-v1'

export const DEFAULT_SAVE: SaveData = {
  version: 3,
  unlockedLevel: OPTICAL_DEFENSE_LEVELS.length,
  stars: {},
  unlockedDevices: ['source-red', 'mirror', 'bulb'],
  settings: { sound: true, reduceMotion: false, beamGlow: true, gameSpeed: 1 },
  tutorial: { dismissed: false, completedLevels: [] },
}

export type OpticalSaveReadResult = {
  save: SaveData
  recovered: boolean
}

const cloneDefault = (): SaveData => ({
  ...DEFAULT_SAVE,
  stars: {},
  unlockedDevices: [...DEFAULT_SAVE.unlockedDevices],
  settings: { ...DEFAULT_SAVE.settings },
  tutorial: { ...DEFAULT_SAVE.tutorial, completedLevels: [] },
})

const clampInteger = (value: unknown, minimum: number, maximum: number, fallback: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(minimum, Math.min(maximum, Math.round(value)))
}

export function readOpticalSaveResult(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
): OpticalSaveReadResult {
  if (!storage) return { save: cloneDefault(), recovered: false }
  const currentRaw = storage.getItem(OPTICAL_SAVE_KEY)
  const v2Raw = currentRaw ? null : storage.getItem(V2_OPTICAL_SAVE_KEY)
  const legacyRaw = currentRaw || v2Raw ? null : storage.getItem(LEGACY_OPTICAL_SAVE_KEY)
  const raw = currentRaw ?? v2Raw ?? legacyRaw
  if (!raw) return { save: cloneDefault(), recovered: false }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const settings = typeof parsed.settings === 'object' && parsed.settings !== null
      ? parsed.settings as Record<string, unknown>
      : {}
    const storedUnlockedLevel = clampInteger(parsed.unlockedLevel, 1, OPTICAL_DEFENSE_LEVELS.length, 1)
    const unlockedLevel = OPTICAL_DEFENSE_LEVELS.length
    const stars: Record<number, number> = {}
    if (typeof parsed.stars === 'object' && parsed.stars !== null && !Array.isArray(parsed.stars)) {
      Object.entries(parsed.stars).forEach(([rawLevel, rawStars]) => {
        const level = Number(rawLevel)
        if (Number.isInteger(level) && level >= 1 && level <= OPTICAL_DEFENSE_LEVELS.length && typeof rawStars === 'number' && Number.isFinite(rawStars)) {
          stars[level] = clampInteger(rawStars, 0, 3, 0)
        }
      })
    }
    const unlockedDevices = Array.isArray(parsed.unlockedDevices)
      ? [...new Set(parsed.unlockedDevices.filter((kind): kind is DeviceKind => typeof kind === 'string' && ALL_DEVICE_KINDS.includes(kind as DeviceKind)))]
      : [...DEFAULT_SAVE.unlockedDevices]
    DEFAULT_SAVE.unlockedDevices.forEach((kind) => {
      if (!unlockedDevices.includes(kind)) unlockedDevices.push(kind)
    })
    if (legacyRaw !== null || !Array.isArray(parsed.unlockedDevices)) {
      OPTICAL_DEFENSE_LEVELS.slice(0, storedUnlockedLevel).forEach((level) => level.availableDevices.forEach((kind) => {
        if (!unlockedDevices.includes(kind)) unlockedDevices.push(kind)
      }))
    }
    const gameSpeed = ([1, 2, 3] as const).includes(settings.gameSpeed as 1 | 2 | 3)
      ? settings.gameSpeed as 1 | 2 | 3
      : 1
    const tutorialData = typeof parsed.tutorial === 'object' && parsed.tutorial !== null
      ? parsed.tutorial as Record<string, unknown>
      : {}
    const completedLevels = Array.isArray(tutorialData.completedLevels)
      ? [...new Set(tutorialData.completedLevels.filter((level): level is number => typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= OPTICAL_DEFENSE_LEVELS.length))]
      : []
    const save: SaveData = {
      version: 3,
      unlockedLevel,
      stars,
      unlockedDevices,
      settings: {
        sound: typeof settings.sound === 'boolean' ? settings.sound : DEFAULT_SAVE.settings.sound,
        reduceMotion: typeof settings.reduceMotion === 'boolean' ? settings.reduceMotion : DEFAULT_SAVE.settings.reduceMotion,
        beamGlow: typeof settings.beamGlow === 'boolean' ? settings.beamGlow : DEFAULT_SAVE.settings.beamGlow,
        gameSpeed,
      },
      tutorial: {
        dismissed: typeof tutorialData.dismissed === 'boolean' ? tutorialData.dismissed : false,
        completedLevels,
      },
    }
    const storedStars = typeof parsed.stars === 'object' && parsed.stars !== null && !Array.isArray(parsed.stars)
      ? Object.entries(parsed.stars)
      : []
    const starsWereNormalized = storedStars.length !== Object.keys(stars).length || storedStars.some(([rawLevel, rawStars]) => {
      const level = Number(rawLevel)
      return !Number.isInteger(level) || level < 1 || level > OPTICAL_DEFENSE_LEVELS.length || typeof rawStars !== 'number'
        || !Number.isFinite(rawStars) || clampInteger(rawStars, 0, 3, 0) !== rawStars
    })
    const recovered = legacyRaw !== null || v2Raw !== null || parsed.version !== 3
      || unlockedLevel !== parsed.unlockedLevel
      || gameSpeed !== settings.gameSpeed
      || unlockedDevices.length !== (Array.isArray(parsed.unlockedDevices) ? parsed.unlockedDevices.length : unlockedDevices.length)
      || starsWereNormalized
      || typeof settings.sound !== 'boolean'
      || typeof settings.reduceMotion !== 'boolean'
      || typeof settings.beamGlow !== 'boolean'
      || typeof tutorialData.dismissed !== 'boolean'
      || !Array.isArray(tutorialData.completedLevels)
    return { save, recovered }
  } catch {
    return { save: cloneDefault(), recovered: true }
  }
}

export function readOpticalSave(storage?: Pick<Storage, 'getItem'>) {
  return readOpticalSaveResult(storage).save
}

export function writeOpticalSave(
  save: SaveData,
  storage: Pick<Storage, 'setItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
) {
  try {
    storage?.setItem(OPTICAL_SAVE_KEY, JSON.stringify(save))
    return Boolean(storage)
  } catch {
    return false
  }
}
