import { useId } from 'react'

import type { HatName } from './data'
import { getHatVisual, type HatMotif, type HatShape } from './visuals'

type HatIllustrationProps = {
  name: HatName
  className?: string
  labelled?: boolean
}

function Shape({ shape }: { shape: HatShape }) {
  if (shape === 'peaked') return <><path d="M78 140 94 72q66-34 132 0l16 68Z" /><path d="M58 145q104-30 204 0-14 25-62 27H98q-30-4-40-27Z" /></>
  if (shape === 'fedora') return <><path d="M84 139 103 66q57-29 114 0l19 73Z" /><path d="M103 102q57 24 114 0" className="hf-hat-art__seam" /><path d="M42 145q118-31 236 0-16 28-118 27Q58 173 42 145Z" /></>
  if (shape === 'helmet') return <><path d="M72 144q7-92 88-92t88 92Z" /><path d="M50 146h220q-5 30-36 30H86q-31 0-36-30Z" /><path d="M160 55v88" className="hf-hat-art__seam" /></>
  if (shape === 'crown') return <><path d="m72 143 10-79 48 43 30-64 32 64 47-43 9 79Z" /><path d="M62 142h196v34H62Z" /></>
  if (shape === 'wide') return <><path d="M91 141 106 63q54-24 108 0l15 78Z" /><path d="M29 146q131-31 262 0-21 32-131 31Q50 178 29 146Z" /></>
  if (shape === 'bowler') return <><path d="M83 142q4-83 77-83t77 83Z" /><path d="M51 145q109-19 218 0-11 30-109 30T51 145Z" /></>
  if (shape === 'paper') return <><path d="m66 145 29-87 65 43 65-43 29 87Z" /><path d="m95 58 17 83m113-83-17 83" className="hf-hat-art__seam" /><path d="M55 143h210v31H55Z" /></>
  if (shape === 'cap') return <><path d="M76 143q8-80 82-80 67 0 83 72Z" /><path d="M149 138q74-20 129 15-31 26-128 20Z" /></>
  return <><path d="M85 143q4-78 75-78t75 78Z" /><path d="M74 137h172v39H74Z" /><path d="M110 78q50 20 100 0" className="hf-hat-art__seam" /></>
}

function Motif({ motif }: { motif: HatMotif }) {
  if (motif === 'star') return <path d="m160 83 9 19 21 3-15 15 4 21-19-10-19 10 4-21-15-15 21-3Z" />
  if (motif === 'eye') return <><path d="M126 114q34-31 68 0-34 31-68 0Z" /><circle cx="160" cy="114" r="8" /></>
  if (motif === 'bars') return <><path d="M126 91v45m22-53v55m23-55v55m22-47v45" /><path d="M118 104h84" /></>
  if (motif === 'arrow') return <path d="m126 129 49-49 1 21 24-1-49 49-1-21Z" />
  if (motif === 'mask') return <path d="M119 96q41 13 82 0l-11 35q-30 22-60 0Zm18 18 15 3m19-3 14-4" />
  if (motif === 'wave') return <path d="M118 107q18-19 36 0t36 0m-72 22q18-19 36 0t36 0" />
  if (motif === 'megaphone') return <><path d="m124 111 51-23v52l-51-20Z" /><path d="m132 122 8 25h19l-5-19" /></>
  if (motif === 'weathervane') return <><path d="M160 80v66m-31-45h66l-18-14m18 14-18 14" /><path d="m160 76-7 13h14Z" /></>
  return <><path d="M136 99q10 0 13 12t-8 19q-11 6-18-5t-1-20q5-6 14-6Zm43 17q11 0 15 11t-5 20q-10 8-19-1t-5-19q3-8 14-11Z" /><circle cx="125" cy="94" r="4" /><circle cx="136" cy="91" r="4" /><circle cx="177" cy="109" r="4" /><circle cx="188" cy="111" r="4" /></>
}

export function HatIllustration({ name, className = '', labelled = false }: HatIllustrationProps) {
  const visual = getHatVisual(name)
  const gradientId = `hf-hat-${useId().replace(/:/g, '')}`

  return (
    <svg
      className={`hf-hat-art ${className}`}
      viewBox="0 0 320 240"
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? `${name}帽子插画` : undefined}
      aria-hidden={labelled ? undefined : 'true'}
      style={{ '--hat-ink': visual.ink, '--hat-cloth': visual.cloth, '--hat-trim': visual.trim } as React.CSSProperties}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--hat-trim)" />
          <stop offset=".35" stopColor="var(--hat-cloth)" />
          <stop offset="1" stopColor="color-mix(in srgb, var(--hat-cloth) 72%, #050607)" />
        </linearGradient>
      </defs>
      <g className="hf-hat-art__shadow"><ellipse cx="160" cy="185" rx="113" ry="17" /></g>
      <g className="hf-hat-art__body" fill={`url(#${gradientId})`}><Shape shape={visual.shape} /></g>
      <g className="hf-hat-art__motif"><Motif motif={visual.motif} /></g>
      <path className="hf-hat-art__highlight" d="M92 139q14-58 55-69" />
      {labelled && <text x="160" y="216" textAnchor="middle">{name}</text>}
    </svg>
  )
}

export default HatIllustration
