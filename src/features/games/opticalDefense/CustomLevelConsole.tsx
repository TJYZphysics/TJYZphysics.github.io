import { useEffect, useRef, useState } from 'react'
import { Plus, RotateCcw, Settings2, SlidersHorizontal, Trash2, X, Zap } from 'lucide-react'

import type { Tuning } from './tuning'
import type { CustomLevelConfig, CustomWaveSpec } from './customLevel'
import type { OpticalColorMode } from './colorMode'
import type { EnemyKind } from './types'

type ConsoleTab = 'basic' | 'advanced'

const ENEMY_KINDS: EnemyKind[] = ['normal', 'fast', 'armored', 'resistant', 'boss']
const KIND_LABELS: Record<EnemyKind, string> = { normal: '常规', fast: '高速', armored: '重甲', resistant: '抗性', boss: '首领' }

const newWave = (): CustomWaveSpec => ({
  delaySeconds: 2,
  totalCount: 12,
  distribution: { normal: 0.5, fast: 0.3, armored: 0.2, resistant: 0, boss: 0 },
  random: false,
  intervalSeconds: 0.75,
})

function setTuningPath(tuning: Tuning, path: string[], value: number): Tuning {
  const next = JSON.parse(JSON.stringify(tuning)) as Tuning
  let node: Record<string, unknown> = next as unknown as Record<string, unknown>
  path.slice(0, -1).forEach((key) => { node = node[key] as Record<string, unknown> })
  ;(node as unknown as Record<string, unknown>)[path.at(-1)!] = value
  return next
}

function NumberField({ label, value, onChange, min, max, step = 1, hint }: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  hint?: string
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => { setDraft(String(value)) }, [value])
  const commit = () => {
    const parsed = Number(draft)
    let next = Number.isFinite(parsed) ? parsed : value
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    onChange(next)
    setDraft(String(next))
  }
  return (
    <label className="optical-defense__number-field">
      <span>{label}{hint ? <small>{hint}</small> : null}</span>
      <input type="number" value={draft} min={min} max={max} step={step}
        onChange={(event) => setDraft(event.target.value)} onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') commit() }} />
    </label>
  )
}

function SliderField({ label, value, onChange, min, max, step = 0.01, suffix = '', format }: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  suffix?: string
  format?: (value: number) => string
}) {
  return (
    <label className="optical-defense__slider-field">
      <span>{label}<output>{format ? format(value) : value}{suffix}</output></span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

const CURVE_MIN = 0.05
const CURVE_MAX = 5

function StrengthCurve({ values, onChange, label, colorMode }: {
  values: number[]
  onChange: (values: number[]) => void
  label: string
  colorMode: OpticalColorMode
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragIndexRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)
    const isLight = colorMode === 'light'
    ctx.fillStyle = isLight ? '#f4f8f6' : '#0d1516'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = isLight ? 'rgba(35,67,59,0.13)' : 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    for (let i = 0; i < 4; i += 1) {
      const y = height * (i + 1) / 5
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    const xOf = (index: number) => values.length <= 1 ? width / 2 : index / (values.length - 1) * (width - 12) + 6
    const yOf = (value: number) => height - (Math.max(CURVE_MIN, Math.min(CURVE_MAX, value)) - CURVE_MIN) / (CURVE_MAX - CURVE_MIN) * (height - 16) - 8
    ctx.strokeStyle = isLight ? '#08758b' : '#6fe0ff'
    ctx.lineWidth = 2
    ctx.beginPath()
    values.forEach((value, index) => {
      const x = xOf(index)
      const y = yOf(value)
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    ctx.fillStyle = isLight ? '#08758b' : '#6fe0ff'
    values.forEach((value, index) => {
      ctx.beginPath()
      ctx.arc(xOf(index), yOf(value), 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = isLight ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })
    ctx.fillStyle = isLight ? '#315d66' : 'rgba(111,224,255,0.85)'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    values.forEach((value, index) => {
      ctx.fillText(`${Math.round(value * 100)}%`, xOf(index), yOf(value) - 10)
    })
  }, [colorMode, values])

  const pointFor = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width * canvas.width
    const y = (event.clientY - rect.top) / rect.height * canvas.height
    const index = values.length <= 1
      ? 0
      : Math.round((x - 6) / ((canvas.width - 12) / (values.length - 1)))
    const clamped = Math.max(0, Math.min(values.length - 1, index))
    const value = CURVE_MAX - (y - 8) / (canvas.height - 16) * (CURVE_MAX - CURVE_MIN) - CURVE_MIN
    return { index: clamped, value: Math.max(CURVE_MIN, Math.min(CURVE_MAX, value)) }
  }

  const onDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointFor(event)
    if (!point) return
    dragIndexRef.current = point.index
    applyPoint(point)
  }
  const onMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragIndexRef.current === null) return
    const point = pointFor(event)
    if (point) applyPoint({ ...point, index: dragIndexRef.current })
  }
  const applyPoint = (point: { index: number; value: number }) => {
    const next = [...values]
    next[point.index] = point.value
    onChange(next)
  }

  return (
    <div className="optical-defense__curve-field">
      <span><strong>{label}</strong><small>拖动控制点调整每个波次的强度倍率</small></span>
      <canvas
        ref={canvasRef}
        width={320}
        height={88}
        data-testid="wave-strength-curve"
        onPointerDown={(event) => {
          try { (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId) } catch { /* 非活动指针（测试/极端情况）可忽略 */ }
          onDown(event)
        }}
        onPointerMove={onMove}
        onPointerUp={() => { dragIndexRef.current = null }}
        onPointerCancel={() => { dragIndexRef.current = null }}
      />
    </div>
  )
}

export function CustomLevelConsole({ config, colorMode, onChange, onClose, onResetTuning }: {
  config: CustomLevelConfig
  colorMode: OpticalColorMode
  onChange: (next: CustomLevelConfig) => void
  onClose: () => void
  onResetTuning: () => void
}) {
  const [tab, setTab] = useState<ConsoleTab>('basic')
  const tuning = config.tuning

  const patch = (partial: Partial<CustomLevelConfig>) => onChange({ ...config, ...partial })
  const setTuning = (path: string[], value: number) => onChange({ ...config, tuning: setTuningPath(config.tuning, path, value) })

  const updateWave = (index: number, wavePatch: Partial<CustomWaveSpec>) => {
    const waves = config.waves.map((wave, waveIndex) => waveIndex === index ? { ...wave, ...wavePatch } : wave)
    onChange({ ...config, waves })
  }
  const addWave = () => {
    onChange({ ...config, waves: [...config.waves, newWave()], waveStrengthCurve: resizeCurve([...config.waveStrengthCurve, config.waveStrengthCurve.at(-1) ?? 1]) })
  }
  const removeWave = (index: number) => {
    const waves = config.waves.filter((_, waveIndex) => waveIndex !== index)
    onChange({ ...config, waves, waveStrengthCurve: resizeCurve([...config.waveStrengthCurve.slice(0, index), ...config.waveStrengthCurve.slice(index + 1)]) })
  }
  const resizeCurve = (curve: number[]) => {
    while (curve.length < config.waves.length) curve.push(curve.at(-1) ?? 1)
    curve.length = config.waves.length
    return curve
  }

  const toggleKind = (kind: EnemyKind) => {
    const enabled = config.enabledKinds.includes(kind)
      ? config.enabledKinds.filter((item) => item !== kind)
      : [...config.enabledKinds, kind]
    patch({ enabledKinds: enabled.length ? enabled : ['normal'] })
  }

  const activeKinds: EnemyKind[] = config.enabledKinds.length ? config.enabledKinds : ['normal']

  return (
    <div className="optical-defense__overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="optical-defense__modal optical-defense__console" role="dialog" aria-modal="true" aria-labelledby="optical-console-title" data-testid="custom-console">
        <header>
          <div><Settings2 aria-hidden="true" /><span><strong id="optical-console-title">第二十关控制台</strong><small>参数实时生效 · 波次与敌人改动应用到后续波次</small></span></div>
          <button onClick={onClose} aria-label="关闭控制台"><X /></button>
        </header>

        <nav className="optical-defense__console-tabs" role="tablist" aria-label="控制台分类">
          <button type="button" role="tab" aria-selected={tab === 'basic'} className={tab === 'basic' ? 'is-active' : ''} onClick={() => setTab('basic')}><SlidersHorizontal aria-hidden="true" />基础设置</button>
          <button type="button" role="tab" aria-selected={tab === 'advanced'} className={tab === 'advanced' ? 'is-active' : ''} onClick={() => setTab('advanced')}><Zap aria-hidden="true" />高级设置</button>
        </nav>

        <div className="optical-defense__console-body">
          {tab === 'basic' && <section className="optical-defense__console-section">
            <h3>基础资源</h3>
            <div className="optical-defense__console-grid">
              <NumberField label="初始金币" value={config.startingCoins} onChange={(value) => patch({ startingCoins: Math.round(value) })} min={100} step={10} hint="≥100" />
              <NumberField label="初始能量" value={config.capacityW} onChange={(value) => patch({ capacityW: Math.round(value) }) } min={50} step={10} hint="≥50" />
              <NumberField label="核心生命" value={config.coreHealth} onChange={(value) => patch({ coreHealth: Math.round(value) })} min={1} step={1} hint="≥1" />
            </div>
            <p className="optical-defense__console-note">改动立即更新当前金币、功率容量与核心生命。</p>
          </section>}

          {tab === 'advanced' && <div className="optical-defense__console-advanced">
            <section className="optical-defense__console-section">
              <h3>敌人类型与属性</h3>
              <div className="optical-defense__enemy-multiselect" aria-label="敌人类型多选">
                {ENEMY_KINDS.map((kind) => {
                  const enabled = activeKinds.includes(kind)
                  return <button key={kind} type="button" className={enabled ? 'is-active' : ''} aria-pressed={enabled}
                    onClick={() => toggleKind(kind)} data-testid={`enemy-toggle-${kind}`}>{KIND_LABELS[kind]}</button>
                })}
              </div>
              <div className="optical-defense__enemy-stats">
                {ENEMY_KINDS.map((kind) => {
                  const stats = config.enemies[kind]
                  return <fieldset key={kind} className={activeKinds.includes(kind) ? '' : 'is-disabled'} disabled={!activeKinds.includes(kind)}>
                    <legend>{KIND_LABELS[kind]}</legend>
                    <NumberField label="生命" value={stats.health} onChange={(value) => patch({ enemies: { ...config.enemies, [kind]: { ...stats, health: Math.round(Math.max(1, value)) } } })} min={1} />
                    <NumberField label="速度" value={stats.speed} onChange={(value) => patch({ enemies: { ...config.enemies, [kind]: { ...stats, speed: Math.round(Math.max(1, value)) } } })} min={1} />
                    <NumberField label="金币" value={stats.rewardCoins} onChange={(value) => patch({ enemies: { ...config.enemies, [kind]: { ...stats, rewardCoins: Math.round(Math.max(0, value)) } } })} min={0} />
                    <NumberField label="能量W" value={stats.rewardPowerW} onChange={(value) => patch({ enemies: { ...config.enemies, [kind]: { ...stats, rewardPowerW: Math.round(Math.max(0, value)) } } })} min={0} />
                  </fieldset>
                })}
              </div>
              <SliderField label="抗性通道伤害" value={tuning.damage.resistanceChannelMultiplier} min={0.05} max={1} step={0.01}
                format={(value) => `${Math.round(value * 100)}%`}
                onChange={(value) => setTuning(['damage', 'resistanceChannelMultiplier'], value)} />
            </section>

            <section className="optical-defense__console-section">
              <h3>波次编成</h3>
              <StrengthCurve label="波次强度曲线" values={config.waveStrengthCurve} colorMode={colorMode} onChange={(values) => patch({ waveStrengthCurve: values })} />
              <div className="optical-defense__waves-list">
                {config.waves.map((wave, waveIndex) => (
                  <div key={waveIndex} className="optical-defense__wave-card">
                    <header><strong>波次 {waveIndex + 1}</strong>
                      <label className="optical-defense__random-toggle"><input type="checkbox" checked={wave.random} onChange={(event) => updateWave(waveIndex, { random: event.target.checked })} />随机</label>
                      <button type="button" onClick={() => removeWave(waveIndex)} aria-label={`删除波次 ${waveIndex + 1}`}><Trash2 /></button>
                    </header>
                    <div className="optical-defense__console-grid">
                      <NumberField label="延迟" value={wave.delaySeconds} onChange={(value) => updateWave(waveIndex, { delaySeconds: Math.max(0, value) })} min={0} step={0.1} />
                      <NumberField label="数量" value={wave.totalCount} onChange={(value) => updateWave(waveIndex, { totalCount: Math.max(1, Math.round(value)) })} min={1} step={1} />
                      <NumberField label="间隔" value={wave.intervalSeconds} onChange={(value) => updateWave(waveIndex, { intervalSeconds: Math.max(0.05, value) })} min={0.05} step={0.05} />
                    </div>
                    <div className="optical-defense__wave-distribution">
                      {activeKinds.map((kind) => (
                        <SliderField key={kind} label={KIND_LABELS[kind]} value={wave.distribution[kind] ?? 0} min={0} max={1} step={0.05}
                          format={(value) => `${Math.round(value * 100)}%`}
                          onChange={(value) => updateWave(waveIndex, { distribution: { ...wave.distribution, [kind]: value } })} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button className="optical-defense__add-wave" type="button" onClick={addWave}><Plus />新增波次</button>
            </section>

            <section className="optical-defense__console-section">
              <h3>伤害与元素</h3>
              <div className="optical-defense__console-grid">
                <NumberField label="红光系数" value={tuning.damage.rgb.r} onChange={(value) => setTuning(['damage', 'rgb', 'r'], value)} min={0} step={0.001} />
                <NumberField label="绿光系数" value={tuning.damage.rgb.g} onChange={(value) => setTuning(['damage', 'rgb', 'g'], value)} min={0} step={0.001} />
                <NumberField label="蓝光系数" value={tuning.damage.rgb.b} onChange={(value) => setTuning(['damage', 'rgb', 'b'], value)} min={0} step={0.001} />
              </div>
              <div className="optical-defense__console-grid">
                <SliderField label="橙光倍率" value={tuning.damage.orangeMultiplier} min={0.5} max={3} format={(v) => `×${v.toFixed(2)}`} onChange={(value) => setTuning(['damage', 'orangeMultiplier'], value)} />
                <SliderField label="紫光倍率" value={tuning.damage.magentaMultiplier} min={0.5} max={3} format={(v) => `×${v.toFixed(2)}`} onChange={(value) => setTuning(['damage', 'magentaMultiplier'], value)} />
                <SliderField label="白光破盾" value={tuning.damage.whiteShieldMultiplier} min={1} max={6} format={(v) => `×${v.toFixed(2)}`} onChange={(value) => setTuning(['damage', 'whiteShieldMultiplier'], value)} />
                <SliderField label="裸光束伤害" value={tuning.damage.bareBeamDamageMultiplier} min={0.05} max={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(value) => setTuning(['damage', 'bareBeamDamageMultiplier'], value)} />
                <SliderField label="裸光束状态" value={tuning.damage.bareBeamStatusMultiplier} min={0.05} max={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(value) => setTuning(['damage', 'bareBeamStatusMultiplier'], value)} />
                <SliderField label="易伤倍率" value={tuning.damage.vulnerableDamageMultiplier} min={1} max={3} format={(v) => `×${v.toFixed(2)}`} onChange={(value) => setTuning(['damage', 'vulnerableDamageMultiplier'], value)} />
              </div>
              <div className="optical-defense__console-grid">
                <NumberField label="易伤秒数" value={tuning.damage.vulnerableSeconds} onChange={(value) => setTuning(['damage', 'vulnerableSeconds'], value)} min={0.5} step={0.5} />
                <SliderField label="紫光辐射积累" value={tuning.damage.magentaRadiationMultiplier} min={0.5} max={3} format={(v) => `×${v.toFixed(2)}`} onChange={(value) => setTuning(['damage', 'magentaRadiationMultiplier'], value)} />
              </div>
            </section>

            <section className="optical-defense__console-section">
              <h3>状态与反应</h3>
              <div className="optical-defense__console-grid">
                <NumberField label="中毒 DPS" value={tuning.reactions.poisonDps} onChange={(value) => setTuning(['reactions', 'poisonDps'], value)} min={0} step={0.1} />
                <NumberField label="中毒秒数" value={tuning.reactions.poisonSeconds} onChange={(value) => setTuning(['reactions', 'poisonSeconds'], value)} min={0} step={0.5} />
                <NumberField label="燃烧 DPS" value={tuning.reactions.burnDps} onChange={(value) => setTuning(['reactions', 'burnDps'], value)} min={0} step={0.1} />
                <NumberField label="燃烧秒数" value={tuning.reactions.burnSeconds} onChange={(value) => setTuning(['reactions', 'burnSeconds'], value)} min={0} step={0.5} />
                <NumberField label="冻结秒数" value={tuning.reactions.freezeSeconds} onChange={(value) => setTuning(['reactions', 'freezeSeconds'], value)} min={0} step={0.1} />
                <SliderField label="冻结减速" value={tuning.reactions.freezeSlowFraction} min={0} max={0.95} format={(v) => `${Math.round(v * 100)}%`} onChange={(value) => setTuning(['reactions', 'freezeSlowFraction'], value)} />
                <NumberField label="辐射阈值" value={tuning.reactions.radiationThreshold} onChange={(value) => setTuning(['reactions', 'radiationThreshold'], value)} min={1} step={1} />
                <NumberField label="辐射暴击" value={tuning.reactions.radiationBurstDamage} onChange={(value) => setTuning(['reactions', 'radiationBurstDamage'], value)} min={0} step={1} />
                <NumberField label="辐射衰减延迟" value={tuning.reactions.radiationDecayDelayS} onChange={(value) => setTuning(['reactions', 'radiationDecayDelayS'], value)} min={0} step={0.1} />
                <NumberField label="辐射衰减速率" value={tuning.reactions.radiationDecayPerSecond} onChange={(value) => setTuning(['reactions', 'radiationDecayPerSecond'], value)} min={0} step={0.1} />
                <NumberField label="毒素点燃·基础" value={tuning.reactions.toxinIgnitionBase} onChange={(value) => setTuning(['reactions', 'toxinIgnitionBase'], value)} min={0} step={1} />
                <NumberField label="毒素点燃·每秒" value={tuning.reactions.toxinIgnitionPerSecond} onChange={(value) => setTuning(['reactions', 'toxinIgnitionPerSecond'], value)} min={0} step={0.5} />
                <NumberField label="毒素点燃·上限" value={tuning.reactions.toxinIgnitionMax} onChange={(value) => setTuning(['reactions', 'toxinIgnitionMax'], value)} min={1} step={1} />
                <NumberField label="冷热冲击伤害" value={tuning.reactions.thermalShockDamage} onChange={(value) => setTuning(['reactions', 'thermalShockDamage'], value)} min={0} step={1} />
                <NumberField label="破甲秒数" value={tuning.reactions.armorBreakSeconds} onChange={(value) => setTuning(['reactions', 'armorBreakSeconds'], value)} min={0} step={0.5} />
              </div>
            </section>

            <section className="optical-defense__console-section">
              <h3>护盾与核心</h3>
              <div className="optical-defense__console-grid">
                <SliderField label="护甲减伤" value={tuning.armorShield.armoredDamageMultiplier} min={0.1} max={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(value) => setTuning(['armorShield', 'armoredDamageMultiplier'], value)} />
                <SliderField label="护盾减伤" value={tuning.armorShield.shieldDamageMultiplier} min={0.1} max={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(value) => setTuning(['armorShield', 'shieldDamageMultiplier'], value)} />
                <SliderField label="重甲护盾比" value={tuning.armorShield.armoredShieldFraction} min={0} max={0.5} format={(v) => `${Math.round(v * 100)}%`} onChange={(value) => setTuning(['armorShield', 'armoredShieldFraction'], value)} />
                <NumberField label="重甲护盾下限" value={tuning.armorShield.armoredShieldMinimum} onChange={(value) => setTuning(['armorShield', 'armoredShieldMinimum'], value)} min={0} step={1} />
                <SliderField label="Boss 护盾比" value={tuning.armorShield.bossShieldFraction} min={0} max={0.5} format={(v) => `${Math.round(v * 100)}%`} onChange={(value) => setTuning(['armorShield', 'bossShieldFraction'], value)} />
                <NumberField label="Boss 护盾下限" value={tuning.armorShield.bossShieldMinimum} onChange={(value) => setTuning(['armorShield', 'bossShieldMinimum'], value)} min={0} step={1} />
                <NumberField label="Boss 泄漏伤害" value={tuning.coreLeak.bossDamage} onChange={(value) => setTuning(['coreLeak', 'bossDamage'], value)} min={0} step={1} />
                <NumberField label="普通泄漏伤害" value={tuning.coreLeak.otherDamage} onChange={(value) => setTuning(['coreLeak', 'otherDamage'], value)} min={0} step={1} />
              </div>
            </section>
          </div>}
        </div>

        <footer className="optical-defense__console-footer">
          <span>总计 {config.waves.reduce((sum, wave) => sum + wave.totalCount, 0)} 个敌人 · 调参持久保存</span>
          <button type="button" className="optical-defense__console-reset" onClick={onResetTuning}><RotateCcw />调参恢复默认</button>
        </footer>
      </section>
    </div>
  )
}
