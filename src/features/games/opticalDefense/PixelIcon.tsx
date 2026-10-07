import { DEVICE_SPRITES, ENEMY_SPRITES, CORE_SPRITE, PIXEL_INK, pixelRuns, sourceAccent } from './pixelArt'
import type { DeviceKind, EnemyKind } from './types'

export function DevicePixelIcon({ kind }: { kind: DeviceKind }) {
  return <PixelSprite rows={DEVICE_SPRITES[kind]} accent={sourceAccent(kind)} />
}

export function EnemyPixelIcon({ kind }: { kind: EnemyKind }) {
  return <PixelSprite rows={ENEMY_SPRITES[kind]} accent="#eeeeee" />
}

export function CorePixelIcon() {
  return <PixelSprite rows={CORE_SPRITE} accent="#ffffff" />
}

function PixelSprite({ rows, accent }: { rows: readonly string[]; accent: string }) {
  const paths = new Map<string, string>()
  pixelRuns(rows).forEach(({ x, y, width, ink }) => {
    paths.set(ink, (paths.get(ink) ?? '') + `M${x} ${y}h${width}v1h-${width}z`)
  })
  return <svg className="optical-defense__pixel-icon" viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
    {[...paths].map(([ink, d]) => <path key={ink} d={d} fill={ink === 'c' ? accent : PIXEL_INK[ink as keyof typeof PIXEL_INK]} />)}
  </svg>
}
