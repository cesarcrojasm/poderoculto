import { describe, expect, it } from 'vitest'
import { calculateDiscountPercent, calculateQuoteTotals, expirationLabel, formatDate, formatQuoteWhatsAppMessage, getExpirationDate, quoteWhatsAppUrl, summarizeQuoteItems, validateCustomer, validateQuoteLine } from './cotizaciones'

describe('quote calculations and validation', () => {
  it('validates and normalizes customer fields', () => {
    expect(validateCustomer({ nombre: ' Ana ', celular: ' 3001234567 ', direccion: ' Calle 1 ' })).toEqual({ valid: true, value: { nombre: 'Ana', celular: '3001234567', direccion: 'Calle 1' } })
    expect(validateCustomer({ nombre: 'Ana', celular: '3001234', direccion: '' }).value.direccion).toBeNull()
    expect(validateCustomer({ nombre: ' ', celular: '3001234567' })).toMatchObject({ valid: false, field: 'nombre' })
    expect(validateCustomer({ nombre: 'x'.repeat(101), celular: '3001234567' }).valid).toBe(false)
    expect(validateCustomer({ nombre: 'Ana', celular: '123' })).toMatchObject({ valid: false, field: 'celular' })
    expect(validateCustomer({ nombre: 'Ana', celular: '1'.repeat(21) }).valid).toBe(false)
  })

  it('validates integer quantities and unit prices', () => {
    expect(validateQuoteLine({ cantidad: 1, precio_unitario: 0 })).toBe(true)
    expect(validateQuoteLine({ cantidad: 0, precio_unitario: 1 })).toBe(false)
    expect(validateQuoteLine({ cantidad: 1.5, precio_unitario: 1 })).toBe(false)
    expect(validateQuoteLine({ cantidad: 1, precio_unitario: -1 })).toBe(false)
    expect(validateQuoteLine({ cantidad: 1, precio_unitario: 2.5 })).toBe(false)
    expect(validateQuoteLine({ cantidad: 1, precio_unitario: 2147483647 })).toBe(true)
    expect(validateQuoteLine({ cantidad: 1, precio_unitario: 2147483648 })).toBe(false)
    expect(validateQuoteLine({ cantidad: 2, precio_unitario: 2147483647 })).toBe(false)
    expect(validateQuoteLine({ cantidad: 1e20, precio_unitario: 0 })).toBe(false)
  })

  it('calculates subtotal, rounded discount and total', () => {
    expect(calculateQuoteTotals([{ cantidad: 2, precio_unitario: 1250 }, { cantidad: 1, precio_unitario: 501 }], 10)).toEqual({ subtotal: 3001, descuento_porcentaje: 10, descuento_valor: 300, total: 2701 })
    expect(calculateQuoteTotals([{ cantidad: 2, precio_unitario: 500 }], 120)).toMatchObject({ descuento_porcentaje: 100, descuento_valor: 1000, total: 0 })
    expect(calculateQuoteTotals([], -1)).toEqual({ subtotal: 0, descuento_porcentaje: 0, descuento_valor: 0, total: 0 })
  })

  it('converts a peso discount to a bounded percentage', () => {
    expect(calculateDiscountPercent(10000, 1250)).toBe(12.5)
    expect(calculateDiscountPercent(100, 120)).toBe(100)
    expect(calculateDiscountPercent(100, -2)).toBe(0)
    expect(calculateDiscountPercent(0, 0)).toBe(0)
  })

  it('summarizes lines and formats WhatsApp details', () => {
    const lines = [{ cantidad: 2, nombre: 'Raíz' }, { cantidad: 1, nombre: 'Lazo' }]
    expect(summarizeQuoteItems(lines)).toBe('2 Raíz, 1 Lazo')
    expect(summarizeQuoteItems()).toBe('')
    expect(formatQuoteWhatsAppMessage('Ana', 25000, 'https://example.com/q.pdf')).toContain('Hola Ana')
    expect(formatQuoteWhatsAppMessage('Ana', 25000, 'https://example.com/q.pdf')).toContain('$ 25.000')
    expect(quoteWhatsAppUrl({ nombre: 'Ana', celular: '+57 300 123 4567' }, { total: 25000, pdf_url: 'https://example.com/q.pdf' })).toContain('wa.me/573001234567')
  })

  it('computes expiration dates including clamped calendar months', () => {
    const jan31 = new Date(2025, 0, 31, 12)
    expect(getExpirationDate(jan31, '1_mes').getDate()).toBe(28)
    expect(getExpirationDate(new Date(2024, 0, 31, 12), '1_mes').getDate()).toBe(29)
    expect(getExpirationDate(new Date(2025, 0, 1), '1_semana').getDate()).toBe(8)
    expect(getExpirationDate(new Date(2025, 0, 1), '15_dias').getDate()).toBe(16)
    expect(getExpirationDate(jan31, 'no_expira')).toBeNull()
    expect(getExpirationDate('invalid', '1_semana')).toBeNull()
    expect(getExpirationDate(jan31, 'unknown')).toBeNull()
    expect(getExpirationDate(null, '1_semana')).toBeNull()
  })

  it('formats Spanish dates and expiration labels safely', () => {
    expect(formatDate('invalid')).toBe('')
    expect(formatDate(new Date(2026, 10, 19))).toMatch(/noviembre/)
    expect(expirationLabel('1_semana')).toBe('1 semana')
    expect(expirationLabel('15_dias')).toBe('15 días')
    expect(expirationLabel('1_mes')).toBe('1 mes')
    expect(expirationLabel('no_expira')).toBe('No expira')
    expect(expirationLabel('unknown')).toBe('No expira')
  })
})
