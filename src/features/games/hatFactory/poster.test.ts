import { describe, expect, it } from 'vitest'

import { createStartQrCode, getHatFactoryUrl, HAT_FACTORY_PUBLIC_URL } from './poster'

describe('Hat Factory share poster', () => {
  it('uses the stable public game URL for QR codes', async () => {
    expect(getHatFactoryUrl()).toBe(HAT_FACTORY_PUBLIC_URL)
    expect(getHatFactoryUrl()).toBe('https://tjyzphysics.github.io/games?game=hat-factory')
    await expect(createStartQrCode()).resolves.toMatch(/^data:image\/png;base64,/)
  })
})
