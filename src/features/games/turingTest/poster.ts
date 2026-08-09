import QRCode from 'qrcode'

import type { AssessmentResult } from './scoring'

const POSTER_WIDTH = 1080
const POSTER_HEIGHT = 1920
export const TURING_TEST_PUBLIC_URL = 'https://tjyzphysics.github.io/games?game=turing'

export function getTuringTestUrl() {
  return TURING_TEST_PUBLIC_URL
}

export function createStartQrCode(startUrl: string, width = 220) {
  return QRCode.toDataURL(startUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width,
    color: { dark: '#07101fff', light: '#ffffffff' },
  })
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.arcTo(x + width, y, x + width, y + height, safeRadius)
  context.arcTo(x + width, y + height, x, y + height, safeRadius)
  context.arcTo(x, y + height, x, y, safeRadius)
  context.arcTo(x, y, x + width, y, safeRadius)
  context.closePath()
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const characters = [...text]
  const lines: string[] = []
  let currentLine = ''

  for (const character of characters) {
    const candidate = currentLine + character
    if (currentLine && context.measureText(candidate).width > maxWidth) {
      lines.push(currentLine)
      currentLine = character
      if (lines.length === maxLines - 1) break
    } else {
      currentLine = candidate
    }
  }
  if (currentLine && lines.length < maxLines) lines.push(currentLine)
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight))
  return y + lines.length * lineHeight
}

function polarPoint(centerX: number, centerY: number, radius: number, index: number, count: number) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count
  return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius }
}

function drawRadar(context: CanvasRenderingContext2D, result: AssessmentResult, accent: string) {
  const centerX = 540
  const centerY = 1010
  const radius = 250
  const count = result.dimensions.length

  context.lineWidth = 2
  for (let ring = 1; ring <= 4; ring += 1) {
    context.beginPath()
    for (let index = 0; index < count; index += 1) {
      const point = polarPoint(centerX, centerY, radius * (ring / 4), index, count)
      if (index === 0) context.moveTo(point.x, point.y)
      else context.lineTo(point.x, point.y)
    }
    context.closePath()
    context.strokeStyle = `rgba(167, 190, 222, ${ring === 4 ? 0.22 : 0.11})`
    context.stroke()
  }

  result.dimensions.forEach((_, index) => {
    const point = polarPoint(centerX, centerY, radius, index, count)
    context.beginPath()
    context.moveTo(centerX, centerY)
    context.lineTo(point.x, point.y)
    context.strokeStyle = 'rgba(167, 190, 222, 0.13)'
    context.stroke()
  })

  const fill = context.createRadialGradient(centerX, centerY, 20, centerX, centerY, radius)
  fill.addColorStop(0, 'rgba(103, 126, 255, 0.3)')
  fill.addColorStop(1, `${accent}70`)
  context.beginPath()
  result.dimensions.forEach((dimension, index) => {
    const point = polarPoint(centerX, centerY, radius * (dimension.value / 100), index, count)
    if (index === 0) context.moveTo(point.x, point.y)
    else context.lineTo(point.x, point.y)
  })
  context.closePath()
  context.fillStyle = fill
  context.fill()
  context.strokeStyle = accent
  context.lineWidth = 5
  context.stroke()

  result.dimensions.forEach((dimension, index) => {
    const point = polarPoint(centerX, centerY, radius * (dimension.value / 100), index, count)
    context.beginPath()
    context.arc(point.x, point.y, 9, 0, Math.PI * 2)
    context.fillStyle = '#f7fbff'
    context.fill()
    context.strokeStyle = accent
    context.lineWidth = 5
    context.stroke()

    const labelPoint = polarPoint(centerX, centerY, radius + 69, index, count)
    context.textAlign = labelPoint.x < centerX - 20 ? 'right' : labelPoint.x > centerX + 20 ? 'left' : 'center'
    context.fillStyle = '#eef4ff'
    context.font = '700 27px "Noto Sans SC", sans-serif'
    context.fillText(dimension.label, labelPoint.x, labelPoint.y)
    context.fillStyle = '#8f9db6'
    context.font = '500 20px "Noto Sans SC", sans-serif'
    context.fillText(`${dimension.leaning} ${dimension.value}`, labelPoint.x, labelPoint.y + 32)
  })
  context.textAlign = 'left'
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to render the QR code.'))
    image.src = source
  })
}

function accentFor(result: AssessmentResult) {
  if (result.profile.kind === 'turing') return '#59e1ff'
  if (result.profile.kind === 'von-neumann') return '#ffb65e'
  return '#a895ff'
}

export async function renderTuringPoster(result: AssessmentResult, startUrl: string) {
  await document.fonts?.ready
  const canvas = document.createElement('canvas')
  canvas.width = POSTER_WIDTH
  canvas.height = POSTER_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is not supported in this browser.')

  const accent = accentFor(result)
  const background = context.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT)
  background.addColorStop(0, '#070b18')
  background.addColorStop(0.48, '#10172b')
  background.addColorStop(1, '#080b19')
  context.fillStyle = background
  context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  context.strokeStyle = 'rgba(139, 173, 224, 0.075)'
  context.lineWidth = 1
  for (let x = 0; x <= POSTER_WIDTH; x += 54) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, POSTER_HEIGHT)
    context.stroke()
  }
  for (let y = 0; y <= POSTER_HEIGHT; y += 54) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(POSTER_WIDTH, y)
    context.stroke()
  }

  const glow = context.createRadialGradient(850, 160, 10, 850, 160, 470)
  glow.addColorStop(0, `${accent}38`)
  glow.addColorStop(1, `${accent}00`)
  context.fillStyle = glow
  context.fillRect(300, 0, 780, 650)

  context.fillStyle = accent
  context.font = '700 23px "Space Grotesk", "Noto Sans SC", sans-serif'
  context.fillText('TJYZ PHYSICS CLUB / PERSONALITY SIGNAL', 82, 105)
  context.fillStyle = '#8290a9'
  context.font = '500 24px "Noto Sans SC", sans-serif'
  context.fillText('图灵与冯诺依曼的神奇测试', 82, 155)

  context.fillStyle = '#f5f8ff'
  context.font = '800 86px "Noto Sans SC", sans-serif'
  context.fillText(result.profile.label, 82, 285)
  context.fillStyle = accent
  context.font = '800 49px "Noto Sans SC", sans-serif'
  context.fillText(result.profile.title, 82, 359)
  context.fillStyle = '#aab5ca'
  context.font = '400 29px "Noto Sans SC", sans-serif'
  drawWrappedText(context, result.profile.tagline, 82, 422, 800, 45, 2)

  context.textAlign = 'right'
  context.fillStyle = '#f7fbff'
  context.font = '800 146px "Space Grotesk", sans-serif'
  context.fillText(String(result.overall), 994, 340)
  context.fillStyle = '#8a98b1'
  context.font = '600 22px "Noto Sans SC", sans-serif'
  context.fillText('图灵倾向值 / 100', 988, 382)
  context.textAlign = 'left'

  const spectrumX = 90
  const spectrumY = 525
  const spectrumWidth = 900
  const spectrum = context.createLinearGradient(spectrumX, 0, spectrumX + spectrumWidth, 0)
  spectrum.addColorStop(0, '#ffb65e')
  spectrum.addColorStop(0.5, '#a895ff')
  spectrum.addColorStop(1, '#59e1ff')
  roundedRect(context, spectrumX, spectrumY, spectrumWidth, 18, 9)
  context.fillStyle = spectrum
  context.fill()
  const markerX = spectrumX + spectrumWidth * (result.overall / 100)
  context.beginPath()
  context.arc(markerX, spectrumY + 9, 19, 0, Math.PI * 2)
  context.fillStyle = '#f8fbff'
  context.fill()
  context.strokeStyle = '#07101f'
  context.lineWidth = 7
  context.stroke()
  context.fillStyle = '#8f9db4'
  context.font = '600 22px "Noto Sans SC", sans-serif'
  context.fillText('冯诺依曼侧', spectrumX, spectrumY + 57)
  context.textAlign = 'right'
  context.fillText('图灵侧', spectrumX + spectrumWidth, spectrumY + 57)
  context.textAlign = 'left'

  context.fillStyle = '#6f7d97'
  context.font = '600 20px "Noto Sans SC", sans-serif'
  context.fillText('中心靠近冯诺依曼侧，外缘靠近图灵侧', 82, 680)
  drawRadar(context, result, accent)

  context.fillStyle = '#eef4ff'
  context.font = '800 31px "Noto Sans SC", sans-serif'
  context.fillText('六维倾向', 82, 1365)

  result.dimensions.forEach((dimension, index) => {
    const y = 1408 + index * 51
    const barWidth = 460
    context.fillStyle = '#d8e1f1'
    context.font = '600 23px "Noto Sans SC", sans-serif'
    context.fillText(dimension.label, 82, y)
    context.fillStyle = '#687791'
    roundedRect(context, 225, y - 15, barWidth, 12, 6)
    context.fill()
    const bar = context.createLinearGradient(225, 0, 225 + barWidth, 0)
    bar.addColorStop(0, '#ffb65e')
    bar.addColorStop(1, '#59e1ff')
    roundedRect(context, 225, y - 15, barWidth * (dimension.value / 100), 12, 6)
    context.fillStyle = bar
    context.fill()
    context.beginPath()
    context.arc(225 + barWidth * (dimension.value / 100), y - 9, 10, 0, Math.PI * 2)
    context.fillStyle = '#f7fbff'
    context.fill()
    context.fillStyle = '#aab7cc'
    context.font = '600 20px "Noto Sans SC", sans-serif'
    context.textAlign = 'right'
    context.fillText(`${dimension.leaning} · ${dimension.value}`, 790, y)
    context.textAlign = 'left'
  })

  // Keep the share QR in its own footer strip so it cannot compete with the
  // dimension values above, even when labels or scores are longer.
  context.strokeStyle = 'rgba(166, 190, 224, 0.16)'
  context.beginPath()
  context.moveTo(82, 1692)
  context.lineTo(998, 1692)
  context.stroke()

  const qrDataUrl = await createStartQrCode(startUrl, 156)
  const qrImage = await loadImage(qrDataUrl)
  roundedRect(context, 82, 1720, 160, 160, 16)
  context.fillStyle = '#ffffff'
  context.fill()
  context.drawImage(qrImage, 84, 1722, 156, 156)
  context.fillStyle = '#eef4ff'
  context.font = '700 28px "Noto Sans SC", sans-serif'
  context.textAlign = 'left'
  context.fillText('扫码测测你的派系', 285, 1770)
  context.fillStyle = '#7f8ca4'
  context.font = '500 19px "Space Grotesk", sans-serif'
  context.fillText('TJYZPHYSICS.GITHUB.IO', 285, 1810)

  context.strokeStyle = 'rgba(166, 190, 224, 0.16)'
  context.beginPath()
  context.moveTo(82, 1888)
  context.lineTo(998, 1888)
  context.stroke()
  context.fillStyle = '#8b98af'
  context.font = '500 20px "Noto Sans SC", sans-serif'
  context.fillText('网络人格趣味测评 · 结果只负责好玩，不负责定义你', 82, 1910)
  context.textAlign = 'right'
  context.fillStyle = accent
  context.fillText('GAMES AND SOMETHING UNBELIEVABLE', 998, 1910)

  return canvas
}

export async function createTuringPosterBlob(result: AssessmentResult, startUrl: string) {
  const canvas = await renderTuringPoster(result, startUrl)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Unable to encode the result poster.'))
    }, 'image/png')
  })
}
