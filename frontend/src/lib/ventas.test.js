import { describe, expect, it } from 'vitest'
import { calculateSaleTotals, PAYMENT_METHODS, saleEstadoLabel, saleShareText, validateAbono, validateSaleLine } from './ventas'

describe('sale helpers', () => {
  it('reuses quote line and total calculations', () => {
    const lines = [{ cantidad: 2, precio_unitario: 10000 }, { cantidad: 1, precio_unitario: 5000 }]
    expect(validateSaleLine(lines[0])).toBe(true)
    expect(validateSaleLine({ cantidad: 0, precio_unitario: 1 })).toBe(false)
    expect(calculateSaleTotals(lines, 10)).toEqual({ subtotal: 25000, descuento_porcentaje: 10, descuento_valor: 2500, total: 22500 })
    expect(PAYMENT_METHODS.map(({ value }) => value)).toEqual(['efectivo', 'tarjeta', 'transferencia', 'otro', 'nequi', 'daviplata'])
  })

  it('validates optional integer down payments against the total', () => {
    expect(validateAbono('', 100)).toEqual({ valid: true, value: 0 })
    expect(validateAbono(50, 100)).toEqual({ valid: true, value: 50 })
    expect(validateAbono(-1, 100)).toMatchObject({ valid: false, message: 'El abono debe ser un valor entero mayor o igual a 0.' })
    expect(validateAbono(1.5, 100).valid).toBe(false)
    expect(validateAbono(101, 100)).toMatchObject({ valid: false, message: 'El abono no puede superar el total de la venta.' })
  })

  it('labels paid or outstanding sales and provides an anonymous share message', () => {
    expect(saleEstadoLabel({ estado_pago: 'pagado', total: 100, abono_valor: 0 })).toBe('Pagada')
    expect(saleEstadoLabel({ estado_pago: 'deuda', total: 100, abono_valor: 100 })).toBe('Pagada')
    expect(saleEstadoLabel({ estado_pago: 'deuda', total: 100, abono_valor: 20 })).toBe('Pendiente')
    expect(saleShareText('', 38000)).toContain('comprobante de Poder Oculto')
    expect(saleShareText('Ana', 38000)).toContain('Ana')
  })
})
