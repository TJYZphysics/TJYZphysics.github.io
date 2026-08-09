import { describe, expect, it } from 'vitest'

import { createStartQrCode, getTuringTestUrl, TURING_TEST_PUBLIC_URL } from './poster'

describe('Turing test share poster', () => {
  it('always points its QR code at the public test entry', async () => {
    expect(getTuringTestUrl()).toBe('https://tjyzphysics.github.io/games?game=turing')
    expect(getTuringTestUrl()).toBe(TURING_TEST_PUBLIC_URL)

    const qrCode = await createStartQrCode(getTuringTestUrl(), 160)
    expect(qrCode).toMatch(/^data:image\/png;base64,/)
  })
})
