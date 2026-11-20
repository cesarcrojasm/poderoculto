import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateQuotePdf, getQuotePdfContent, QUOTE_BUSINESS, QUOTE_FOOTER } from './quotePdf'

const quote = {
  cliente: { nombre: 'Ana Torres' },
  created_at: '2026-11-20T15:00:00.000Z',
  expiracion: '1_mes',
  concepto: 'Regalo familiar',
  items: [{ nombre: 'Raíz carmesí', descripcion: 'Tejido artesanal', codigo: 'RC-01', cantidad: 2, precio_unitario: 20000, valor: 40000, imagen_url: '/products/1.jpg' }],
  subtotal: 40000,
  descuento_valor: 2000,
  total: 38000,
}

function imageStub() {
  class StubImage {
    set src(value) { this.value = value; queueMicrotask(() => this.onload?.()) }
  }
  vi.stubGlobal('Image', StubImage)
  vi.stubGlobal('CanvasRenderingContext2D', class {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() })
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+c3ioAAAAASUVORK5CYII=')
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('quote PDF generation', () => {
  it('includes fixed business, customer, product, discount, total, concept, expiration and footer', async () => {
    imageStub()
    const now = new Date('2026-11-20T15:00:00.000Z')
    const content = getQuotePdfContent(quote, { now })
    const doc = await generateQuotePdf(quote, { now })
    expect(doc.output('blob')).toBeInstanceOf(Blob)
    const rendered = doc.internal.pages.slice(1).flat().join(' ')
    for (const text of ['Paola Ossa', 'Ana Torres', 'Raíz carmesí', 'RC-01', 'Detalle del pago', 'Descuento', 'Subtotal', '38.000', 'Regalo familiar', 'Este documento es una cotización formal']) {
      expect(rendered).toContain(text)
    }
    expect(content.business).toEqual(QUOTE_BUSINESS)
    expect(content.stamp).toMatch(/20 noviembre 2026/)
    expect(content.customerName).toBe('Ana Torres')
    expect(content.seller).toBe('Paola Ossa')
    expect(content.rows[0]).toMatchObject({ code: 'RC-01', quantity: '2' })
    expect(content.rows[0].item.nombre).toBe('Raíz carmesí')
    expect(content.rows[0].description).toBe('Tejido artesanal')
    expect(getQuotePdfContent({ ...quote, items: [{ ...quote.items[0], descripcion: 'd'.repeat(220) }] }).rows[0].description).toBe(`${'d'.repeat(179)}…`)
    expect(content.discountValue).toBeTruthy()
    expect(content.subtotal).toBeTruthy()
    expect(content.total).toBeTruthy()
    expect(content.conceptText).toBe('Concepto: Regalo familiar')
    expect(content.expirationText).toContain('Válida por 1 mes')
    expect(content.footer).toBe(QUOTE_FOOTER)
  })

  it('omits a zero discount and concept and handles an unavailable canvas logo', async () => {
    vi.stubGlobal('CanvasRenderingContext2D', undefined)
    const details = { ...quote, descuento_valor: 0, concepto: '', expiracion: 'no_expira' }
    const content = getQuotePdfContent(details)
    const doc = await generateQuotePdf(details)
    expect(doc.output('blob')).toBeInstanceOf(Blob)
    expect(content.discountValue).toBeNull()
    expect(content.conceptText).toBe('')
    expect(content.expirationText).toBe('Vigencia: No expira.')
    expect(doc.internal.getNumberOfPages()).toBe(1)
  })

  it('supports multi-page product tables and paginates long free-text concepts', async () => {
    vi.stubGlobal('Image', class { set src(_) { queueMicrotask(() => this.onload?.()) } })
    vi.stubGlobal('CanvasRenderingContext2D', class {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const items = Array.from({ length: 25 }, (_, index) => ({ ...quote.items[0], nombre: `Producto ${index}`, descripcion: 'Descripción larga para probar salto de página. '.repeat(8) }))
    const tableDoc = await generateQuotePdf({ ...quote, items, descuento_valor: 0, concepto: '' })
    expect(tableDoc.internal.getNumberOfPages()).toBeGreaterThan(1)
    const pageStreams = tableDoc.internal.pages.slice(1).map((page) => page.join(' '))
    expect(pageStreams.slice(1).every((page) => page.includes('Productos'))).toBe(true)
    expect(tableDoc.output('blob')).toBeInstanceOf(Blob)
    const conceptDoc = await generateQuotePdf({ ...quote, items: [], concepto: 'Detalle extenso. '.repeat(2500) })
    expect(conceptDoc.internal.getNumberOfPages()).toBeGreaterThan(1)
  })
})
