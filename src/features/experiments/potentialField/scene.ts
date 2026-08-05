/**
 * three.js scene for the potential-surface lab.
 *
 * Kept free of React so the render loop can run on refs and raw pointer maths
 * without dragging the component into a re-render. The component only ever
 * calls the setters on the returned handle.
 *
 * Two rules hold the whole thing together:
 *  - Z is up. World coordinates equal physics coordinates, so `camera.up` is
 *    (0, 0, 1) and no axis swapping is needed anywhere.
 *  - Nothing renders unless something changed. `requestRender()` raises a flag;
 *    the rAF loop clears it. Idle costs zero GPU time.
 */

import * as THREE from 'three'
import {
  FIELD_EXTENT,
  HEIGHT_SCALE_DEFAULT,
  MAX_CHARGES,
  SOFTENING,
  SURFACE_AMPLITUDE,
  surfaceHeight,
  type FieldMode,
  type PointCharge,
} from './field'
import {
  SCENE_PALETTES,
  buildRampTextureData,
  hexToUnit,
  rampFor,
  type ScenePalette,
  type ThemeMode,
} from './palette'
import {
  FLOOR_FRAGMENT_SHADER,
  FLOOR_VERTEX_SHADER,
  SURFACE_FRAGMENT_SHADER,
  SURFACE_VERTEX_SHADER,
} from './shaders'

export type SurfaceStyle = 'solid' | 'mesh' | 'both'
export type ResolutionKey = 'low' | 'medium' | 'high'

const RESOLUTION_SEGMENTS: Record<ResolutionKey, number> = { low: 96, medium: 144, high: 208 }

/** Fill alpha, and a multiplier applied to the theme's base grid opacity. */
const STYLE_WEIGHTS: Record<SurfaceStyle, { fill: number; grid: number }> = {
  solid: { fill: 1, grid: 0.18 },
  mesh: { fill: 0.09, grid: 1.6 },
  both: { fill: 1, grid: 1 },
}

const CAMERA_FOV = 42
const DEFAULT_AZIMUTH = 0
const DEFAULT_ELEVATION = 0.54
const DEFAULT_DISTANCE = 28
const DEFAULT_TARGET_Z = 0.4
/** Keeps the view off the horizon, where ray/plane picking degenerates. */
const ELEVATION_MIN = 0.1
const ELEVATION_MAX = 1.42
const DISTANCE_MIN = 7
const DISTANCE_MAX = 46
const TARGET_LIMIT = 9

const MARKER_POP_MS = 260

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

/** Frame-rate independent exponential approach. */
function approach(current: number, target: number, delta: number, tau: number) {
  if (tau <= 0) return target
  const next = current + (target - current) * (1 - Math.exp(-delta / tau))
  return Math.abs(target - next) < 1e-4 ? target : next
}

function easeOutBack(t: number) {
  const c = 1.7
  const p = t - 1
  return 1 + (c + 1) * p * p * p + c * p * p
}

function createGlowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) return null
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.32, 'rgba(255,255,255,0.44)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

function createLabelTexture(text: string, color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) return null
  context.font = '600 38px "SFMono-Regular", Consolas, monospace'
  context.fillStyle = color
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, 64, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

interface ChargeMarker {
  group: THREE.Group
  core: THREE.Mesh
  glow: THREE.Sprite | null
  stem: THREE.Line
  ring: THREE.Mesh
  pick: THREE.Mesh
  coreMaterial: THREE.MeshBasicMaterial
  glowMaterial: THREE.SpriteMaterial | null
  stemMaterial: THREE.LineBasicMaterial
  ringMaterial: THREE.MeshBasicMaterial
  stemPositions: THREE.BufferAttribute
  chargeId: string
  bornAt: number
}

export interface PotentialSceneHandle {
  setCharges(charges: readonly PointCharge[], selectedId: string | null): void
  setMode(mode: FieldMode): void
  setHeightScale(scale: number): void
  setSurfaceStyle(style: SurfaceStyle): void
  setResolution(resolution: ResolutionKey): void
  setTheme(theme: ThemeMode): void
  orbit(deltaAzimuth: number, deltaElevation: number): void
  pan(deltaX: number, deltaY: number): void
  dolly(factor: number): void
  resetCamera(): void
  /** Charge id under the pointer, or null. */
  pickCharge(clientX: number, clientY: number): string | null
  /** Where the pointer ray meets the z = 0 plane, or null if it never does. */
  projectToPlane(clientX: number, clientY: number): { x: number; y: number } | null
  requestRender(): void
  dispose(): void
}

/**
 * Builds the scene inside `container`. Returns null when a WebGL context cannot
 * be created — jsdom during tests, and the small share of real browsers without
 * WebGL 2, both land here and get the fallback panel instead of an exception.
 */
export function createPotentialScene(container: HTMLElement): PotentialSceneHandle | null {
  const canvas = document.createElement('canvas')
  canvas.className = 'potential-lab__canvas'

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
  } catch {
    return null
  }

  renderer.setClearAlpha(0)
  container.appendChild(canvas)

  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const motionTau = reduceMotion ? 0 : 0.075
  const popDuration = reduceMotion ? 0 : MARKER_POP_MS

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 260)
  camera.up.set(0, 0, 1)

  let theme: ThemeMode = 'dark'
  let palette: ScenePalette = SCENE_PALETTES.dark
  let mode: FieldMode = 'potential'
  let pendingMode: FieldMode | null = null
  let surfaceStyle: SurfaceStyle = 'both'
  let resolution: ResolutionKey = 'medium'
  let charges: PointCharge[] = []
  let selectedId: string | null = null

  let heightScaleTarget = HEIGHT_SCALE_DEFAULT
  let heightScaleCurrent = HEIGHT_SCALE_DEFAULT
  let amplitudeTarget = SURFACE_AMPLITUDE
  let amplitudeCurrent = SURFACE_AMPLITUDE

  let needsRender = true
  let animateUntil = 0
  let onScreen = true
  let viewportHeight = 1
  let frame = 0

  // ---------------------------------------------------------------- colour ramp

  const RAMP_SIZE = 256
  const rampData = new Uint8Array(RAMP_SIZE * 4)
  const rampTexture = new THREE.DataTexture(rampData, RAMP_SIZE, 1, THREE.RGBAFormat)
  rampTexture.minFilter = THREE.LinearFilter
  rampTexture.magFilter = THREE.LinearFilter
  rampTexture.wrapS = THREE.ClampToEdgeWrapping
  rampTexture.wrapT = THREE.ClampToEdgeWrapping

  function refreshRamp() {
    rampData.set(buildRampTextureData(rampFor(theme, mode), RAMP_SIZE))
    rampTexture.needsUpdate = true
  }
  refreshRamp()

  // ------------------------------------------------------------------- surface

  const surfaceUniforms = {
    uCharges: { value: Array.from({ length: MAX_CHARGES }, () => new THREE.Vector3()) },
    uChargeCount: { value: 0 },
    uMode: { value: 0 },
    uHeightScale: { value: heightScaleCurrent },
    uAmplitude: { value: amplitudeCurrent },
    uSoftening: { value: SOFTENING },
    uRamp: { value: rampTexture },
    uRampScale: { value: 0.5 },
    uRampOffset: { value: 0.5 },
    uGridColor: { value: new THREE.Vector3() },
    uGridStrongColor: { value: new THREE.Vector3() },
    uLightDirection: { value: new THREE.Vector3(0.42, -0.56, 0.72).normalize() },
    uAmbient: { value: palette.ambient },
    uFillOpacity: { value: 1 },
    uGridOpacity: { value: palette.gridOpacity },
    uExtent: { value: FIELD_EXTENT },
  }

  const surfaceMaterial = new THREE.ShaderMaterial({
    uniforms: surfaceUniforms,
    vertexShader: SURFACE_VERTEX_SHADER,
    fragmentShader: SURFACE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  })

  let surfaceGeometry = new THREE.PlaneGeometry(
    FIELD_EXTENT * 2,
    FIELD_EXTENT * 2,
    RESOLUTION_SEGMENTS[resolution],
    RESOLUTION_SEGMENTS[resolution],
  )
  const surfaceMesh = new THREE.Mesh(surfaceGeometry, surfaceMaterial)
  surfaceMesh.frustumCulled = false
  surfaceMesh.renderOrder = 1
  scene.add(surfaceMesh)

  // --------------------------------------------------------------------- floor

  const floorUniforms = {
    uGridColor: { value: new THREE.Vector3() },
    uGridStrongColor: { value: new THREE.Vector3() },
    uAxisXColor: { value: new THREE.Vector3() },
    uAxisYColor: { value: new THREE.Vector3() },
    uOpacity: { value: palette.floorOpacity },
    uExtent: { value: FIELD_EXTENT + 1.6 },
    uFadeNear: { value: 16 },
    uFadeFar: { value: 44 },
  }

  const floorMaterial = new THREE.ShaderMaterial({
    uniforms: floorUniforms,
    vertexShader: FLOOR_VERTEX_SHADER,
    fragmentShader: FLOOR_FRAGMENT_SHADER,
    transparent: true,
    // Drawn after the surface and writing no depth. Ordering it first would let
    // its grid lines claim the depth buffer and reject the valley behind them,
    // leaving the lines composited over the empty background instead of over
    // the sheet. Depth testing still hides the floor wherever a peak is nearer.
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  })

  const floorGeometry = new THREE.PlaneGeometry((FIELD_EXTENT + 1.6) * 2, (FIELD_EXTENT + 1.6) * 2, 1, 1)
  const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial)
  floorMesh.renderOrder = 2
  scene.add(floorMesh)

  // ------------------------------------------------------------------- markers

  const coreGeometry = new THREE.SphereGeometry(1, 24, 16)
  const pickGeometry = new THREE.SphereGeometry(1, 12, 8)
  const ringGeometry = new THREE.RingGeometry(0.78, 1, 40)
  const glowTexture = createGlowTexture()

  const markerRoot = new THREE.Group()
  scene.add(markerRoot)
  const markers: ChargeMarker[] = []
  const pickTargets: THREE.Object3D[] = []

  function createMarker(): ChargeMarker {
    const group = new THREE.Group()

    const coreMaterial = new THREE.MeshBasicMaterial({ toneMapped: false })
    const core = new THREE.Mesh(coreGeometry, coreMaterial)
    core.renderOrder = 4

    let glow: THREE.Sprite | null = null
    let glowMaterial: THREE.SpriteMaterial | null = null
    if (glowTexture) {
      glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
      glow = new THREE.Sprite(glowMaterial)
      glow.renderOrder = 6
      group.add(glow)
    }

    const stemGeometry = new THREE.BufferGeometry()
    const stemPositions = new THREE.BufferAttribute(new Float32Array(6), 3)
    stemPositions.setUsage(THREE.DynamicDrawUsage)
    stemGeometry.setAttribute('position', stemPositions)
    const stemMaterial = new THREE.LineBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })
    const stem = new THREE.Line(stemGeometry, stemMaterial)
    stem.frustumCulled = false
    stem.renderOrder = 4

    const ringMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.renderOrder = 3

    const pick = new THREE.Mesh(pickGeometry, new THREE.MeshBasicMaterial({ visible: false }))
    pick.visible = true

    group.add(core, stem, ring, pick)
    markerRoot.add(group)

    return {
      group,
      core,
      glow,
      stem,
      ring,
      pick,
      coreMaterial,
      glowMaterial,
      stemMaterial,
      ringMaterial,
      stemPositions,
      chargeId: '',
      bornAt: 0,
    }
  }

  function syncMarkerPool(now: number) {
    while (markers.length < charges.length) markers.push(createMarker())

    pickTargets.length = 0
    for (let index = 0; index < markers.length; index += 1) {
      const marker = markers[index]
      const charge = charges[index]
      if (!charge) {
        marker.group.visible = false
        marker.chargeId = ''
        continue
      }
      marker.group.visible = true
      if (marker.chargeId !== charge.id) {
        marker.chargeId = charge.id
        marker.bornAt = now
      }
      marker.pick.userData.chargeId = charge.id
      pickTargets.push(marker.pick)
    }
  }

  function updateMarkers(now: number) {
    let animating = false

    for (let index = 0; index < markers.length; index += 1) {
      const marker = markers[index]
      const charge = charges[index]
      if (!charge || !marker.group.visible) continue

      const positive = charge.q >= 0
      const tint = positive ? palette.positive : palette.negative
      const core = positive ? palette.positiveCore : palette.negativeCore
      const height = surfaceHeight(charges, charge.x, charge.y, mode, heightScaleCurrent, amplitudeCurrent)
      const radius = 0.16 + 0.075 * Math.sqrt(Math.abs(charge.q))
      const isSelected = charge.id === selectedId

      const age = popDuration > 0 ? clamp((now - marker.bornAt) / popDuration, 0, 1) : 1
      if (age < 1) animating = true
      const pop = age >= 1 ? 1 : Math.max(0, easeOutBack(age))

      marker.core.position.set(charge.x, charge.y, height)
      marker.core.scale.setScalar(radius * pop * (isSelected ? 1.18 : 1))
      marker.coreMaterial.color.set(core)

      if (marker.glow && marker.glowMaterial) {
        marker.glow.position.copy(marker.core.position)
        marker.glow.scale.setScalar(radius * pop * (isSelected ? 9 : 7))
        marker.glowMaterial.color.set(tint)
        marker.glowMaterial.opacity = palette.glowOpacity * (isSelected ? 1 : 0.78)
        const wanted = palette.additiveGlow ? THREE.AdditiveBlending : THREE.NormalBlending
        if (marker.glowMaterial.blending !== wanted) {
          marker.glowMaterial.blending = wanted
          marker.glowMaterial.needsUpdate = true
        }
      }

      const array = marker.stemPositions.array as Float32Array
      array[0] = charge.x
      array[1] = charge.y
      array[2] = 0
      array[3] = charge.x
      array[4] = charge.y
      array[5] = height
      marker.stemPositions.needsUpdate = true
      marker.stemMaterial.color.set(isSelected ? palette.ringSelected : palette.stem)
      marker.stemMaterial.opacity = isSelected ? 0.85 : 0.45

      marker.ring.position.set(charge.x, charge.y, 0.012)
      marker.ring.scale.setScalar((isSelected ? 0.62 : 0.44) * (1 + 0.55 * Math.sqrt(Math.abs(charge.q))) * pop)
      marker.ringMaterial.color.set(isSelected ? palette.ringSelected : palette.ring)
      marker.ringMaterial.opacity = isSelected ? 0.95 : 0.5

      marker.pick.position.copy(marker.core.position)
      marker.pick.scale.setScalar(Math.max(0.55, radius * 2.4))
    }

    return animating
  }

  // -------------------------------------------------------------- axis labels

  const labelSprites: THREE.Sprite[] = []

  function rebuildLabels() {
    for (const sprite of labelSprites) {
      scene.remove(sprite)
      sprite.material.map?.dispose()
      sprite.material.dispose()
    }
    labelSprites.length = 0

    const definitions: Array<{ text: string; color: string; position: [number, number, number] }> = [
      { text: '+x', color: palette.axisX, position: [FIELD_EXTENT + 0.75, 0, 0.32] },
      { text: '+y', color: palette.axisY, position: [0, FIELD_EXTENT + 0.75, 0.32] },
    ]

    for (const definition of definitions) {
      const texture = createLabelTexture(definition.text, definition.color)
      if (!texture) continue
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      })
      const sprite = new THREE.Sprite(material)
      sprite.position.set(...definition.position)
      sprite.scale.set(1.15, 0.58, 1)
      sprite.renderOrder = 7
      scene.add(sprite)
      labelSprites.push(sprite)
    }
  }

  // -------------------------------------------------------------------- camera

  const cameraState = {
    azimuth: DEFAULT_AZIMUTH,
    elevation: DEFAULT_ELEVATION,
    distance: DEFAULT_DISTANCE,
    target: new THREE.Vector3(0, 0, DEFAULT_TARGET_Z),
  }

  const scratchRight = new THREE.Vector3()
  const scratchUp = new THREE.Vector3()

  function applyCamera() {
    const { azimuth, elevation, distance, target } = cameraState
    const horizontal = Math.cos(elevation) * distance
    camera.position.set(
      target.x + horizontal * Math.cos(azimuth),
      target.y + horizontal * Math.sin(azimuth),
      target.z + Math.sin(elevation) * distance,
    )
    camera.up.set(0, 0, 1)
    camera.lookAt(target)
    camera.updateMatrixWorld()

    floorUniforms.uFadeNear.value = distance * 0.72
    floorUniforms.uFadeFar.value = distance * 2.1
    needsRender = true
  }

  // ------------------------------------------------------------------- picking

  const raycaster = new THREE.Raycaster()
  const pointerNdc = new THREE.Vector2()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  const planeHit = new THREE.Vector3()

  function toNdc(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    )
    return true
  }

  // -------------------------------------------------------------------- themes

  function applyPalette() {
    palette = SCENE_PALETTES[theme]

    surfaceUniforms.uGridColor.value.fromArray(hexToUnit(palette.surfaceGrid))
    surfaceUniforms.uGridStrongColor.value.fromArray(hexToUnit(palette.surfaceGridStrong))
    surfaceUniforms.uAmbient.value = palette.ambient

    floorUniforms.uGridColor.value.fromArray(hexToUnit(palette.floorGrid))
    floorUniforms.uGridStrongColor.value.fromArray(hexToUnit(palette.floorGridStrong))
    floorUniforms.uAxisXColor.value.fromArray(hexToUnit(palette.axisX))
    floorUniforms.uAxisYColor.value.fromArray(hexToUnit(palette.axisY))
    floorUniforms.uOpacity.value = palette.floorOpacity

    applyStyle()
    rebuildLabels()
    needsRender = true
  }

  function applyStyle() {
    const weights = STYLE_WEIGHTS[surfaceStyle]
    surfaceUniforms.uFillOpacity.value = weights.fill
    surfaceUniforms.uGridOpacity.value = clamp(palette.gridOpacity * weights.grid, 0, 1)
    needsRender = true
  }

  function applyMode(next: FieldMode) {
    mode = next
    surfaceUniforms.uMode.value = next === 'potential' ? 0 : 1
    surfaceUniforms.uRampScale.value = next === 'potential' ? 0.5 : 1
    surfaceUniforms.uRampOffset.value = next === 'potential' ? 0.5 : 0
    refreshRamp()
    needsRender = true
  }

  applyPalette()
  applyCamera()

  // ---------------------------------------------------------------- resize/loop

  function resize() {
    const width = Math.max(1, Math.round(container.clientWidth))
    const height = Math.max(1, Math.round(container.clientHeight))
    viewportHeight = height
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    needsRender = true
  }

  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize())
  resizeObserver?.observe(container)

  const intersectionObserver =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => {
            onScreen = entries.some((entry) => entry.isIntersecting)
            if (onScreen) needsRender = true
          },
          { threshold: 0 },
        )
  intersectionObserver?.observe(container)

  function handleVisibility() {
    if (!document.hidden) needsRender = true
  }
  document.addEventListener('visibilitychange', handleVisibility)

  function handleContextLost(event: Event) {
    event.preventDefault()
  }
  function handleContextRestored() {
    needsRender = true
  }
  canvas.addEventListener('webglcontextlost', handleContextLost)
  canvas.addEventListener('webglcontextrestored', handleContextRestored)

  resize()

  function renderFrame(now: number) {
    surfaceUniforms.uHeightScale.value = heightScaleCurrent
    surfaceUniforms.uAmplitude.value = amplitudeCurrent
    const markersAnimating = updateMarkers(now)
    renderer.render(scene, camera)
    return markersAnimating
  }

  let previous = typeof performance === 'undefined' ? 0 : performance.now()

  function tick(now: number) {
    frame = requestAnimationFrame(tick)
    const delta = Math.min((now - previous) / 1000, 0.1)
    previous = now

    if (!onScreen || document.hidden) return

    let easing = false

    const nextScale = approach(heightScaleCurrent, heightScaleTarget, delta, motionTau)
    if (nextScale !== heightScaleCurrent) {
      heightScaleCurrent = nextScale
      easing = true
    }

    const nextAmplitude = approach(amplitudeCurrent, amplitudeTarget, delta, motionTau)
    if (nextAmplitude !== amplitudeCurrent) {
      amplitudeCurrent = nextAmplitude
      easing = true
    }

    // The mode swap happens at the bottom of the collapse so the surface morphs
    // through flat rather than snapping between two unrelated shapes.
    if (pendingMode && amplitudeCurrent <= 0.08) {
      applyMode(pendingMode)
      pendingMode = null
      amplitudeTarget = SURFACE_AMPLITUDE
      easing = true
    }

    if (easing || needsRender || now < animateUntil) {
      const markersAnimating = renderFrame(now)
      needsRender = false
      if (markersAnimating) animateUntil = Math.max(animateUntil, now + 40)
    }
  }

  frame = requestAnimationFrame(tick)

  // -------------------------------------------------------------------- handle

  return {
    setCharges(next, nextSelectedId) {
      charges = next.slice(0, MAX_CHARGES)
      selectedId = nextSelectedId
      const slots = surfaceUniforms.uCharges.value
      for (let index = 0; index < MAX_CHARGES; index += 1) {
        const charge = charges[index]
        if (charge) slots[index].set(charge.x, charge.y, charge.q)
        else slots[index].set(0, 0, 0)
      }
      surfaceUniforms.uChargeCount.value = charges.length
      const now = performance.now()
      syncMarkerPool(now)
      animateUntil = Math.max(animateUntil, now + popDuration + 40)
      needsRender = true
    },

    setMode(next) {
      if (next === mode && !pendingMode) return
      if (reduceMotion) {
        pendingMode = null
        amplitudeTarget = SURFACE_AMPLITUDE
        amplitudeCurrent = SURFACE_AMPLITUDE
        applyMode(next)
        return
      }
      pendingMode = next
      amplitudeTarget = 0.05
      needsRender = true
    },

    setHeightScale(scale) {
      heightScaleTarget = scale
      if (reduceMotion) heightScaleCurrent = scale
      needsRender = true
    },

    setSurfaceStyle(style) {
      surfaceStyle = style
      applyStyle()
    },

    setResolution(next) {
      if (next === resolution) return
      resolution = next
      const segments = RESOLUTION_SEGMENTS[next]
      const replacement = new THREE.PlaneGeometry(FIELD_EXTENT * 2, FIELD_EXTENT * 2, segments, segments)
      surfaceMesh.geometry = replacement
      surfaceGeometry.dispose()
      surfaceGeometry = replacement
      needsRender = true
    },

    setTheme(next) {
      if (next === theme) return
      theme = next
      refreshRamp()
      applyPalette()
    },

    orbit(deltaAzimuth, deltaElevation) {
      cameraState.azimuth += deltaAzimuth
      cameraState.elevation = clamp(cameraState.elevation + deltaElevation, ELEVATION_MIN, ELEVATION_MAX)
      applyCamera()
    },

    pan(deltaX, deltaY) {
      const worldPerPixel =
        (2 * cameraState.distance * Math.tan((CAMERA_FOV * Math.PI) / 360)) / Math.max(1, viewportHeight)
      scratchRight.setFromMatrixColumn(camera.matrix, 0)
      scratchUp.setFromMatrixColumn(camera.matrix, 1)
      cameraState.target.addScaledVector(scratchRight, -deltaX * worldPerPixel)
      cameraState.target.addScaledVector(scratchUp, deltaY * worldPerPixel)
      cameraState.target.x = clamp(cameraState.target.x, -TARGET_LIMIT, TARGET_LIMIT)
      cameraState.target.y = clamp(cameraState.target.y, -TARGET_LIMIT, TARGET_LIMIT)
      cameraState.target.z = clamp(cameraState.target.z, -4, 8)
      applyCamera()
    },

    dolly(factor) {
      cameraState.distance = clamp(cameraState.distance * factor, DISTANCE_MIN, DISTANCE_MAX)
      applyCamera()
    },

    resetCamera() {
      cameraState.azimuth = DEFAULT_AZIMUTH
      cameraState.elevation = DEFAULT_ELEVATION
      cameraState.distance = DEFAULT_DISTANCE
      cameraState.target.set(0, 0, DEFAULT_TARGET_Z)
      applyCamera()
    },

    pickCharge(clientX, clientY) {
      if (pickTargets.length === 0 || !toNdc(clientX, clientY)) return null
      raycaster.setFromCamera(pointerNdc, camera)
      const hits = raycaster.intersectObjects(pickTargets, false)
      if (hits.length === 0) return null
      return (hits[0].object.userData.chargeId as string | undefined) ?? null
    },

    projectToPlane(clientX, clientY) {
      if (!toNdc(clientX, clientY)) return null
      raycaster.setFromCamera(pointerNdc, camera)
      const hit = raycaster.ray.intersectPlane(groundPlane, planeHit)
      return hit ? { x: hit.x, y: hit.y } : null
    },

    requestRender() {
      needsRender = true
    },

    dispose() {
      cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)

      for (const marker of markers) {
        marker.stem.geometry.dispose()
        marker.coreMaterial.dispose()
        marker.glowMaterial?.dispose()
        marker.stemMaterial.dispose()
        marker.ringMaterial.dispose()
        ;(marker.pick.material as THREE.Material).dispose()
      }
      for (const sprite of labelSprites) {
        sprite.material.map?.dispose()
        sprite.material.dispose()
      }

      coreGeometry.dispose()
      pickGeometry.dispose()
      ringGeometry.dispose()
      glowTexture?.dispose()
      surfaceGeometry.dispose()
      surfaceMaterial.dispose()
      floorGeometry.dispose()
      floorMaterial.dispose()
      rampTexture.dispose()

      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
