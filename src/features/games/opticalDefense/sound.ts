import { useCallback, useEffect, useRef } from 'react'

export type OpticalSoundCue =
  | 'select' | 'deploy' | 'glass' | 'reflect' | 'laser' | 'freeze' | 'ignite' | 'radiate'
  | 'focus' | 'release' | 'hit' | 'shield' | 'escape' | 'victory' | 'defeat' | 'upgrade'
  | 'pause' | 'start' | 'error'

const CUE_GAP: Partial<Record<OpticalSoundCue, number>> = {
  laser: 0.36, hit: 0.15, shield: 0.25, freeze: 0.65, ignite: 0.55, radiate: 0.65, focus: 0.6,
}

/** Quiet modal glass + filtered air + rounded sub transients, with no square waves. */
export class OpticalSoundEngine {
  enabled = true
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private cueTimes = new Map<OpticalSoundCue, number>()
  private lastVoice = -1
  private disposed = false

  unlock() {
    if (!this.enabled || this.disposed || typeof AudioContext === 'undefined') return
    try {
      if (!this.context) {
        const context = new AudioContext({ latencyHint: 'interactive' })
        const master = context.createGain()
        const filter = context.createBiquadFilter()
        const compressor = context.createDynamicsCompressor()
        filter.type = 'lowpass'
        filter.frequency.value = 3400
        filter.Q.value = 0.45
        master.gain.value = 0.38
        compressor.threshold.value = -18
        compressor.knee.value = 12
        compressor.ratio.value = 5
        compressor.attack.value = 0.004
        compressor.release.value = 0.1
        master.connect(filter).connect(compressor).connect(context.destination)
        this.context = context
        this.master = master
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
    } catch {
      // Audio availability never interrupts a game action.
    }
  }

  play(cue: OpticalSoundCue) {
    if (!this.enabled || this.disposed) return
    this.unlock()
    const context = this.context
    const output = this.master
    if (!context || !output || context.state !== 'running') return
    const now = context.currentTime
    if (now - (this.cueTimes.get(cue) ?? -10) < (CUE_GAP[cue] ?? 0.065) || now - this.lastVoice < 0.025) return
    this.cueTimes.set(cue, now)
    this.lastVoice = now
    renderOpticalCue(context, output, cue, now)
  }

  dispose() {
    this.disposed = true
    this.master?.disconnect()
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {})
    this.context = null
    this.master = null
  }
}

// Also accepts OfflineAudioContext so the actual sound palette can be auditioned.
export function renderOpticalCue(context: BaseAudioContext, output: AudioNode, cue: OpticalSoundCue, time: number) {
  const tone = (from: number, to: number, duration: number, level: number, delay = 0) => {
    const oscillator = context.createOscillator()
    const envelope = context.createGain()
    const start = time + delay
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(from, start)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(25, to), start + duration)
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.exponentialRampToValueAtTime(level, start + 0.005)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(envelope).connect(output)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.012)
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect() }
  }
  const air = (frequency: number, duration: number, level: number) => {
    const length = Math.ceil(context.sampleRate * duration)
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const data = buffer.getChannelData(0)
    // Fixed noise keeps capture and offline audition reproducible.
    let seed = 731
    for (let i = 0; i < length; i++) {
      seed = (seed * 16807) % 2147483647
      data[i] = seed / 1073741824 - 1
    }
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const envelope = context.createGain()
    source.buffer = buffer
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(frequency, time)
    filter.frequency.exponentialRampToValueAtTime(Math.max(90, frequency * 0.45), time + duration)
    filter.Q.value = 0.7
    envelope.gain.setValueAtTime(0.0001, time)
    envelope.gain.exponentialRampToValueAtTime(level, time + 0.004)
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration)
    source.connect(filter).connect(envelope).connect(output)
    source.start(time)
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect() }
  }
  const glass = (frequency: number, duration = 0.15) => {
    tone(frequency, frequency * 0.985, duration, 0.15)
    tone(frequency * 1.47, frequency * 1.44, duration * 0.7, 0.065)
    tone(frequency * 2.11, frequency * 2.08, duration * 0.45, 0.027)
    tone(frequency, frequency * 0.99, duration * 0.6, 0.023, 0.026)
  }
  switch (cue) {
    case 'select': tone(470, 420, 0.045, 0.12); air(1400, 0.025, 0.08); break
    case 'deploy': glass(540, 0.13); tone(105, 70, 0.08, 0.22); break
    case 'glass': glass(710, 0.18); air(1800, 0.045, 0.065); break
    case 'reflect': glass(860, 0.11); tone(620, 1040, 0.045, 0.065); break
    case 'laser': tone(1000, 260, 0.11, 0.17); air(2100, 0.08, 0.15); tone(90, 55, 0.075, 0.1); break
    case 'freeze': glass(980, 0.17); air(2500, 0.1, 0.09); break
    case 'ignite': air(520, 0.15, 0.32); tone(140, 65, 0.13, 0.23); break
    case 'radiate': tone(440, 230, 0.12, 0.12); tone(650, 470, 0.12, 0.08); air(1000, 0.1, 0.14); break
    case 'focus': tone(220, 1120, 0.19, 0.18); tone(80, 55, 0.17, 0.23); glass(780, 0.15); break
    case 'release': tone(98, 32, 0.27, 0.55); air(750, 0.24, 0.48); glass(420, 0.22); break
    case 'hit': tone(170, 75, 0.055, 0.22); glass(660, 0.055); break
    case 'shield': glass(1120, 0.09); air(1900, 0.075, 0.17); break
    case 'escape': tone(180, 90, 0.17, 0.27); air(380, 0.1, 0.18); break
    case 'upgrade': glass(560); tone(840, 850, 0.15, 0.11, 0.065); tone(1120, 1130, 0.15, 0.08, 0.11); break
    case 'victory': [420, 560, 840].forEach((f, i) => tone(f, f, 0.25, 0.14, i * 0.085)); break
    case 'defeat': tone(280, 130, 0.28, 0.2); tone(140, 65, 0.3, 0.22, 0.04); break
    case 'pause': glass(390, 0.085); break
    case 'start': tone(240, 480, 0.095, 0.18); glass(600, 0.12); break
    case 'error': tone(210, 175, 0.085, 0.14); break
  }
}

export function useOpticalSound(enabled: boolean) {
  const engineRef = useRef<OpticalSoundEngine | null>(null)
  useEffect(() => {
    const engine = new OpticalSoundEngine()
    engineRef.current = engine
    return () => { engine.dispose(); engineRef.current = null }
  }, [])
  useEffect(() => {
    if (engineRef.current) engineRef.current.enabled = enabled
  }, [enabled])
  const play = useCallback((cue: OpticalSoundCue) => engineRef.current?.play(cue), [])
  const unlock = useCallback(() => engineRef.current?.unlock(), [])
  return { play, unlock }
}
