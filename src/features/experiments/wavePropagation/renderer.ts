import { receiverScreenZ, sampleInstantaneousDisplacement, type WaveField } from './physics'

export type WaveDisplayMode = 'mesh' | 'projection'
export type WaveColorTheme = 'neon' | 'thermal' | 'mono'

export interface WaveCamera {
  yaw: number
  pitch: number
  zoom: number
  panX: number
  panY: number
}

interface ProjectedPoint {
  x: number
  y: number
  depth: number
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

function mixChannel(a: number, b: number, amount: number) {
  return Math.round(a + (b - a) * amount)
}

function mixColor(from: [number, number, number], to: [number, number, number], amount: number) {
  const t = clamp(amount, 0, 1)
  return [mixChannel(from[0], to[0], t), mixChannel(from[1], to[1], t), mixChannel(from[2], to[2], t)] as const
}

function calculatePalette(theme: WaveColorTheme, value: number) {
  const t = clamp((value + 1) / 2, 0, 1)
  if (theme === 'thermal') {
    const rgb = t < 0.34
      ? mixColor([17, 28, 92], [31, 190, 214], t / 0.34)
      : t < 0.68
        ? mixColor([31, 190, 214], [249, 203, 72], (t - 0.34) / 0.34)
        : mixColor([249, 203, 72], [244, 71, 65], (t - 0.68) / 0.32)
    return `rgb(${rgb.join(',')})`
  }
  if (theme === 'mono') {
    const gray = Math.round(42 + t * 190)
    return `rgb(${gray},${gray + 7},${Math.min(255, gray + 16)})`
  }
  const rgb = t < 0.5
    ? mixColor([71, 74, 202], [64, 219, 255], t * 2)
    : mixColor([64, 219, 255], [218, 111, 255], (t - 0.5) * 2)
  return `rgb(${rgb.join(',')})`
}

const COLOR_LUTS: Record<WaveColorTheme, string[]> = {
  neon: Array.from({ length: 129 }, (_, index) => calculatePalette('neon', index / 64 - 1)),
  thermal: Array.from({ length: 129 }, (_, index) => calculatePalette('thermal', index / 64 - 1)),
  mono: Array.from({ length: 129 }, (_, index) => calculatePalette('mono', index / 64 - 1)),
}

function palette(theme: WaveColorTheme, value: number) {
  return COLOR_LUTS[theme][Math.round(clamp((value + 1) * 64, 0, 128))]
}

function projectPoint(
  worldX: number,
  heightValue: number,
  worldZ: number,
  field: WaveField,
  camera: WaveCamera,
  canvasWidth: number,
  canvasHeight: number,
): ProjectedPoint {
  const x = worldX
  const y = heightValue
  const z = worldZ - field.depth / 2
  const cosYaw = Math.cos(camera.yaw)
  const sinYaw = Math.sin(camera.yaw)
  const cosPitch = Math.cos(camera.pitch)
  const sinPitch = Math.sin(camera.pitch)
  const rotatedX = cosYaw * x - sinYaw * z
  const yawDepth = sinYaw * x + cosYaw * z
  const rotatedY = cosPitch * y - sinPitch * yawDepth
  const depth = sinPitch * y + cosPitch * yawDepth
  const baseScale = Math.min(canvasWidth / field.width, canvasHeight / field.depth) * 0.78 * camera.zoom
  const perspective = clamp(1 / (1 + depth / 34), 0.48, 1.9)
  return {
    x: canvasWidth / 2 + camera.panX + rotatedX * baseScale * perspective,
    y: canvasHeight * 0.53 + camera.panY - rotatedY * baseScale * perspective,
    depth,
  }
}

function drawBackdrop(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createRadialGradient(width * 0.48, height * 0.35, 20, width * 0.5, height * 0.52, width * 0.72)
  gradient.addColorStop(0, '#142854')
  gradient.addColorStop(0.48, '#0a1430')
  gradient.addColorStop(1, '#050914')
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
}

function drawProjection(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  field: WaveField,
  values: Float32Array,
  theme: WaveColorTheme,
  camera: WaveCamera,
  receiverDistance: number,
) {
  const basePaddingX = Math.max(34, width * 0.06)
  const basePaddingY = Math.max(38, height * 0.08)
  const plotWidth = (width - basePaddingX * 2) * camera.zoom
  const plotHeight = (height - basePaddingY * 2) * camera.zoom
  const paddingX = (width - plotWidth) / 2 + camera.panX
  const paddingY = (height - plotHeight) / 2 + camera.panY
  const cellWidth = plotWidth / (field.columns - 1)
  const cellHeight = plotHeight / (field.rows - 1)
  context.save()
  context.globalAlpha = 1
  context.fillStyle = 'rgba(5, 10, 25, .84)'
  context.fillRect(paddingX - 8, paddingY - 8, plotWidth + 16, plotHeight + 16)
  for (let row = 0; row < field.rows - 1; row += 1) {
    for (let column = 0; column < field.columns - 1; column += 1) {
      const index = row * field.columns + column
      context.fillStyle = palette(theme, values[index])
      context.fillRect(
        paddingX + column * cellWidth,
        paddingY + (field.rows - 2 - row) * cellHeight,
        cellWidth + 0.8,
        cellHeight + 0.8,
      )
    }
  }
  context.strokeStyle = 'rgba(170, 209, 255, .2)'
  context.lineWidth = 1
  context.strokeRect(paddingX - 8, paddingY - 8, plotWidth + 16, plotHeight + 16)

  if (field.barrierZ != null) {
    const barrierY = paddingY + plotHeight - (field.barrierZ / field.depth) * plotHeight
    const segments: Array<[number, number]> = []
    let cursor = -field.width / 2
    for (const aperture of field.apertures) {
      segments.push([cursor, aperture.start])
      cursor = aperture.end
    }
    segments.push([cursor, field.width / 2])
    context.strokeStyle = 'rgba(233, 239, 255, .82)'
    context.lineWidth = 4
    for (const [start, end] of segments) {
      context.beginPath()
      context.moveTo(paddingX + ((start + field.width / 2) / field.width) * plotWidth, barrierY)
      context.lineTo(paddingX + ((end + field.width / 2) / field.width) * plotWidth, barrierY)
      context.stroke()
    }
  }

  const screenZ = receiverScreenZ(field, receiverDistance)
  const receiverY = paddingY + plotHeight - (screenZ / field.depth) * plotHeight
  context.save()
  context.shadowColor = 'rgba(119, 224, 241, .45)'
  context.shadowBlur = 9
  context.fillStyle = 'rgba(216, 244, 249, .76)'
  context.fillRect(paddingX - 5, receiverY - 3, plotWidth + 10, 6)
  context.shadowBlur = 0
  context.strokeStyle = 'rgba(121, 219, 235, .94)'
  context.lineWidth = 1.2
  context.strokeRect(paddingX - 5, receiverY - 3, plotWidth + 10, 6)
  context.fillStyle = 'rgba(196, 240, 247, .92)'
  context.font = '700 9px "SFMono-Regular", Consolas, monospace'
  context.fillText(`RECEIVER · R ${receiverDistance.toFixed(1)} m`, paddingX + 6, receiverY - 9)
  context.restore()

  context.font = '600 10px "SFMono-Regular", Consolas, monospace'
  for (const source of field.sourcePositions) {
    const sourceX = paddingX + ((source.x + field.width / 2) / field.width) * plotWidth
    const sourceY = paddingY + plotHeight - (source.z / field.depth) * plotHeight
    context.beginPath()
    context.arc(sourceX, sourceY, 5, 0, Math.PI * 2)
    context.fillStyle = '#fff1a6'
    context.shadowColor = '#ffd96b'
    context.shadowBlur = 12
    context.fill()
    context.shadowBlur = 0
    context.fillStyle = 'rgba(255,241,166,.88)'
    context.fillText('S', sourceX + 9, sourceY - 8)
  }

  context.fillStyle = 'rgba(188, 205, 234, .72)'
  context.font = '11px "SFMono-Regular", Consolas, monospace'
  context.fillText('x / m', width - paddingX - 24, height - 14)
  context.fillText('z / m', 12, paddingY + 6)
  context.restore()
}

interface ReceiverFace {
  points: ProjectedPoint[]
  fill: string
  depth: number
}

function drawMeshReceiver(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  field: WaveField,
  camera: WaveCamera,
  receiverDistance: number,
) {
  const z = receiverScreenZ(field, receiverDistance)
  const halfWidth = field.width * 0.47
  const bottom = -0.46
  const top = 1.08
  const halfThickness = Math.max(0.1, field.depth * 0.007)
  const project = (x: number, y: number, worldZ: number) => projectPoint(x, y, worldZ, field, camera, width, height)
  const front = {
    bottomLeft: project(-halfWidth, bottom, z - halfThickness),
    bottomRight: project(halfWidth, bottom, z - halfThickness),
    topRight: project(halfWidth, top, z - halfThickness),
    topLeft: project(-halfWidth, top, z - halfThickness),
  }
  const back = {
    bottomLeft: project(-halfWidth, bottom, z + halfThickness),
    bottomRight: project(halfWidth, bottom, z + halfThickness),
    topRight: project(halfWidth, top, z + halfThickness),
    topLeft: project(-halfWidth, top, z + halfThickness),
  }
  const makeFace = (points: ProjectedPoint[], fill: string): ReceiverFace => ({
    points,
    fill,
    depth: points.reduce((sum, point) => sum + point.depth, 0) / points.length,
  })
  const faces = [
    makeFace([back.bottomLeft, back.bottomRight, back.topRight, back.topLeft], 'rgba(70, 161, 180, .88)'),
    makeFace([front.topLeft, front.topRight, back.topRight, back.topLeft], 'rgba(248, 255, 255, .99)'),
    makeFace([front.bottomRight, back.bottomRight, back.topRight, front.topRight], 'rgba(83, 181, 199, .96)'),
    makeFace([front.bottomLeft, front.bottomRight, front.topRight, front.topLeft], 'rgba(224, 250, 252, .92)'),
  ].sort((a, b) => b.depth - a.depth)

  context.save()
  context.lineJoin = 'round'
  context.shadowColor = 'rgba(104, 225, 242, .34)'
  context.shadowBlur = 12
  for (const face of faces) {
    context.beginPath()
    context.moveTo(face.points[0].x, face.points[0].y)
    for (let index = 1; index < face.points.length; index += 1) context.lineTo(face.points[index].x, face.points[index].y)
    context.closePath()
    context.fillStyle = face.fill
    context.fill()
    context.strokeStyle = 'rgba(249, 255, 255, .98)'
    context.lineWidth = 1.2
    context.stroke()
  }
  context.shadowBlur = 0

  for (let marker = 1; marker < 10; marker += 1) {
    const x = -halfWidth + (marker / 10) * halfWidth * 2
    const from = project(x, bottom + 0.08, z - halfThickness - 0.002)
    const to = project(x, top - 0.08, z - halfThickness - 0.002)
    context.beginPath()
    context.moveTo(from.x, from.y)
    context.lineTo(to.x, to.y)
    context.strokeStyle = marker === 5 ? 'rgba(0, 139, 160, .98)' : 'rgba(82, 163, 177, .58)'
    context.lineWidth = marker === 5 ? 1.5 : 0.8
    context.stroke()
  }

  const labelAnchor = project(-halfWidth, top, z - halfThickness)
  const label = `RECEIVER  R=${receiverDistance.toFixed(1)} m`
  context.font = '700 9px "SFMono-Regular", Consolas, monospace'
  const labelWidth = context.measureText(label).width + 14
  const labelX = Math.min(Math.max(8, labelAnchor.x + 6), width - labelWidth - 8)
  const labelY = Math.min(Math.max(18, labelAnchor.y - 23), height - 24)
  context.fillStyle = 'rgba(7, 21, 38, .82)'
  context.beginPath()
  context.roundRect(labelX, labelY, labelWidth, 18, 5)
  context.fill()
  context.strokeStyle = 'rgba(126, 229, 242, .55)'
  context.stroke()
  context.fillStyle = '#d9f9fc'
  context.fillText(label, labelX + 7, labelY + 12)
  context.restore()
}

function drawMeshSources(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  field: WaveField,
  camera: WaveCamera,
) {
  context.save()
  context.font = '600 10px "SFMono-Regular", Consolas, monospace'
  for (const source of field.sourcePositions) {
    const point = projectPoint(source.x, 0.3, source.z, field, camera, width, height)
    context.beginPath()
    context.arc(point.x, point.y, 5.5, 0, Math.PI * 2)
    context.fillStyle = '#fff1a6'
    context.shadowColor = '#ffd96b'
    context.shadowBlur = 15
    context.fill()
    context.shadowBlur = 0
    context.fillStyle = 'rgba(255,241,166,.9)'
    context.fillText('S', point.x + 9, point.y - 8)
  }
  context.restore()
}

interface WaveRenderCache {
  values: Float32Array
  pointX: Float32Array
  pointY: Float32Array
  cellDepth: Float32Array
  cellOrder: number[]
  lastYaw: number
  lastPitch: number
}

interface BarrierSegment {
  from: ProjectedPoint
  to: ProjectedPoint
  depth: number
}

const renderCaches = new WeakMap<WaveField, WaveRenderCache>()

function getRenderCache(field: WaveField) {
  const existing = renderCaches.get(field)
  if (existing) return existing
  const cellCount = (field.columns - 1) * (field.rows - 1)
  const cache: WaveRenderCache = {
    values: new Float32Array(field.real.length),
    pointX: new Float32Array(field.real.length),
    pointY: new Float32Array(field.real.length),
    cellDepth: new Float32Array(cellCount),
    cellOrder: Array.from({ length: cellCount }, (_, index) => index),
    lastYaw: Number.NaN,
    lastPitch: Number.NaN,
  }
  renderCaches.set(field, cache)
  return cache
}

function buildBarrierSegments(
  field: WaveField,
  camera: WaveCamera,
  width: number,
  height: number,
) {
  if (field.barrierZ == null) return []
  const solidRanges: Array<[number, number]> = []
  let cursor = -field.width / 2
  for (const aperture of field.apertures) {
    solidRanges.push([cursor, aperture.start])
    cursor = aperture.end
  }
  solidRanges.push([cursor, field.width / 2])
  const segments: BarrierSegment[] = []
  const targetLength = field.width / 42
  for (const [start, end] of solidRanges) {
    const count = Math.max(1, Math.ceil((end - start) / targetLength))
    for (let index = 0; index < count; index += 1) {
      const fromX = start + ((end - start) * index) / count
      const toX = start + ((end - start) * (index + 1)) / count
      const from = projectPoint(fromX, 0.18, field.barrierZ, field, camera, width, height)
      const to = projectPoint(toX, 0.18, field.barrierZ, field, camera, width, height)
      segments.push({ from, to, depth: (from.depth + to.depth) / 2 })
    }
  }
  segments.sort((a, b) => b.depth - a.depth)
  return segments
}

function strokeBarrierSegment(context: CanvasRenderingContext2D, segment: BarrierSegment) {
  context.globalAlpha = 1
  context.strokeStyle = 'rgba(239, 244, 255, .9)'
  context.lineWidth = 4
  context.shadowColor = 'rgba(102, 232, 255, .28)'
  context.shadowBlur = 10
  context.beginPath()
  context.moveTo(segment.from.x, segment.from.y)
  context.lineTo(segment.to.x, segment.to.y)
  context.stroke()
  context.shadowBlur = 0
}

function drawMesh(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  field: WaveField,
  values: Float32Array,
  theme: WaveColorTheme,
  camera: WaveCamera,
  cache: WaveRenderCache,
) {
  const verticalScale = Math.min(field.width, field.depth) * 0.12
  const cosYaw = Math.cos(camera.yaw)
  const sinYaw = Math.sin(camera.yaw)
  const cosPitch = Math.cos(camera.pitch)
  const sinPitch = Math.sin(camera.pitch)
  const baseScale = Math.min(width / field.width, height / field.depth) * 0.78 * camera.zoom
  for (let index = 0; index < values.length; index += 1) {
    const x = field.x[index]
    const y = values[index] * verticalScale
    const z = field.z[index] - field.depth / 2
    const rotatedX = cosYaw * x - sinYaw * z
    const yawDepth = sinYaw * x + cosYaw * z
    const rotatedY = cosPitch * y - sinPitch * yawDepth
    const depth = sinPitch * y + cosPitch * yawDepth
    const perspective = clamp(1 / (1 + depth / 34), 0.48, 1.9)
    cache.pointX[index] = width / 2 + camera.panX + rotatedX * baseScale * perspective
    cache.pointY[index] = height * 0.53 + camera.panY - rotatedY * baseScale * perspective
  }

  if (cache.lastYaw !== camera.yaw || cache.lastPitch !== camera.pitch) {
    for (let row = 0; row < field.rows - 1; row += 1) {
      for (let column = 0; column < field.columns - 1; column += 1) {
        const ordinal = row * (field.columns - 1) + column
        const index = row * field.columns + column
        let depth = 0
        for (const pointIndex of [index, index + 1, index + field.columns, index + field.columns + 1]) {
          const x = field.x[pointIndex]
          const z = field.z[pointIndex] - field.depth / 2
          depth += cosPitch * (sinYaw * x + cosYaw * z)
        }
        cache.cellDepth[ordinal] = depth / 4
      }
    }
    cache.cellOrder.sort((a, b) => cache.cellDepth[b] - cache.cellDepth[a])
    cache.lastYaw = camera.yaw
    cache.lastPitch = camera.pitch
  }

  const barrierSegments = buildBarrierSegments(field, camera, width, height)
  let barrierIndex = 0

  context.save()
  context.lineJoin = 'round'
  for (const ordinal of cache.cellOrder) {
    while (barrierIndex < barrierSegments.length && barrierSegments[barrierIndex].depth >= cache.cellDepth[ordinal]) {
      strokeBarrierSegment(context, barrierSegments[barrierIndex])
      barrierIndex += 1
    }
    const row = Math.floor(ordinal / (field.columns - 1))
    const column = ordinal % (field.columns - 1)
    const index = row * field.columns + column
    const average = (values[index] + values[index + 1] + values[index + field.columns] + values[index + field.columns + 1]) / 4
    context.beginPath()
    context.moveTo(cache.pointX[index], cache.pointY[index])
    context.lineTo(cache.pointX[index + 1], cache.pointY[index + 1])
    context.lineTo(cache.pointX[index + field.columns + 1], cache.pointY[index + field.columns + 1])
    context.lineTo(cache.pointX[index + field.columns], cache.pointY[index + field.columns])
    context.closePath()
    context.shadowBlur = 0
    context.globalAlpha = 0.72
    context.fillStyle = palette(theme, average)
    context.fill()
    context.globalAlpha = theme === 'mono' ? 0.18 : 0.22
    context.strokeStyle = theme === 'mono' ? '#dbe7f4' : '#9beeff'
    context.lineWidth = 0.55
    context.stroke()
  }
  context.globalAlpha = 1
  while (barrierIndex < barrierSegments.length) {
    strokeBarrierSegment(context, barrierSegments[barrierIndex])
    barrierIndex += 1
  }
  context.globalAlpha = 1
  drawMeshSources(context, width, height, field, camera)
  context.restore()
}

export function renderWaveScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  field: WaveField,
  time: number,
  frequency: number,
  receiverDistance: number,
  displayMode: WaveDisplayMode,
  theme: WaveColorTheme,
  camera: WaveCamera,
) {
  drawBackdrop(context, width, height)
  const cache = getRenderCache(field)
  const values = cache.values
  for (let index = 0; index < values.length; index += 1) {
    const physicalDisplayScale = field.unitAmplitudeMagnitude * 0.5
    values[index] = clamp(sampleInstantaneousDisplacement(field, index, time, frequency) / physicalDisplayScale, -1, 1)
  }
  if (displayMode === 'projection') drawProjection(context, width, height, field, values, theme, camera, receiverDistance)
  else {
    drawMesh(context, width, height, field, values, theme, camera, cache)
    drawMeshReceiver(context, width, height, field, camera, receiverDistance)
  }
}
