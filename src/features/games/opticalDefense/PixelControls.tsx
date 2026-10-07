import type { SVGProps } from 'react'

// UI glyphs are drawn on a 12 px grid; all edges are square and all ink is neutral.
function glyph(path: string) {
  return function PixelControl(props: SVGProps<SVGSVGElement>) {
    return <svg {...props} className={`optical-defense__control-icon ${props.className ?? ''}`} viewBox="0 0 12 12" aria-hidden="true" shapeRendering="crispEdges">
      <path d={path} fill="currentColor" fillRule="evenodd" stroke="none" />
    </svg>
  }
}

export const Play = glyph('M3 1h2v1h2v2h2v1h2v2H9v1H7v2H5v1H3z')
export const Pause = glyph('M2 1h3v10H2zM7 1h3v10H7z')
export const X = glyph('M1 1h2v2h2v2h2V3h2V1h2v2H9v2H7v2h2v2h2v2H9V9H7V7H5v2H3v2H1V9h2V7h2V5H3V3H1z')
export const Plus = glyph('M5 1h2v4h4v2H7v4H5V7H1V5h4z')
export const Minus = glyph('M1 5h10v2H1z')
export const ChevronRight = glyph('M3 1h2v2h2v2h2v2H7v2H5v2H3V9h2V7h2V5H5V3H3z')
export const Check = glyph('M1 6h2v2h2V6h2V4h2V2h2v3H9v2H7v2H5v2H3V9H1z')
export const Zap = glyph('M6 0h4L7 5h4L4 12l1-5H1z')
export const Coins = glyph('M3 1h6v1h2v8H9v1H3v-1H1V2h2zM3 3v6h6V3zM5 4h2v4H5z')
export const HeartPulse = glyph('M1 2h3v1h4V2h3v5H9v2H7v2H5V9H3V7H1z')
export const Shield = glyph('M1 1h10v6H9v2H7v2H5V9H3V7H1zM3 3v3h1v2h2v1h1V8h1V6h1V3z')
export const Waves = glyph('M1 2h2v2h2V2h2v2h2V2h2v2H9v2H7V4H5v2H3V4H1zM1 7h2v2h2V7h2v2h2V7h2v2H9v2H7V9H5v2H3V9H1z')
export const BookOpen = glyph('M1 1h4v1h2V1h4v10H7v-1H5v1H1zM2 3v6h3V3zM7 3v6h3V3z')
export const HelpCircle = glyph('M3 1h6v1h2v8H9v1H3v-1H1V2h2zM3 3v6h6V3zM5 3h3v3H6v1H5V5h2V4H5zM5 8h2v1H5z')
export const Settings = glyph('M4 0h4v2h2v2h2v4h-2v2H8v2H4v-2H2V8H0V4h2V2h2zM4 4v4h4V4z')
export const SlidersHorizontal = glyph('M0 2h3V0h2v2h7v2H5v2H3V4H0zM0 8h7V6h2v2h3v2H9v2H7v-2H0z')
export const RefreshCw = glyph('M3 1h6v2h2V0h1v5H7V4h2V3H3v2H1V3h2zM1 7h4v1H3v1h6V7h2v2H9v2H3V9H1v3H0V7z')
export const RotateCw = glyph('M4 1h5v2h2V1h1v5H7V5h2V4H8V3H4v1H3v4h1v1h4v2H3V9H1V3h2V1z')
export const RotateCcw = RefreshCw
export const Layers3 = glyph('M4 1h4v1h2v1h2v1h-2v1H8v1H4V5H2V4H0V3h2V2h2zM0 6h2v1h2v1h4V7h2V6h2v2h-2v1H8v1H4V9H2V8H0z')
export const ListFilter = glyph('M1 1h10v2H1zM2 5h8v2H2zM4 9h4v2H4z')
export const Link2 = glyph('M0 2h5v2H2v4h3v2H0zM7 2h5v8H7V8h3V4H7zM4 5h4v2H4z')
export const BatteryCharging = glyph('M4 0h4v2h3v10H1V2h3zM3 4v6h6V4zM6 4h2L6 7h2l-3 3V7H4z')
export const Gauge = glyph('M3 1h6v2h2v6H9v2H3V9H1V3h2zM3 3v6h6V3zM5 5h2V4h2v2H7v2H5z')
export const Sparkles = glyph('M5 0h2v3h2v2h3v2H9v2H7v3H5V9H3V7H0V5h3V3h2zM5 5v2h2V5z')
export const Trash2 = glyph('M4 0h4v2h3v2H1V2h3zM2 5h8v7H2zM4 6v4h1V6zM7 6v4h1V6z')
export const Settings2 = SlidersHorizontal
export const Brush = glyph('M8 0h4v3h-2v2H8v2H6v2H4V7H3V5h2V3h2V1h1zM1 8h3v3H0V9h1z')
export const Eraser = glyph('M6 1h3v2h2v3H9v2H7v2H2V8H0V6h2V4h2V2h2zM3 5v2h2v2h2V7H5V5z')
export const Flag = glyph('M1 0h2v1h8v5H3v6H1zM4 2v2h5V2z')
export const Target = glyph('M4 0h4v2h2v2h2v4h-2v2H8v2H4v-2H2V8H0V4h2V2h2zM4 3v1H3v4h1v1h4V8h1V4H8V3zM5 5h2v2H5z')
export const Hexagon = Layers3
export const Triangle = glyph('M5 0h2v2h1v2h1v2h1v2h1v2h1v2H0v-2h1V8h1V6h1V4h1V2h1zM5 5v2H4v2h4V7H7V5z')
