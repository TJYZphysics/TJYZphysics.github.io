/**
 * Electrostatics for the 3D potential-surface lab.
 *
 * Every formula in this file has a twin inside `shaders.ts`: the GPU evaluates
 * the same expressions once per vertex, while the CPU only needs a handful of
 * point samples (charge marker heights, panel readouts). If you change the
 * softening, the saturation curve or the field law here, change the GLSL too —
 * otherwise the markers drift off the surface they are supposed to sit on.
 */

export interface PointCharge {
  id: string
  /** Plane coordinate, scene units. */
  x: number
  /** Plane coordinate, scene units. */
  y: number
  /** Charge magnitude; positive lifts the surface, negative pulls it down. */
  q: number
}

/** Which scalar the Z axis encodes. */
export type FieldMode = 'potential' | 'magnitude'

/** Half-width of the rendered sheet, scene units. */
export const FIELD_EXTENT = 7
/** Charges stay inside this box so they never sit under the faded rim. */
export const PLACEMENT_LIMIT = 5.5
/** Largest magnitude a single charge may carry. */
export const CHARGE_LIMIT = 5
/**
 * Squared Plummer softening length. Replaces r with sqrt(r^2 + SOFTENING) so the
 * 1/r singularity at a charge becomes a finite, smooth peak of height q/0.4.
 */
export const SOFTENING = 0.16
/** Shader uniform arrays are fixed size — keep in step with MAX_CHARGES in shaders.ts. */
export const MAX_CHARGES = 16
/** Peak displacement of the surface along Z, scene units. */
export const SURFACE_AMPLITUDE = 3.4

export const HEIGHT_SCALE_MIN = 0.2
export const HEIGHT_SCALE_MAX = 3
export const HEIGHT_SCALE_DEFAULT = 1

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

/** Rounds away float noise so panel inputs and drag results stay tidy. */
function tidy(value: number, digits = 2) {
  const rounded = Number(value.toFixed(digits))
  return Object.is(rounded, -0) ? 0 : rounded
}

export function clampCoordinate(value: number) {
  if (!Number.isFinite(value)) return 0
  return tidy(clamp(value, -PLACEMENT_LIMIT, PLACEMENT_LIMIT))
}

export function clampCharge(value: number) {
  if (!Number.isFinite(value)) return 0
  return tidy(clamp(value, -CHARGE_LIMIT, CHARGE_LIMIT))
}

export function clampHeightScale(value: number) {
  if (!Number.isFinite(value)) return HEIGHT_SCALE_DEFAULT
  return clamp(value, HEIGHT_SCALE_MIN, HEIGHT_SCALE_MAX)
}

let chargeSequence = 0

export function createCharge(x: number, y: number, q: number): PointCharge {
  chargeSequence += 1
  return { id: `charge-${chargeSequence}`, x: clampCoordinate(x), y: clampCoordinate(y), q: clampCharge(q) }
}

/**
 * Electric potential in units where Coulomb's constant is 1.
 * Phi = sum q_i / sqrt(r_i^2 + SOFTENING)
 */
export function evaluatePotential(charges: readonly PointCharge[], x: number, y: number) {
  let total = 0
  for (let index = 0; index < charges.length; index += 1) {
    const charge = charges[index]
    const dx = x - charge.x
    const dy = y - charge.y
    total += charge.q / Math.sqrt(dx * dx + dy * dy + SOFTENING)
  }
  return total
}

/**
 * In-plane field vector, same units as the potential.
 * E = sum q_i * d_i / (r_i^2 + SOFTENING)^(3/2)
 */
export function evaluateFieldVector(charges: readonly PointCharge[], x: number, y: number) {
  let ex = 0
  let ey = 0
  for (let index = 0; index < charges.length; index += 1) {
    const charge = charges[index]
    const dx = x - charge.x
    const dy = y - charge.y
    const squared = dx * dx + dy * dy + SOFTENING
    const falloff = charge.q / (squared * Math.sqrt(squared))
    ex += dx * falloff
    ey += dy * falloff
  }
  return { x: ex, y: ey }
}

/** The scalar mapped onto Z, before any scaling or saturation. */
export function evaluateField(charges: readonly PointCharge[], x: number, y: number, mode: FieldMode) {
  if (mode === 'potential') return evaluatePotential(charges, x, y)
  const vector = evaluateFieldVector(charges, x, y)
  return Math.hypot(vector.x, vector.y)
}

/**
 * tanh, spelled out so the GLSL twin can avoid `exp` overflow and stay
 * compatible with GLSL ES 1.0. Maps the whole real line into (-1, 1), which is
 * what keeps a charge's infinite spike from shooting off screen.
 */
export function softSaturate(value: number) {
  const x = clamp(value, -8, 8)
  const exponential = Math.exp(2 * x)
  return (exponential - 1) / (exponential + 1)
}

/** Field value squashed into [-1, 1] — the exact quantity the colour ramp indexes. */
export function normalizedField(
  charges: readonly PointCharge[],
  x: number,
  y: number,
  mode: FieldMode,
  heightScale: number,
) {
  return softSaturate(evaluateField(charges, x, y, mode) * heightScale)
}

/** World-space Z of the surface, used to sit charge markers on their own peak. */
export function surfaceHeight(
  charges: readonly PointCharge[],
  x: number,
  y: number,
  mode: FieldMode,
  heightScale: number,
  amplitude = SURFACE_AMPLITUDE,
) {
  return normalizedField(charges, x, y, mode, heightScale) * amplitude
}

export interface FieldSummary {
  /** Algebraic sum of every charge. */
  netCharge: number
  /** Highest sampled field value. */
  peak: number
  /** Lowest sampled field value; always 0 or above in magnitude mode. */
  valley: number
}

/**
 * Coarse survey of the sheet for the readout strip and the legend end labels.
 * Charge positions are sampled explicitly because a regular grid tends to miss
 * the extrema, which sit exactly on top of the charges.
 */
export function summarizeField(
  charges: readonly PointCharge[],
  mode: FieldMode,
  samples = 41,
): FieldSummary {
  let netCharge = 0
  for (let index = 0; index < charges.length; index += 1) netCharge += charges[index].q

  if (charges.length === 0) return { netCharge: 0, peak: 0, valley: 0 }

  let peak = Number.NEGATIVE_INFINITY
  let valley = Number.POSITIVE_INFINITY
  const step = (2 * FIELD_EXTENT) / (samples - 1)

  for (let row = 0; row < samples; row += 1) {
    const y = -FIELD_EXTENT + row * step
    for (let column = 0; column < samples; column += 1) {
      const value = evaluateField(charges, -FIELD_EXTENT + column * step, y, mode)
      if (value > peak) peak = value
      if (value < valley) valley = value
    }
  }

  for (let index = 0; index < charges.length; index += 1) {
    const value = evaluateField(charges, charges[index].x, charges[index].y, mode)
    if (value > peak) peak = value
    if (value < valley) valley = value
  }

  return { netCharge: tidy(netCharge), peak, valley }
}

export interface FieldPreset {
  id: string
  label: string
  charges: ReadonlyArray<{ x: number; y: number; q: number }>
}

/**
 * Starting arrangements. The default camera looks down the +X axis, so a dipole
 * laid out along Y reads left-to-right on screen without touching the controls.
 */
export const FIELD_PRESETS: readonly FieldPreset[] = [
  {
    id: 'dipole',
    label: '偶极子',
    charges: [
      { x: 0, y: -2.6, q: 2.4 },
      { x: 0, y: 2.6, q: -2.4 },
    ],
  },
  {
    id: 'quadrupole',
    label: '四极矩',
    charges: [
      { x: 2.4, y: 2.4, q: 2 },
      { x: -2.4, y: 2.4, q: -2 },
      { x: -2.4, y: -2.4, q: 2 },
      { x: 2.4, y: -2.4, q: -2 },
    ],
  },
  {
    id: 'capacitor',
    label: '平行板',
    charges: [
      { x: -3, y: -2.4, q: 1.5 },
      { x: 0, y: -2.4, q: 1.5 },
      { x: 3, y: -2.4, q: 1.5 },
      { x: -3, y: 2.4, q: -1.5 },
      { x: 0, y: 2.4, q: -1.5 },
      { x: 3, y: 2.4, q: -1.5 },
    ],
  },
  {
    id: 'monopole',
    label: '单点电荷',
    charges: [{ x: 0, y: 0, q: 3 }],
  },
]

export function instantiatePreset(preset: FieldPreset): PointCharge[] {
  return preset.charges.slice(0, MAX_CHARGES).map(({ x, y, q }) => createCharge(x, y, q))
}

/** Signed, fixed-width formatting for the monospace readouts. */
export function formatSigned(value: number, digits = 2) {
  const rounded = tidy(value, digits)
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(digits)}`
}
