import { describe, expect, it } from 'vitest'
import { braceletPrice, cartTotal, formatPrice, makeOrderMessage, readCart, whatsappUrl } from './commerce'
import { CONFIG, METALS, PRODUCTS, STONES } from '../data/catalog'

describe('commerce helpers', () => {
  it('formats COP amounts without decimals', () => {
    expect(formatPrice(20000)).toContain('20.000')
    expect(formatPrice(undefined)).toContain('0')
  })

  it('adds base, selected stone prices and optional metal', () => {
    expect(braceletPrice({ stones: [{ stoneId: 'howlita' }, { stoneId: 'ojo-tigre' }], metalId: 'plata' }, CONFIG, STONES, METALS)).toBe(28000)
    expect(braceletPrice({ stones: [{ stoneId: 'missing' }], metalId: '' }, CONFIG, STONES, METALS)).toBe(18000)
  })

  it('calculates cart total from item prices and quantities', () => {
    expect(cartTotal([{ price: 20000, quantity: 2 }, { price: 28000, quantity: 1 }])).toBe(68000)
    expect(cartTotal([])).toBe(0)
  })

  it('includes both kinds of items in the WhatsApp message', () => {
    const items = [
      { type: 'product', name: 'Raíz carmesí', price: 20000, quantity: 2 },
      { type: 'custom', name: 'Manilla personalizada', price: 28500, quantity: 1, configuration: { weave: 'Trenzado', thread: 'Rojo', stones: [{ name: 'Howlita' }, { name: 'Amatista' }], charmName: 'Corazón', metalName: 'Plata' } },
    ]
    const message = makeOrderMessage('Ana', '3001234567', items, 68500)
    expect(message).toContain('Ana (celular: 3001234567)')
    expect(message).toContain('Raíz carmesí × 2')
    expect(message).toContain('Howlita, Amatista')
    expect(message).toContain('68.500')
  })

  it('encodes the WhatsApp destination and safely reads malformed cart storage', () => {
    expect(whatsappUrl('+57 321 441 1674', 'Hola mundo')).toContain('wa.me/573214411674?text=')
    expect(readCart({ getItem: () => '{not json' })).toEqual([])
    expect(readCart({ getItem: () => '[1]' })).toEqual([1])
    expect(readCart({ getItem: () => 'null' })).toEqual([])
  })

  it('provides all eleven priced products and image fallbacks', () => {
    expect(PRODUCTS).toHaveLength(11)
    expect(PRODUCTS.every((product) => product.price > 0 && product.images.length > 0)).toBe(true)
  })
})
