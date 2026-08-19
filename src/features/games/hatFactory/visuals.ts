import type { HatName, HatSize } from './data'

export type HatShape = 'peaked' | 'fedora' | 'helmet' | 'crown' | 'wide' | 'bowler' | 'paper' | 'cap' | 'beanie'
export type HatMotif = 'star' | 'eye' | 'bars' | 'arrow' | 'mask' | 'wave' | 'megaphone' | 'weathervane' | 'footprint'

export type HatVisual = {
  shape: HatShape
  motif: HatMotif
  ink: string
  cloth: string
  trim: string
}

const LARGE_PALETTE = { ink: '#f5e9c9', cloth: '#6e1716', trim: '#d89b3c' }
const MEDIUM_PALETTE = { ink: '#e9e1c8', cloth: '#173d36', trim: '#b9513e' }
const SMALL_PALETTE = { ink: '#fbefd2', cloth: '#294b72', trim: '#e1853d' }

export const HAT_VISUALS: Record<HatName, HatVisual> = {
  叛徒: { ...LARGE_PALETTE, shape: 'peaked', motif: 'mask' },
  特务: { ...LARGE_PALETTE, shape: 'fedora', motif: 'eye' },
  大军阀: { ...LARGE_PALETTE, shape: 'peaked', motif: 'star' },
  反党分子: { ...LARGE_PALETTE, shape: 'helmet', motif: 'bars' },
  野心家: { ...LARGE_PALETTE, shape: 'crown', motif: 'arrow' },
  走资派: { ...LARGE_PALETTE, shape: 'wide', motif: 'arrow' },
  投降派: { ...LARGE_PALETTE, shape: 'paper', motif: 'wave' },
  修正主义: { ...LARGE_PALETTE, shape: 'bowler', motif: 'bars' },
  大恶霸: { ...LARGE_PALETTE, shape: 'helmet', motif: 'star' },
  黑线人物: { ...MEDIUM_PALETTE, shape: 'fedora', motif: 'wave' },
  不革命: { ...MEDIUM_PALETTE, shape: 'beanie', motif: 'bars' },
  黑秀才: { ...MEDIUM_PALETTE, shape: 'paper', motif: 'eye' },
  黑手: { ...MEDIUM_PALETTE, shape: 'cap', motif: 'footprint' },
  黑帮凶: { ...MEDIUM_PALETTE, shape: 'peaked', motif: 'star' },
  经验主义: { ...MEDIUM_PALETTE, shape: 'bowler', motif: 'bars' },
  民主派: { ...MEDIUM_PALETTE, shape: 'wide', motif: 'megaphone' },
  中庸之道: { ...MEDIUM_PALETTE, shape: 'bowler', motif: 'wave' },
  变色龙: { ...MEDIUM_PALETTE, shape: 'cap', motif: 'weathervane' },
  绊脚石: { ...SMALL_PALETTE, shape: 'helmet', motif: 'footprint' },
  墙头草: { ...SMALL_PALETTE, shape: 'beanie', motif: 'weathervane' },
  老好人: { ...SMALL_PALETTE, shape: 'bowler', motif: 'wave' },
  小修苗: { ...SMALL_PALETTE, shape: 'beanie', motif: 'arrow' },
  造谣公司: { ...SMALL_PALETTE, shape: 'paper', motif: 'megaphone' },
  传话筒: { ...SMALL_PALETTE, shape: 'cap', motif: 'megaphone' },
  逆流: { ...SMALL_PALETTE, shape: 'wide', motif: 'arrow' },
  邪风: { ...SMALL_PALETTE, shape: 'fedora', motif: 'wave' },
  小爬虫: { ...SMALL_PALETTE, shape: 'beanie', motif: 'footprint' },
}

export const SIZE_PREVIEW_HATS: Record<HatSize, HatName> = {
  large: '走资派',
  medium: '黑秀才',
  small: '墙头草',
}

export function getHatVisual(name: HatName) {
  return HAT_VISUALS[name]
}
