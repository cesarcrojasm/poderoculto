import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateSalePdf, getSalePdfContent, SALE_BUSINESS } from './salePdf'

afterEach(() => { vi.restoreAllMocks() })

describe('sale PDF', () => {
  it('renders the transaction without quote-only code or footer fields', async () => {
    const sale = { numero_transaccion: 7, cliente: { nombre: 'Ana Torres' }, estado_pago: 'deuda', metodo_pago: 'nequi', abono_valor: 5000, total: 18000, subtotal: 20000, descuento_valor: 2000, nota: 'Empaque de regalo', items: [{ nombre: 'Raíz carmesí', descripcion: 'Tejido', codigo: 'RC-01', cantidad: 2, precio_unitario: 10000, valor: 20000 }] }
    const now = new Date('2026-11-23T21:43:00.000Z')
    const content = getSalePdfContent(sale, { now })
    const doc = await generateSalePdf(sale, { now })
    const rendered = doc.internal.pages.slice(1).flat().join(' ')
    expect(doc.output('blob')).toBeInstanceOf(Blob)
    expect(content.business).toEqual(SALE_BUSINESS)
    expect(content.customerName).toBe('Ana Torres')
    expect(content.estadoLabel).toBe('Pendiente')
    expect(content.numeroTransaccion).toBe('7')
    expect(content.rows[0].quantity).toBe('2')
    for (const text of ['Ana Torres', 'Método de pago', 'Nequi', 'Pendiente', 'Número de transacción', 'Raíz carmesí', 'Descuento', 'Subtotal', 'Total', 'Nota: Empaque de regalo']) expect(rendered).toContain(text)
    expect(rendered).not.toContain('RC-01')
    expect(rendered).not.toContain('documento es una cotización')
  })

  it('omits an absent customer, payment method and note', () => {
    const content = getSalePdfContent({ estado_pago: 'deuda', total: 10, abono_valor: 0, items: [{ nombre: 'X', cantidad: 1, precio_unitario: 10 }], subtotal: 10, descuento_valor: 0 }, { now: new Date('2026-11-23T21:43:00.000Z') })
    expect(content.customerName).toBe('')
    expect(content.metodoPago).toBeNull()
    expect(content.notaText).toBe('')
    expect(content.estadoLabel).toBe('Pendiente')
  })
})
