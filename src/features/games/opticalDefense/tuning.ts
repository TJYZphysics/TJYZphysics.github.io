/**
 * 第二十关「自由实验」的调参面。所有字段默认值逐项等于当前战斗常量，
 * 因此不传 tuning 时行为与既有 19 关完全一致（既有单元测试保持通过）。
 *
 * 注意：默认值与 `rules.ts` 的 `OPTICAL_REACTIONS` 保持一致，二者不应产生循环依赖；
 * `customLevel.test.ts` 用断言校验 DEFAULT_TUNING 与现值等价。
 */
export type Tuning = {
  /** 元素附着伤害倍率：RGB 通道基础伤害系数、复色与破盾倍率、抗性衰减、易伤。 */
  damage: {
    /** 基础连续光谱伤害系数 `DPS = rgb.r×R + rgb.g×G + rgb.b×B`。 */
    rgb: { r: number; g: number; b: number }
    /** 橙光基础伤害倍率。 */
    orangeMultiplier: number
    /** 紫/品红光基础伤害倍率。 */
    magentaMultiplier: number
    /** 白光消耗护盾的原始伤害倍率。 */
    whiteShieldMultiplier: number
    /** 裸光束只使用此伤害倍率。 */
    bareBeamDamageMultiplier: number
    /** 裸光束只使用此状态强度倍率。 */
    bareBeamStatusMultiplier: number
    /** 元素抗性敌人的对应 RGB 通道承受伤害因子。 */
    resistanceChannelMultiplier: number
    /** 破盾后易伤的所有伤害倍率。 */
    vulnerableDamageMultiplier: number
    /** 破盾后易伤持续秒数。 */
    vulnerableSeconds: number
    /** 紫光辐射积累倍率。 */
    magentaRadiationMultiplier: number
  }
  /** 状态与反应数值。 */
  reactions: {
    poisonSeconds: number
    poisonDps: number
    burnSeconds: number
    burnDps: number
    freezeSeconds: number
    /** 冻结减速系数：`slowdown = 1 − freezeSlowFraction × 冻结强度`。 */
    freezeSlowFraction: number
    /** 毒素点燃伤害 `min(max, base + perSecond × 剩余中毒秒数)`。 */
    toxinIgnitionBase: number
    toxinIgnitionPerSecond: number
    toxinIgnitionMax: number
    toxinIgnitionCooldownS: number
    thermalShockDamage: number
    thermalShockCooldownS: number
    radiationThreshold: number
    radiationBurstDamage: number
    radiationDecayDelayS: number
    radiationDecayPerSecond: number
    armorBreakSeconds: number
  }
  /** 护甲与护盾减伤。 */
  armorShield: {
    /** 重甲未破甲时生命伤害倍率。 */
    armoredDamageMultiplier: number
    /** 有盾时非白光生命伤害保留倍率（与护甲减伤不叠加）。 */
    shieldDamageMultiplier: number
    armoredShieldFraction: number
    armoredShieldMinimum: number
    /** 从该关卡编号起重甲携带初始护盾。 */
    armoredShieldLevelFloor: number
    bossShieldFraction: number
    bossShieldMinimum: number
  }
  /** 敌人泄漏核心的伤害。 */
  coreLeak: {
    bossDamage: number
    otherDamage: number
  }
}

export const DEFAULT_TUNING: Tuning = {
  damage: {
    rgb: { r: 0.06, g: 0.018, b: 0.025 },
    orangeMultiplier: 1.25,
    magentaMultiplier: 1.25,
    whiteShieldMultiplier: 2.5,
    bareBeamDamageMultiplier: 0.22,
    bareBeamStatusMultiplier: 0.25,
    resistanceChannelMultiplier: 0.3,
    vulnerableDamageMultiplier: 1.25,
    vulnerableSeconds: 4,
    magentaRadiationMultiplier: 1.25,
  },
  reactions: {
    poisonSeconds: 4,
    poisonDps: 2.2,
    burnSeconds: 4,
    burnDps: 3,
    freezeSeconds: 1.8,
    freezeSlowFraction: 0.45,
    toxinIgnitionBase: 6,
    toxinIgnitionPerSecond: 2,
    toxinIgnitionMax: 14,
    toxinIgnitionCooldownS: 1,
    thermalShockDamage: 12,
    thermalShockCooldownS: 1.2,
    radiationThreshold: 4,
    radiationBurstDamage: 18,
    radiationDecayDelayS: 1.5,
    radiationDecayPerSecond: 0.6,
    armorBreakSeconds: 2,
  },
  armorShield: {
    armoredDamageMultiplier: 0.55,
    shieldDamageMultiplier: 0.7,
    armoredShieldFraction: 0.12,
    armoredShieldMinimum: 30,
    armoredShieldLevelFloor: 5,
    bossShieldFraction: 0.15,
    bossShieldMinimum: 120,
  },
  coreLeak: {
    bossDamage: 3,
    otherDamage: 1,
  },
}
