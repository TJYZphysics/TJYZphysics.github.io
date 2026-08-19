import QRCode from 'qrcode'

import type { HatName, HatSize } from './data'
import { getHatVisual, type HatShape } from './visuals'

export const HAT_FACTORY_PUBLIC_URL = 'https://tjyzphysics.github.io/games?game=hat-factory'

export type HatPosterStyle = 'archive' | 'comic'

export type HatPosterResult = {
  name: HatName
  size: HatSize
  sizeLabel: string
  tagline: string
  description: string
}

export function getHatFactoryUrl() {
  return HAT_FACTORY_PUBLIC_URL
}

export function createStartQrCode(url = HAT_FACTORY_PUBLIC_URL, width = 190) {
  return QRCode.toDataURL(url, {
    width,
    margin: 1,
    color: { dark: '#171713', light: '#fffaf0' },
    errorCorrectionLevel: 'M',
  })
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = source
  })
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas export returned no data.'))
    }, 'image/png')
  })
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

function fitFont(context: CanvasRenderingContext2D, text: string, maxWidth: number, startingSize: number, font: string) {
  let size = startingSize
  do {
    context.font = `900 ${size}px ${font}`
    if (context.measureText(text).width <= maxWidth) return size
    size -= 2
  } while (size > 34)
  return size
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  let line = ''
  for (const character of text) {
    const candidate = line + character
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = character
    } else line = candidate
  }
  if (line) lines.push(line)
  return lines
}

function fitWrappedText(context: CanvasRenderingContext2D, text: string, maxWidth: number, startingSize: number, font: string, maxLines: number) {
  let size = startingSize
  let lines: string[] = []
  do {
    context.font = `900 ${size}px ${font}`
    lines = wrapText(context, text, maxWidth)
    if (lines.length <= maxLines) return { size, lines }
    size -= 2
  } while (size > 22)
  return { size, lines: lines.slice(0, maxLines) }
}

function drawHatShape(context: CanvasRenderingContext2D, shape: HatShape) {
  context.beginPath()
  if (shape === 'peaked') {
    context.moveTo(-172, 90); context.quadraticCurveTo(-140, -150, 0, -164); context.quadraticCurveTo(140, -150, 172, 90); context.closePath()
  } else if (shape === 'fedora') {
    context.moveTo(-142, 86); context.lineTo(-104, -116); context.quadraticCurveTo(0, -180, 104, -116); context.lineTo(142, 86); context.closePath()
  } else if (shape === 'helmet') {
    context.moveTo(-175, 90); context.quadraticCurveTo(-152, -172, 0, -172); context.quadraticCurveTo(152, -172, 175, 90); context.closePath()
  } else if (shape === 'crown') {
    context.moveTo(-165, 90); context.lineTo(-146, -124); context.lineTo(-72, -37); context.lineTo(0, -172); context.lineTo(72, -37); context.lineTo(146, -124); context.lineTo(165, 90); context.closePath()
  } else if (shape === 'wide') {
    context.moveTo(-132, 88); context.lineTo(-98, -126); context.quadraticCurveTo(0, -172, 98, -126); context.lineTo(132, 88); context.closePath()
  } else if (shape === 'bowler') {
    context.moveTo(-150, 88); context.quadraticCurveTo(-145, -158, 0, -158); context.quadraticCurveTo(145, -158, 150, 88); context.closePath()
  } else if (shape === 'paper') {
    context.moveTo(-168, 88); context.lineTo(-112, -142); context.lineTo(0, -32); context.lineTo(112, -142); context.lineTo(168, 88); context.closePath()
  } else if (shape === 'cap') {
    context.moveTo(-158, 88); context.quadraticCurveTo(-145, -150, -2, -150); context.quadraticCurveTo(126, -150, 158, 72); context.closePath()
  } else {
    context.moveTo(-146, 88); context.quadraticCurveTo(-140, -151, 0, -151); context.quadraticCurveTo(140, -151, 146, 88); context.closePath()
  }
}

function drawHat(context: CanvasRenderingContext2D, result: HatPosterResult, style: HatPosterStyle) {
  const visual = getHatVisual(result.name)
  context.save()
  context.translate(540, 773)
  const scale = result.size === 'large' ? 1.25 : result.size === 'medium' ? 1.08 : .92
  context.scale(scale, scale)

  context.save()
  context.translate(0, 123)
  context.scale(1, .2)
  context.fillStyle = style === 'archive' ? 'rgba(0,0,0,.48)' : 'rgba(31,38,46,.2)'
  context.beginPath(); context.ellipse(0, 0, 250, 78, 0, 0, Math.PI * 2); context.fill()
  context.restore()

  const gradient = context.createLinearGradient(-170, -170, 180, 115)
  gradient.addColorStop(0, visual.trim)
  gradient.addColorStop(.38, visual.cloth)
  gradient.addColorStop(1, style === 'archive' ? '#130d0c' : '#2b3035')
  drawHatShape(context, visual.shape)
  context.fillStyle = gradient
  context.strokeStyle = style === 'archive' ? '#eddfbd' : '#171713'
  context.lineWidth = style === 'archive' ? 7 : 11
  context.lineJoin = 'round'
  context.fill(); context.stroke()

  context.beginPath()
  if (visual.shape === 'wide') context.ellipse(0, 91, 268, 45, 0, 0, Math.PI * 2)
  else if (visual.shape === 'cap') {
    context.moveTo(-20, 69); context.quadraticCurveTo(145, 17, 250, 96); context.quadraticCurveTo(118, 151, -35, 102); context.closePath()
  } else context.ellipse(0, 91, visual.shape === 'helmet' ? 206 : 218, 39, 0, 0, Math.PI * 2)
  context.fillStyle = visual.cloth
  context.strokeStyle = style === 'archive' ? '#eddfbd' : '#171713'
  context.lineWidth = style === 'archive' ? 7 : 11
  context.fill(); context.stroke()

  roundedRect(context, -142, -18, 284, 70, 10)
  context.fillStyle = style === 'archive' ? '#e7d7b2' : '#fff5d7'
  context.strokeStyle = style === 'archive' ? '#6c1715' : '#171713'
  context.lineWidth = 6
  context.fill(); context.stroke()
  context.fillStyle = '#171713'
  fitFont(context, result.name, 250, 48, '"Noto Sans SC", sans-serif')
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(result.name, 0, 17)

  const motifSymbols = { star: '★', eye: '◉', bars: '///', arrow: '↗', mask: '◇', wave: '≈', megaphone: '》', weathervane: '↔', footprint: '•••' } as const
  context.font = '900 45px "Arial Black", sans-serif'
  context.fillStyle = visual.trim
  context.strokeStyle = '#171713'
  context.lineWidth = 4
  context.strokeText(motifSymbols[visual.motif], 0, -72)
  context.fillText(motifSymbols[visual.motif], 0, -72)
  context.restore()
}

function drawPaperTexture(context: CanvasRenderingContext2D, style: HatPosterStyle) {
  context.save()
  context.globalAlpha = style === 'archive' ? .16 : .09
  context.strokeStyle = style === 'archive' ? '#d2bd8e' : '#1f4a7a'
  for (let y = 0; y < 1920; y += 31) {
    context.beginPath(); context.moveTo(0, y + (y % 9)); context.lineTo(1080, y); context.stroke()
  }
  context.fillStyle = style === 'archive' ? '#f1dec0' : '#df6239'
  for (let index = 0; index < 150; index += 1) {
    const x = (index * 83) % 1080
    const y = (index * 149) % 1920
    context.fillRect(x, y, index % 3 === 0 ? 3 : 1, index % 4 === 0 ? 3 : 1)
  }
  context.restore()
}

export async function createHatFactoryPosterBlob(result: HatPosterResult, style: HatPosterStyle, url = HAT_FACTORY_PUBLIC_URL) {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1920
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable.')

  const archive = style === 'archive'
  context.fillStyle = archive ? '#10211b' : '#f7f0dc'
  context.fillRect(0, 0, canvas.width, canvas.height)
  drawPaperTexture(context, style)

  context.strokeStyle = archive ? '#cfbd91' : '#171713'
  context.lineWidth = archive ? 3 : 8
  context.strokeRect(52, 52, 976, 1816)
  context.strokeRect(68, 68, 944, 1784)

  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillStyle = archive ? '#e8d9b8' : '#171713'
  context.font = '700 28px "Arial", sans-serif'
  context.fillText('TJYZ PHYSICS CLUB / HAT FACTORY', 98, 135)
  context.font = '900 83px "Noto Sans SC", sans-serif'
  context.fillText('帽子工厂', 94, 238)
  context.font = '700 27px "Noto Sans SC", sans-serif'
  context.fillStyle = archive ? '#b8b493' : '#355b7e'
  context.fillText('生活作风鉴定及定制生产凭证', 98, 286)

  roundedRect(context, 790, 102, 190, 92, archive ? 3 : 16)
  context.fillStyle = archive ? '#741e1c' : '#e7663c'
  context.fill()
  context.fillStyle = '#fff6de'
  context.textAlign = 'center'
  context.font = '900 24px "Noto Sans SC", sans-serif'
  context.fillText(result.sizeLabel, 885, 144)
  context.font = '700 17px "Arial", sans-serif'
  context.fillText('FACTORY SIZE', 885, 174)

  context.textAlign = 'left'
  context.fillStyle = archive ? '#b8b493' : '#355b7e'
  context.font = '700 21px "Arial", sans-serif'
  context.fillText('CERTIFICATE NO. HF-20-027', 98, 361)
  context.textAlign = 'right'
  context.fillText('QUALITY CONTROL: ABSURDLY STRICT', 982, 361)
  context.textAlign = 'left'
  context.strokeStyle = archive ? '#756f59' : '#171713'
  context.lineWidth = 3
  context.beginPath(); context.moveTo(98, 390); context.lineTo(982, 390); context.stroke()

  drawHat(context, result, style)

  context.textAlign = 'center'
  context.fillStyle = archive ? '#b8b493' : '#355b7e'
  context.font = '800 24px "Noto Sans SC", sans-serif'
  context.fillText('本厂建议为你生产', 540, 1070)
  context.fillStyle = archive ? '#f0dfba' : '#171713'
  fitFont(context, result.name, 820, 124, '"Noto Sans SC", sans-serif')
  context.fillText(result.name, 540, 1205)
  context.fillStyle = archive ? '#c95645' : '#e05c37'
  const tagline = fitWrappedText(context, `「${result.tagline}」`, 820, 34, '"Noto Sans SC", sans-serif', 2)
  context.font = `900 ${tagline.size}px "Noto Sans SC", sans-serif`
  const taglineStartY = tagline.lines.length === 1 ? 1272 : 1248
  tagline.lines.forEach((line, index) => context.fillText(line, 540, taglineStartY + index * 38))

  roundedRect(context, 100, 1325, 880, 270, archive ? 4 : 26)
  context.fillStyle = archive ? 'rgba(232,217,184,.07)' : '#fffaf0'
  context.strokeStyle = archive ? '#756f59' : '#171713'
  context.lineWidth = archive ? 2 : 6
  context.fill(); context.stroke()
  context.textAlign = 'left'
  context.fillStyle = archive ? '#c9bd9f' : '#355b7e'
  context.font = '800 23px "Noto Sans SC", sans-serif'
  context.fillText('出厂评语', 138, 1381)
  context.fillStyle = archive ? '#eadcbb' : '#25241f'
  context.font = '600 30px "Noto Sans SC", sans-serif'
  const descriptionLines = wrapText(context, result.description, 790).slice(0, 4)
  descriptionLines.forEach((line, index) => context.fillText(line, 138, 1442 + index * 43))

  if (archive) {
    context.save()
    context.translate(855, 1642)
    context.rotate(-.16)
    context.strokeStyle = '#a9322c'
    context.lineWidth = 7
    context.beginPath(); context.ellipse(0, 0, 92, 42, 0, 0, Math.PI * 2); context.stroke()
    context.font = '900 27px "Noto Sans SC", sans-serif'
    context.fillStyle = '#a9322c'
    context.textAlign = 'center'; context.textBaseline = 'middle'
    context.fillText('鉴定完毕', 0, 0)
    context.restore()
  } else {
    context.save()
    context.translate(855, 1642)
    context.rotate(.09)
    context.fillStyle = '#f2bd39'
    context.strokeStyle = '#171713'
    context.lineWidth = 6
    roundedRect(context, -101, -34, 202, 68, 14); context.fill(); context.stroke()
    context.font = '900 25px "Noto Sans SC", sans-serif'
    context.fillStyle = '#171713'; context.textAlign = 'center'; context.textBaseline = 'middle'
    context.fillText('新鲜出炉!', 0, 0)
    context.restore()
  }

  const qrCode = await createStartQrCode(url, 220)
  const qrImage = await loadImage(qrCode)
  roundedRect(context, 100, 1650, 190, 190, archive ? 2 : 18)
  context.fillStyle = '#fffaf0'; context.fill()
  context.drawImage(qrImage, 111, 1661, 168, 168)
  context.textAlign = 'left'
  context.fillStyle = archive ? '#e8d9b8' : '#171713'
  context.font = '800 29px "Noto Sans SC", sans-serif'
  context.fillText('扫码进厂，看看朋友该戴哪顶', 326, 1714)
  context.fillStyle = archive ? '#9e9b83' : '#526b7a'
  context.font = '600 22px "Noto Sans SC", sans-serif'
  context.fillText('纯属历史戏仿 · 不构成现实人格鉴定', 326, 1762)
  context.font = '700 18px "Arial", sans-serif'
  context.fillText('GAMES AND SOMETHING UNBELIEVABLE', 326, 1814)

  return canvasToBlob(canvas)
}
