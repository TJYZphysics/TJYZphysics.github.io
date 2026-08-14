import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  BLACK,
  BOARD_SIZE,
  EMPTY,
  WHITE,
  coordinateToIndex,
  coordinatesEqual,
  indexToCoordinate,
  type Coordinate,
} from './rules'

export type PieceDisplayMode = 'both' | 'black' | 'white'

export interface BoardScenePosition {
  board: Uint8Array
  winningLine: readonly Coordinate[]
  lastMove: Coordinate | null
  suggestion: Coordinate | null
  displayMode: PieceDisplayMode
  showOrientationGizmo: boolean
}

export interface BoardSceneHandle {
  setPosition(position: BoardScenePosition): void
  setHover(coordinate: Coordinate | null): void
  pick(clientX: number, clientY: number): Coordinate | null
  resetCamera(): void
  dispose(): void
}

interface BoardSceneOptions {
  onContextStatus?: (available: boolean) => void
}

const SPACING = 0.82
const HALF = (BOARD_SIZE - 1) / 2
const BOARD_SPAN = (BOARD_SIZE - 1) * SPACING

type BoardColorMode = 'dark' | 'light'

const BOARD_PALETTES = {
  dark: {
    background: 0x29465f,
    exposure: 1.12,
    hemisphere: { sky: 0xcceeff, ground: 0x11152d, intensity: 1.75 },
    key: { color: 0xffffff, intensity: 3.1 },
    rim: { color: 0x54dfff, intensity: 2.2 },
    lattice: { color: 0x9ac9e4, opacity: 0.2 },
    frame: { color: 0x8bdff3, opacity: 0.52 },
    node: { color: 0xb0dff2, opacity: 0.82 },
    black: { color: 0x020608, emissive: 0x001418, emissiveIntensity: 0.34, metalness: 0.58, roughness: 0.24 },
    white: { color: 0xe4efff, emissive: 0x263557, emissiveIntensity: 0.25, metalness: 0.12, roughness: 0.18 },
    filteredOpacity: { black: 0.14, white: 0.13 },
    markers: { hover: 0x70eaff, last: 0x8ab7ff, suggestion: 0xffd477, winning: 0x62f4c4 },
  },
  light: {
    background: 0xe4ecee,
    exposure: 1.04,
    hemisphere: { sky: 0xffffff, ground: 0xa9b6b8, intensity: 1.55 },
    key: { color: 0xfffdf5, intensity: 2.05 },
    rim: { color: 0x2f8fa1, intensity: 0.7 },
    lattice: { color: 0x326f80, opacity: 0.3 },
    frame: { color: 0x176f82, opacity: 0.78 },
    node: { color: 0x2c7182, opacity: 0.86 },
    black: { color: 0x26363b, emissive: 0x000000, emissiveIntensity: 0.03, metalness: 0.18, roughness: 0.5 },
    white: { color: 0xf3eee3, emissive: 0x000000, emissiveIntensity: 0, metalness: 0.02, roughness: 0.55 },
    filteredOpacity: { black: 0.3, white: 0.46 },
    markers: { hover: 0x00788c, last: 0x315fa8, suggestion: 0xac6500, winning: 0x11785d },
  },
} as const

function toWorld({ x, y, z }: Coordinate, target = new THREE.Vector3()) {
  return target.set((x - HALF) * SPACING, (y - HALF) * SPACING, (z - HALF) * SPACING)
}

function createLatticeGeometry() {
  const positions: number[] = []

  function addLine(a: Coordinate, b: Coordinate) {
    const start = toWorld(a)
    const end = toWorld(b)
    positions.push(start.x, start.y, start.z, end.x, end.y, end.z)
  }

  for (let a = 0; a < BOARD_SIZE; a += 1) {
    for (let b = 0; b < BOARD_SIZE; b += 1) {
      addLine({ x: 0, y: a, z: b }, { x: BOARD_SIZE - 1, y: a, z: b })
      addLine({ x: a, y: 0, z: b }, { x: a, y: BOARD_SIZE - 1, z: b })
      addLine({ x: a, y: b, z: 0 }, { x: a, y: b, z: BOARD_SIZE - 1 })
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

function setMaterialOpacity(material: THREE.MeshPhysicalMaterial, opacity: number) {
  const depthWrite = opacity > 0.75
  if (material.opacity === opacity && material.depthWrite === depthWrite) return
  material.opacity = opacity
  material.depthWrite = depthWrite
  material.needsUpdate = true
}

function createGizmoTexture(
  size: number,
  draw: (context: CanvasRenderingContext2D, size: number) => void,
) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) draw(context, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}

function createOrientationGizmo(colorMode: BoardColorMode) {
  const lightMode = colorMode === 'light'
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1.72, 1.72, 1.72, -1.72, 0.1, 10)
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const textures: THREE.Texture[] = []

  const backdropTexture = createGizmoTexture(128, (context, size) => {
    context.beginPath()
    context.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2)
    context.fillStyle = lightMode ? 'rgba(250, 253, 252, 0.88)' : 'rgba(4, 11, 23, 0.76)'
    context.fill()
    context.strokeStyle = lightMode ? 'rgba(24, 91, 106, 0.34)' : 'rgba(159, 211, 240, 0.3)'
    context.lineWidth = 2
    context.stroke()
  })
  textures.push(backdropTexture)
  const backdropMaterial = new THREE.SpriteMaterial({
    map: backdropTexture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  materials.push(backdropMaterial)
  const backdrop = new THREE.Sprite(backdropMaterial)
  backdrop.scale.setScalar(3.25)
  backdrop.renderOrder = -10
  scene.add(backdrop)

  const originGeometry = new THREE.SphereGeometry(0.075, 10, 8)
  const originMaterial = new THREE.MeshBasicMaterial({
    color: lightMode ? 0x173640 : 0xf1f7ff,
    depthTest: false,
  })
  geometries.push(originGeometry)
  materials.push(originMaterial)
  const origin = new THREE.Mesh(originGeometry, originMaterial)
  origin.renderOrder = 2
  scene.add(origin)

  const zero = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)

  function addAxis(direction: THREE.Vector3, color: number, cssColor: string, label: string) {
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      zero,
      direction.clone().multiplyScalar(1.03),
    ])
    const lineMaterial = new THREE.LineBasicMaterial({ color, depthTest: false })
    geometries.push(lineGeometry)
    materials.push(lineMaterial)
    const line = new THREE.Line(lineGeometry, lineMaterial)
    line.renderOrder = 1
    scene.add(line)

    const arrowGeometry = new THREE.ConeGeometry(0.095, 0.25, 12)
    const arrowMaterial = new THREE.MeshBasicMaterial({ color, depthTest: false })
    geometries.push(arrowGeometry)
    materials.push(arrowMaterial)
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial)
    arrow.position.copy(direction).multiplyScalar(1.13)
    arrow.quaternion.setFromUnitVectors(up, direction)
    arrow.renderOrder = 2
    scene.add(arrow)

    const labelTexture = createGizmoTexture(64, (context, size) => {
      context.fillStyle = cssColor
      context.font = '700 36px "SFMono-Regular", Consolas, monospace'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.shadowColor = lightMode ? 'rgba(255, 255, 255, 0.96)' : 'rgba(0, 0, 0, 0.8)'
      context.shadowBlur = 5
      context.fillText(label, size / 2, size / 2 + 1)
    })
    textures.push(labelTexture)
    const labelMaterial = new THREE.SpriteMaterial({
      map: labelTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    materials.push(labelMaterial)
    const labelSprite = new THREE.Sprite(labelMaterial)
    labelSprite.position.copy(direction).multiplyScalar(1.48)
    labelSprite.scale.setScalar(0.46)
    labelSprite.renderOrder = 3
    scene.add(labelSprite)
  }

  addAxis(new THREE.Vector3(1, 0, 0), lightMode ? 0xc53c48 : 0xff6b73, lightMode ? '#a82130' : '#ff7f86', 'X')
  addAxis(new THREE.Vector3(0, 1, 0), lightMode ? 0x178044 : 0x7ee787, lightMode ? '#0d7138' : '#8df09a', 'Y')
  addAxis(new THREE.Vector3(0, 0, 1), lightMode ? 0x285fa8 : 0x66aaff, lightMode ? '#1d559d' : '#7cb8ff', 'Z')

  return {
    sync(mainCamera: THREE.PerspectiveCamera, target: THREE.Vector3) {
      camera.position.copy(mainCamera.position).sub(target).normalize().multiplyScalar(4)
      camera.up.copy(mainCamera.up)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld()
    },
    render(renderer: THREE.WebGLRenderer, width: number, height: number) {
      const size = Math.round(Math.max(74, Math.min(96, Math.min(width, height) * 0.17)))
      const inset = width <= 500 ? 11 : 15
      renderer.clearDepth()
      renderer.setScissorTest(true)
      renderer.setViewport(inset, inset, size, size)
      renderer.setScissor(inset, inset, size, size)
      renderer.render(scene, camera)
      renderer.setScissorTest(false)
      renderer.setViewport(0, 0, width, height)
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      textures.forEach((texture) => texture.dispose())
    },
  }
}

export function createBoardScene(
  container: HTMLElement,
  options: BoardSceneOptions = {},
): BoardSceneHandle | null {
  let colorMode: BoardColorMode = document.documentElement.dataset.colorMode === 'light'
    ? 'light'
    : 'dark'
  let palette = BOARD_PALETTES[colorMode]
  const canvas = document.createElement('canvas')
  canvas.className = 'gomoku3d-board__canvas'
  canvas.setAttribute('aria-label', '可旋转的八乘八乘八三维五子棋棋盘')

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
  } catch {
    return null
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = palette.exposure
  renderer.setClearColor(palette.background, 1)
  renderer.autoClear = false
  container.appendChild(canvas)

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(palette.background, 0.028)

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80)
  camera.position.set(8.6, 7.4, 9.4)

  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0, 0, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.minDistance = 7.6
  controls.maxDistance = 19
  controls.rotateSpeed = 0.62
  controls.zoomSpeed = 0.82
  controls.saveState()
  let orientationGizmo = createOrientationGizmo(colorMode)

  const hemisphereLight = new THREE.HemisphereLight(
    palette.hemisphere.sky,
    palette.hemisphere.ground,
    palette.hemisphere.intensity,
  )
  scene.add(hemisphereLight)
  const keyLight = new THREE.DirectionalLight(palette.key.color, palette.key.intensity)
  keyLight.position.set(5, 8, 7)
  scene.add(keyLight)
  const rimLight = new THREE.DirectionalLight(palette.rim.color, palette.rim.intensity)
  rimLight.position.set(-7, -3, -5)
  scene.add(rimLight)

  const latticeGeometry = createLatticeGeometry()
  const latticeMaterial = new THREE.LineBasicMaterial({
    color: palette.lattice.color,
    transparent: true,
    opacity: palette.lattice.opacity,
    depthWrite: false,
  })
  const lattice = new THREE.LineSegments(latticeGeometry, latticeMaterial)
  lattice.renderOrder = 0
  scene.add(lattice)

  const frameGeometry = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(BOARD_SPAN + 0.08, BOARD_SPAN + 0.08, BOARD_SPAN + 0.08),
  )
  const frameMaterial = new THREE.LineBasicMaterial({
    color: palette.frame.color,
    transparent: true,
    opacity: palette.frame.opacity,
    depthWrite: false,
  })
  const boardFrame = new THREE.LineSegments(frameGeometry, frameMaterial)
  scene.add(boardFrame)

  const transform = new THREE.Object3D()
  const nodeGeometry = new THREE.SphereGeometry(0.035, 6, 4)
  const nodeMaterial = new THREE.MeshBasicMaterial({
    color: palette.node.color,
    transparent: true,
    opacity: palette.node.opacity,
    depthWrite: false,
  })
  const nodes = new THREE.InstancedMesh(nodeGeometry, nodeMaterial, BOARD_SIZE ** 3)
  nodes.instanceMatrix.setUsage(THREE.StaticDrawUsage)

  const pickGeometry = new THREE.SphereGeometry(0.25, 8, 6)
  const pickMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  })
  const pickPoints = new THREE.InstancedMesh(pickGeometry, pickMaterial, BOARD_SIZE ** 3)
  pickPoints.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  pickPoints.frustumCulled = false

  for (let index = 0; index < BOARD_SIZE ** 3; index += 1) {
    transform.position.copy(toWorld(indexToCoordinate(index)))
    transform.updateMatrix()
    nodes.setMatrixAt(index, transform.matrix)
    pickPoints.setMatrixAt(index, transform.matrix)
  }
  nodes.instanceMatrix.needsUpdate = true
  pickPoints.instanceMatrix.needsUpdate = true
  scene.add(nodes, pickPoints)

  const stoneGeometry = new THREE.SphereGeometry(0.225, 18, 14)
  const blackMaterial = new THREE.MeshPhysicalMaterial({
    color: palette.black.color,
    emissive: palette.black.emissive,
    emissiveIntensity: palette.black.emissiveIntensity,
    metalness: palette.black.metalness,
    roughness: palette.black.roughness,
    clearcoat: colorMode === 'light' ? 0.25 : 1,
    clearcoatRoughness: colorMode === 'light' ? 0.55 : 0.16,
    transparent: true,
  })
  const whiteMaterial = new THREE.MeshPhysicalMaterial({
    color: palette.white.color,
    emissive: palette.white.emissive,
    emissiveIntensity: palette.white.emissiveIntensity,
    metalness: palette.white.metalness,
    roughness: palette.white.roughness,
    clearcoat: colorMode === 'light' ? 0.22 : 1,
    clearcoatRoughness: colorMode === 'light' ? 0.6 : 0.12,
    transparent: true,
  })
  const blackStones = new THREE.InstancedMesh(stoneGeometry, blackMaterial, BOARD_SIZE ** 3)
  const whiteStones = new THREE.InstancedMesh(stoneGeometry, whiteMaterial, BOARD_SIZE ** 3)
  blackStones.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  whiteStones.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  scene.add(blackStones, whiteStones)

  const markerGeometry = new THREE.SphereGeometry(0.286, 12, 9)
  const hoverMaterial = new THREE.MeshBasicMaterial({
    color: palette.markers.hover,
    wireframe: true,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
  })
  const lastMaterial = new THREE.MeshBasicMaterial({
    color: palette.markers.last,
    wireframe: true,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  })
  const suggestionMaterial = new THREE.MeshBasicMaterial({
    color: palette.markers.suggestion,
    wireframe: true,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
  })
  const winningMaterial = new THREE.MeshBasicMaterial({
    color: palette.markers.winning,
    wireframe: true,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
  })
  const hoverMarker = new THREE.Mesh(markerGeometry, hoverMaterial)
  const lastMarker = new THREE.Mesh(markerGeometry, lastMaterial)
  const suggestionMarker = new THREE.Mesh(markerGeometry, suggestionMaterial)
  const winningMarkers = new THREE.InstancedMesh(markerGeometry, winningMaterial, BOARD_SIZE)
  hoverMarker.visible = false
  lastMarker.visible = false
  suggestionMarker.visible = false
  winningMarkers.count = 0
  scene.add(hoverMarker, lastMarker, suggestionMarker, winningMarkers)

  let board = new Uint8Array(BOARD_SIZE ** 3)
  let hovered: Coordinate | null = null
  let needsRender = true
  let controlsActive = false
  let settleUntil = 0
  let onScreen = true
  let disposed = false
  let showOrientationGizmo = false
  let displayMode: PieceDisplayMode = 'both'
  let viewportWidth = 1
  let viewportHeight = 1

  function requestRender() {
    needsRender = true
  }

  function applyDisplayMode() {
    setMaterialOpacity(
      blackMaterial,
      displayMode === 'white' ? palette.filteredOpacity.black : 1,
    )
    setMaterialOpacity(
      whiteMaterial,
      displayMode === 'black' ? palette.filteredOpacity.white : 1,
    )
  }

  function applyColorMode(nextColorMode: BoardColorMode) {
    if (nextColorMode === colorMode) return
    colorMode = nextColorMode
    palette = BOARD_PALETTES[colorMode]

    renderer.toneMappingExposure = palette.exposure
    renderer.setClearColor(palette.background, 1)
    scene.fog?.color.setHex(palette.background)
    hemisphereLight.color.setHex(palette.hemisphere.sky)
    hemisphereLight.groundColor.setHex(palette.hemisphere.ground)
    hemisphereLight.intensity = palette.hemisphere.intensity
    keyLight.color.setHex(palette.key.color)
    keyLight.intensity = palette.key.intensity
    rimLight.color.setHex(palette.rim.color)
    rimLight.intensity = palette.rim.intensity
    latticeMaterial.color.setHex(palette.lattice.color)
    latticeMaterial.opacity = palette.lattice.opacity
    frameMaterial.color.setHex(palette.frame.color)
    frameMaterial.opacity = palette.frame.opacity
    nodeMaterial.color.setHex(palette.node.color)
    nodeMaterial.opacity = palette.node.opacity
    blackMaterial.color.setHex(palette.black.color)
    blackMaterial.emissive.setHex(palette.black.emissive)
    blackMaterial.emissiveIntensity = palette.black.emissiveIntensity
    blackMaterial.metalness = palette.black.metalness
    blackMaterial.roughness = palette.black.roughness
    blackMaterial.clearcoat = colorMode === 'light' ? 0.25 : 1
    blackMaterial.clearcoatRoughness = colorMode === 'light' ? 0.55 : 0.16
    whiteMaterial.color.setHex(palette.white.color)
    whiteMaterial.emissive.setHex(palette.white.emissive)
    whiteMaterial.emissiveIntensity = palette.white.emissiveIntensity
    whiteMaterial.metalness = palette.white.metalness
    whiteMaterial.roughness = palette.white.roughness
    whiteMaterial.clearcoat = colorMode === 'light' ? 0.22 : 1
    whiteMaterial.clearcoatRoughness = colorMode === 'light' ? 0.6 : 0.12
    hoverMaterial.color.setHex(palette.markers.hover)
    lastMaterial.color.setHex(palette.markers.last)
    suggestionMaterial.color.setHex(palette.markers.suggestion)
    winningMaterial.color.setHex(palette.markers.winning)
    applyDisplayMode()

    orientationGizmo.dispose()
    orientationGizmo = createOrientationGizmo(colorMode)
    requestRender()
  }

  const themeObserver = typeof MutationObserver === 'undefined'
    ? null
    : new MutationObserver(() => {
        applyColorMode(document.documentElement.dataset.colorMode === 'light' ? 'light' : 'dark')
      })
  themeObserver?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-color-mode'],
  })

  function syncMarker(mesh: THREE.Mesh, coordinate: Coordinate | null) {
    mesh.visible = coordinate !== null
    if (coordinate) mesh.position.copy(toWorld(coordinate))
  }

  function syncPosition(position: BoardScenePosition) {
    board = position.board.slice()
    showOrientationGizmo = position.showOrientationGizmo
    displayMode = position.displayMode
    let blackCount = 0
    let whiteCount = 0

    for (let index = 0; index < board.length; index += 1) {
      const value = board[index]
      if (value === EMPTY) continue
      transform.position.copy(toWorld(indexToCoordinate(index)))
      transform.updateMatrix()
      if (value === BLACK) {
        blackStones.setMatrixAt(blackCount, transform.matrix)
        blackCount += 1
      } else if (value === WHITE) {
        whiteStones.setMatrixAt(whiteCount, transform.matrix)
        whiteCount += 1
      }
    }

    blackStones.count = blackCount
    whiteStones.count = whiteCount
    blackStones.instanceMatrix.needsUpdate = true
    whiteStones.instanceMatrix.needsUpdate = true

    applyDisplayMode()

    syncMarker(lastMarker, position.lastMove)
    syncMarker(suggestionMarker, position.suggestion)
    if (position.suggestion && board[coordinateToIndex(position.suggestion)] !== EMPTY) {
      suggestionMarker.visible = false
    }

    winningMarkers.count = Math.min(position.winningLine.length, BOARD_SIZE)
    position.winningLine.slice(0, BOARD_SIZE).forEach((coordinate, index) => {
      transform.position.copy(toWorld(coordinate))
      transform.updateMatrix()
      winningMarkers.setMatrixAt(index, transform.matrix)
    })
    winningMarkers.instanceMatrix.needsUpdate = true

    if (hovered && board[coordinateToIndex(hovered)] !== EMPTY) {
      hovered = null
      hoverMarker.visible = false
    }
    requestRender()
  }

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()

  function pick(clientX: number, clientY: number) {
    const bounds = canvas.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return null
    pointer.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    )
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObject(pickPoints, false)
    for (const hit of hits) {
      if (hit.instanceId === undefined) continue
      const coordinate = indexToCoordinate(hit.instanceId)
      if (board[hit.instanceId] === EMPTY) return coordinate
    }
    return null
  }

  function resize() {
    const width = Math.max(1, Math.round(container.clientWidth))
    const height = Math.max(1, Math.round(container.clientHeight))
    viewportWidth = width
    viewportHeight = height
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    requestRender()
  }

  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(resize)
  resizeObserver?.observe(container)

  const intersectionObserver = typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver((entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting)
        if (onScreen) requestRender()
      })
  intersectionObserver?.observe(container)

  const handleControlStart = () => {
    controlsActive = true
  }
  const handleControlEnd = () => {
    controlsActive = false
    settleUntil = performance.now() + 650
  }
  controls.addEventListener('start', handleControlStart)
  controls.addEventListener('end', handleControlEnd)
  controls.addEventListener('change', requestRender)

  const handleVisibility = () => {
    if (!document.hidden) requestRender()
  }
  const handleContextLost = (event: Event) => {
    event.preventDefault()
    options.onContextStatus?.(false)
  }
  const handleContextRestored = () => {
    options.onContextStatus?.(true)
    requestRender()
  }
  document.addEventListener('visibilitychange', handleVisibility)
  canvas.addEventListener('webglcontextlost', handleContextLost)
  canvas.addEventListener('webglcontextrestored', handleContextRestored)

  resize()
  controls.update()

  let animationFrame = 0
  function tick(now: number) {
    animationFrame = requestAnimationFrame(tick)
    if (!onScreen || document.hidden) return

    const controlsChanging = controlsActive || now < settleUntil
    const changed = controlsChanging ? controls.update() : false
    if (needsRender || changed) {
      renderer.setViewport(0, 0, viewportWidth, viewportHeight)
      renderer.setScissorTest(false)
      renderer.clear()
      renderer.render(scene, camera)
      if (showOrientationGizmo) {
        orientationGizmo.sync(camera, controls.target)
        orientationGizmo.render(renderer, viewportWidth, viewportHeight)
      }
      needsRender = false
    }
  }
  animationFrame = requestAnimationFrame(tick)

  return {
    setPosition: syncPosition,
    setHover(coordinate) {
      if (coordinatesEqual(hovered, coordinate) || (!hovered && !coordinate)) return
      hovered = coordinate
      syncMarker(hoverMarker, coordinate)
      requestRender()
    },
    pick,
    resetCamera() {
      controls.reset()
      settleUntil = performance.now() + 650
      requestRender()
    },
    dispose() {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(animationFrame)
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      themeObserver?.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      controls.removeEventListener('start', handleControlStart)
      controls.removeEventListener('end', handleControlEnd)
      controls.removeEventListener('change', requestRender)
      controls.dispose()

      latticeGeometry.dispose()
      latticeMaterial.dispose()
      frameGeometry.dispose()
      frameMaterial.dispose()
      nodeGeometry.dispose()
      nodeMaterial.dispose()
      pickGeometry.dispose()
      pickMaterial.dispose()
      stoneGeometry.dispose()
      blackMaterial.dispose()
      whiteMaterial.dispose()
      markerGeometry.dispose()
      hoverMaterial.dispose()
      lastMaterial.dispose()
      suggestionMaterial.dispose()
      winningMaterial.dispose()
      orientationGizmo.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
