export type WaveExperimentMode = 'double-source' | 'single-slit' | 'double-slit'

export interface WaveFieldConfig {
  mode: WaveExperimentMode
  amplitude: number
  wavelength: number
  pointSpacing: number
  slitWidth: number
  slitSpacing: number
  sourceDistance: number
  columns?: number
  rows?: number
  width?: number
  depth?: number
}

export interface WaveField {
  columns: number
  rows: number
  width: number
  depth: number
  x: Float32Array
  z: Float32Array
  real: Float32Array
  imaginary: Float32Array
  magnitude: Float32Array
  maxMagnitude: number
  unitAmplitudeMagnitude: number
  barrierZ: number | null
  apertures: Array<{ start: number; end: number }>
  sourcePositions: Array<{ x: number; z: number }>
}

export interface WaveReceiverProfile {
  distance: number
  screenZ: number
  x: Float32Array
  instantaneous: Float32Array
  rmsEnvelope: Float32Array
  averageAmplitude: number
  instantaneousAmplitude: number
}

const TAU = Math.PI * 2

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

export function waveNumber(wavelength: number) {
  if (!Number.isFinite(wavelength) || wavelength <= 0) throw new RangeError('Wavelength must be positive.')
  return TAU / wavelength
}

export function angularFrequency(frequency: number) {
  if (!Number.isFinite(frequency) || frequency <= 0) throw new RangeError('Frequency must be positive.')
  return TAU * frequency
}

export function waveSpeed(frequency: number, wavelength: number) {
  return frequency * wavelength
}

export function singleSlitRelativeIntensity(angle: number, slitWidth: number, wavelength: number) {
  const beta = Math.PI * slitWidth * Math.sin(angle) / wavelength
  if (Math.abs(beta) < 1e-9) return 1
  const ratio = Math.sin(beta) / beta
  return ratio * ratio
}

export function doubleSlitRelativeIntensity(
  angle: number,
  slitWidth: number,
  slitSpacing: number,
  wavelength: number,
) {
  const envelope = singleSlitRelativeIntensity(angle, slitWidth, wavelength)
  const alpha = Math.PI * slitSpacing * Math.sin(angle) / wavelength
  const interference = Math.cos(alpha) ** 2
  return envelope * interference
}

function addPhasor(real: Float32Array, imaginary: Float32Array, index: number, magnitude: number, phase: number) {
  real[index] += magnitude * Math.cos(phase)
  imaginary[index] += magnitude * Math.sin(phase)
}

function makeApertureSamples(apertures: Array<{ start: number; end: number }>, wavelength: number) {
  const samples: number[] = []
  const targetStep = Math.max(wavelength / 10, 0.035)
  for (const aperture of apertures) {
    const width = aperture.end - aperture.start
    const count = Math.max(12, Math.min(80, Math.ceil(width / targetStep)))
    const step = width / count
    for (let index = 0; index < count; index += 1) samples.push(aperture.start + (index + 0.5) * step)
  }
  return samples
}

export function createWaveField(config: WaveFieldConfig): WaveField {
  const columns = config.columns ?? 56
  const rows = config.rows ?? 56
  const width = config.width ?? 18
  const depth = config.depth ?? 18
  if (columns < 8 || rows < 8) throw new RangeError('Wave field resolution is too small.')

  const total = columns * rows
  const x = new Float32Array(total)
  const z = new Float32Array(total)
  const real = new Float32Array(total)
  const imaginary = new Float32Array(total)
  const magnitude = new Float32Array(total)
  const k = waveNumber(config.wavelength)
  const dx = width / (columns - 1)
  const dz = depth / (rows - 1)
  const regularizer = Math.max(config.wavelength / 8, Math.max(dx, dz))
  const barrierZ = config.mode === 'double-source' ? null : depth * 0.5
  const clampedSlitWidth = Math.max(0.35, config.slitWidth)
  const clampedSpacing = Math.max(config.slitSpacing, clampedSlitWidth + 0.2)
  const apertures = config.mode === 'single-slit'
    ? [{ start: -clampedSlitWidth / 2, end: clampedSlitWidth / 2 }]
    : config.mode === 'double-slit'
      ? [
          { start: -clampedSpacing / 2 - clampedSlitWidth / 2, end: -clampedSpacing / 2 + clampedSlitWidth / 2 },
          { start: clampedSpacing / 2 - clampedSlitWidth / 2, end: clampedSpacing / 2 + clampedSlitWidth / 2 },
        ]
      : []
  const apertureSamples = makeApertureSamples(apertures, config.wavelength)
  const apertureStep = apertureSamples.length > 0
    ? apertures.reduce((sum, aperture) => sum + aperture.end - aperture.start, 0) / apertureSamples.length
    : 0
  const sourceZ = barrierZ == null ? depth * 0.2 : barrierZ - Math.max(config.sourceDistance, 0.1)
  const sourcePositions = config.mode === 'double-source'
    ? [{ x: -config.pointSpacing / 2, z: sourceZ }, { x: config.pointSpacing / 2, z: sourceZ }]
    : [{ x: 0, z: sourceZ }]

  let maxMagnitude = 0
  for (let row = 0; row < rows; row += 1) {
    const worldZ = row * dz
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column
      const worldX = -width / 2 + column * dx
      x[index] = worldX
      z[index] = worldZ

      if (config.mode === 'double-source') {
        const sourceHalfGap = config.pointSpacing / 2
        for (const sourceX of [-sourceHalfGap, sourceHalfGap]) {
          const distance = Math.hypot(worldX - sourceX, worldZ - sourceZ)
          const spreading = Math.sqrt(regularizer / Math.max(distance, regularizer))
          addPhasor(real, imaginary, index, config.amplitude * spreading, k * distance)
        }
      } else if (barrierZ != null && worldZ < barrierZ - dz * 0.35) {
        const distance = Math.hypot(worldX, worldZ - sourceZ)
        const spreading = Math.sqrt(regularizer / Math.max(distance, regularizer))
        addPhasor(real, imaginary, index, config.amplitude * spreading, k * distance)
      } else if (barrierZ != null && worldZ > barrierZ + dz * 0.2) {
        const propagationDistance = worldZ - barrierZ
        for (const apertureX of apertureSamples) {
          const incidentDistance = Math.hypot(apertureX, barrierZ - sourceZ)
          const outgoingDistance = Math.hypot(worldX - apertureX, propagationDistance)
          const obliquity = propagationDistance / Math.max(outgoingDistance, regularizer)
          const spreading = 1 / Math.sqrt(Math.max(incidentDistance * outgoingDistance, regularizer * regularizer))
          const contribution = config.amplitude * apertureStep * obliquity * spreading
          addPhasor(real, imaginary, index, contribution, k * (incidentDistance + outgoingDistance))
        }
      }

      const value = Math.hypot(real[index], imaginary[index])
      magnitude[index] = value
      maxMagnitude = Math.max(maxMagnitude, value)
    }
  }

  return {
    columns,
    rows,
    width,
    depth,
    x,
    z,
    real,
    imaginary,
    magnitude,
    maxMagnitude: Math.max(maxMagnitude, 1e-6),
    unitAmplitudeMagnitude: Math.max(maxMagnitude / Math.max(config.amplitude, 1e-6), 1e-6),
    barrierZ,
    apertures,
    sourcePositions,
  }
}

export function sampleInstantaneousDisplacement(field: WaveField, index: number, time: number, frequency: number) {
  const phase = angularFrequency(frequency) * time
  return field.real[index] * Math.cos(phase) + field.imaginary[index] * Math.sin(phase)
}

export function receiverScreenZ(field: WaveField, distance: number) {
  const sourceZ = field.sourcePositions[0]?.z ?? 0
  return clamp(sourceZ + Math.max(distance, 0), 0, field.depth)
}

/** Samples a receiver screen perpendicular to the propagation direction. */
export function sampleReceiverProfile(
  field: WaveField,
  distance: number,
  time: number,
  frequency: number,
): WaveReceiverProfile {
  const screenZ = receiverScreenZ(field, distance)
  const rowPosition = (screenZ / field.depth) * (field.rows - 1)
  const lowerRow = Math.floor(rowPosition)
  const upperRow = Math.min(field.rows - 1, lowerRow + 1)
  const rowBlend = rowPosition - lowerRow
  const phase = angularFrequency(frequency) * time
  const cosine = Math.cos(phase)
  const sine = Math.sin(phase)
  const x = new Float32Array(field.columns)
  const instantaneous = new Float32Array(field.columns)
  const rmsEnvelope = new Float32Array(field.columns)
  let meanMagnitudeSquared = 0
  let meanInstantaneousSquared = 0

  for (let column = 0; column < field.columns; column += 1) {
    const lowerIndex = lowerRow * field.columns + column
    const upperIndex = upperRow * field.columns + column
    const real = field.real[lowerIndex] + (field.real[upperIndex] - field.real[lowerIndex]) * rowBlend
    const imaginary = field.imaginary[lowerIndex] + (field.imaginary[upperIndex] - field.imaginary[lowerIndex]) * rowBlend
    const magnitude = Math.hypot(real, imaginary)
    const instant = real * cosine + imaginary * sine
    x[column] = field.x[lowerIndex]
    instantaneous[column] = instant
    rmsEnvelope[column] = magnitude / Math.SQRT2
    meanMagnitudeSquared += magnitude * magnitude
    meanInstantaneousSquared += instant * instant
  }

  return {
    distance: Math.max(distance, 0),
    screenZ,
    x,
    instantaneous,
    rmsEnvelope,
    averageAmplitude: Math.sqrt(meanMagnitudeSquared / (2 * field.columns)),
    instantaneousAmplitude: Math.sqrt(meanInstantaneousSquared / field.columns),
  }
}
