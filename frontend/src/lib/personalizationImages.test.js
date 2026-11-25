import { describe, expect, it } from 'vitest'
import { personalizationImage } from './personalizationImages'

describe('personalizationImage', () => {
  it('uses local transparent illustrations for known stones by normalized id or name', () => {
    expect(personalizationImage('piedras', 'jaspe-amarillo', 'Jaspe amarillo', 'https://example.com/white.png'))
      .toBe('/personalizacion/piedras/jaspe-amarillo.svg')
    expect(personalizationImage('piedras', 'bead-17', 'Cuenta traslúcida', 'https://example.com/white.png'))
      .toBe('/personalizacion/piedras/cuenta-translucida.svg')
    expect(personalizationImage('piedras', 'amatista', 'Amatista', null))
      .toBe('/personalizacion/piedras/amatista.svg')
  })

  it('uses existing local illustrations for recognized metal balls', () => {
    expect(personalizationImage('bolas', 'plata', 'Plata', 'https://example.com/white.png'))
      .toBe('/personalizacion/bolas/plata.svg')
  })

  it('preserves uploaded images for unknown options and falls back when absent', () => {
    expect(personalizationImage('piedras', 'nueva-piedra', 'Nueva piedra', 'https://example.com/custom.webp'))
      .toBe('https://example.com/custom.webp')
    expect(personalizationImage('piedras', 'nueva-piedra', 'Nueva piedra', null))
      .toBe('/personalizacion/piedras/nueva-piedra.svg')
  })
})
