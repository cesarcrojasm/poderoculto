import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminSalesPanel } from './AdminSalesPanel'
import { renderQuotePdfAsPng } from '../lib/quoteImage'
import { shareOrDownloadFile } from '../lib/fileShare'

vi.mock('../lib/fileShare', () => ({ shareOrDownloadFile: vi.fn() }))
vi.mock('../lib/quoteImage', () => ({ renderQuotePdfAsPng: vi.fn().mockResolvedValue(new Blob(['image'])) }))

const db = { products: [], customers: [], sales: [], quotes: [], objects: new Set(), id: 0, failNextSaleInsert: false, failNextSaleDelete: false, failSaleUpdateAfterCommit: false, failSaleLookup: false, conflictNextStockUpdate: false, failStockUpdates: 0, commitStockThenFail: false, failNextUpload: false, failNextRemove: false, uploadPaths: [] }
function makeClient() {
  return {
    from(table) {
      let operation = 'select'
      let values
      const filters = []
      let single = false
      const builder = {
        select() { if (operation !== 'insert' && operation !== 'update') operation = 'select'; return this },
        order() { return this },
        insert(input) { operation = 'insert'; values = input; return this },
        update(input) { operation = 'update'; values = input; return this },
        delete() { operation = 'delete'; return this },
        eq(key, value) { filters.push({ key, value }); return this },
        single() { single = true; return this },
        maybeSingle() { single = true; return this },
        then(resolve, reject) {
          let data = null
          let error = null
          if (table === 'productos') {
            const matching = db.products.filter((row) => filters.every(({ key, value }) => row[key] === value))
            if (operation === 'select') data = single ? matching[0] || null : matching.map((row) => ({ ...row, producto_fotos: row.producto_fotos || [] }))
            if (operation === 'update') {
              const stockFilter = filters.some(({ key }) => key === 'stock')
              if (stockFilter && db.failStockUpdates > 0) {
                db.failStockUpdates -= 1
                error = new Error('stock update failed')
              } else if (stockFilter && db.commitStockThenFail) {
                db.commitStockThenFail = false
                if (matching[0]) Object.assign(matching[0], values)
                error = new Error('stock response lost after commit')
              } else if (db.conflictNextStockUpdate && stockFilter) {
                db.conflictNextStockUpdate = false
                const product = db.products.find((row) => filters.some(({ key, value }) => key === 'id' && row.id === value))
                product.stock += 1
              } else if (matching[0]) { Object.assign(matching[0], values); data = matching[0] }
            }
          }
          if (table === 'clientes') {
            const matching = db.customers.filter((row) => filters.every(({ key, value }) => row[key] === value))
            if (operation === 'select') data = single ? matching[0] || null : matching
            if (operation === 'insert') { data = { ...values }; db.customers.push(data) }
          }
          if (table === 'ventas') {
            const matching = db.sales.filter((row) => filters.every(({ key, value }) => row[key] === value))
            if (operation === 'select') {
              if (filters.length && db.failSaleLookup) { db.failSaleLookup = false; error = new Error('lookup failed') }
              else {
                const rows = matching.map((row) => ({ ...row, clientes: db.customers.find((customer) => customer.id === row.cliente_id) || row.clientes || null }))
                data = single ? rows[0] || null : rows
              }
            }
            if (operation === 'insert') {
              if (db.failNextSaleInsert) { db.failNextSaleInsert = false; error = new Error('insert failed') }
              else {
                data = { numero_transaccion: db.sales.length + 1, created_at: '2026-11-23T20:00:00.000Z', ...values }
                db.sales.push(data)
              }
            }
            if (operation === 'update') {
              Object.assign(matching[0], values)
              data = matching[0] || null
              if (db.failSaleUpdateAfterCommit) { db.failSaleUpdateAfterCommit = false; db.failSaleLookup = true; error = new Error('response lost') }
            }
            if (operation === 'delete') {
              if (db.failNextSaleDelete) { db.failNextSaleDelete = false; error = new Error('delete failed') }
              else db.sales = db.sales.filter((row) => !filters.every(({ key, value }) => row[key] === value))
            }
          }
          if (table === 'cotizaciones') {
            const matching = db.quotes.filter((row) => filters.every(({ key, value }) => row[key] === value))
            if (operation === 'update') { Object.assign(matching[0], values); data = matching[0] || null }
          }
          return Promise.resolve({ data, error }).then(resolve, reject)
        },
      }
      return builder
    },
    storage: { from: (bucket) => ({
      upload: async (path) => {
        db.uploadPaths.push(`${bucket}/${path}`)
        if (db.failNextUpload) { db.failNextUpload = false; return { error: new Error('upload failed') } }
        db.objects.add(`${bucket}/${path}`)
        return { error: null }
      },
      download: async (path) => db.objects.has(`${bucket}/${path}`) ? { data: new Blob(['pdf']), error: null } : { data: null, error: new Error('missing') },
      getPublicUrl: (path) => ({ data: { publicUrl: `https://example.test/storage/v1/object/public/${bucket}/${path}` } }),
      remove: async (paths) => {
        if (db.failNextRemove) { db.failNextRemove = false; return { error: new Error('remove failed') } }
        paths.forEach((path) => db.objects.delete(`${bucket}/${path}`))
        return { error: null }
      },
    }) },
  }
}

beforeEach(() => {
  db.products = [{ id: 'p1', nombre: 'Raíz carmesí', descripcion: 'Macramé', precio: 20000, stock: 0, producto_fotos: [] }]
  db.customers = [{ id: 'c1', nombre: 'Ana Torres', celular: '3001234567' }]
  db.sales = []
  db.quotes = [{ id: 'q1', cliente_id: 'c1', estado: 'creada' }]
  db.objects = new Set()
  db.id = 0
  db.failNextSaleInsert = false
  db.failNextSaleDelete = false
  db.failSaleUpdateAfterCommit = false
  db.failSaleLookup = false
  db.conflictNextStockUpdate = false
  db.failStockUpdates = 0
  db.commitStockThenFail = false
  db.failNextUpload = false
  db.failNextRemove = false
  db.uploadPaths = []
  shareOrDownloadFile.mockClear()
  renderQuotePdfAsPng.mockClear()
  shareOrDownloadFile.mockResolvedValue('downloaded')
  vi.stubGlobal('crypto', { randomUUID: () => `sale-${++db.id}` })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

async function startDirectSale(user) {
  await user.click(await screen.findByRole('button', { name: '+ Nueva venta' }))
  await user.click(screen.getByRole('button', { name: 'Aumentar Raíz carmesí' }))
  await user.click(screen.getByRole('button', { name: 'Añadir productos' }))
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
}

describe('Balance sales workflows', () => {
  it('keeps keyboard focus inside the sale wizard dialog', async () => {
    const user = userEvent.setup()
    render(<AdminSalesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: '+ Nueva venta' }))
    const dialog = screen.getByRole('dialog', { name: 'Seleccionar productos' })
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]')]
    focusable.at(-1).focus()
    fireEvent.keyDown(focusable.at(-1), { key: 'Tab' })
    expect(document.activeElement).toBe(focusable[0])
  })

  it('creates an anonymous direct sale, requires payment method, and permits negative stock', async () => {
    const user = userEvent.setup()
    render(<AdminSalesPanel client={makeClient()} />)
    await startDirectSale(user)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Selecciona un método de pago para guardar una venta pagada.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Efectivo' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('button', { name: 'Descargar comprobante' })).toBeInTheDocument()
    expect(db.sales[0]).toMatchObject({ cliente_id: null, estado_pago: 'pagado', total: 20000 })
    expect(db.products[0].stock).toBe(-1)
    expect(db.sales[0].pdf_url).toContain('/ventas/')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['receipt']) }))
    await user.click(screen.getByRole('button', { name: 'Descargar comprobante' }))
    await waitFor(() => expect(shareOrDownloadFile).toHaveBeenCalledWith(expect.any(File), { shareApi: null }))
  })

  it('shares receipt files as both an image and a real PDF attachment', async () => {
    const user = userEvent.setup()
    db.sales = [{ id: 's1', numero_transaccion: 7, cliente_id: 'c1', clientes: db.customers[0], total: 20000, estado_pago: 'pagado', metodo_pago: 'efectivo', abono_valor: 0, items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 1, precio_unitario: 20000, valor: 20000 }], subtotal: 20000, descuento_valor: 0, pdf_url: 'https://example.test/receipt.pdf' }]
    const receiptBlob = new Blob(['pdf'])
    receiptBlob.arrayBuffer = async () => new ArrayBuffer(3)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => receiptBlob }))
    render(<AdminSalesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: 'Compartir' }))
    await user.click(screen.getByRole('button', { name: /Compartir como imagen/ }))
    await waitFor(() => expect(shareOrDownloadFile).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png' }), expect.objectContaining({ title: 'Comprobante de venta Poder Oculto' })))
    expect(renderQuotePdfAsPng).toHaveBeenCalledWith(expect.any(ArrayBuffer))
    await user.click(screen.getByRole('button', { name: 'Compartir' }))
    await user.click(screen.getByRole('button', { name: /Compartir como PDF/ }))
    await waitFor(() => expect(shareOrDownloadFile).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'application/pdf' }), expect.objectContaining({ text: expect.stringContaining('Ana Torres') })))
  })

  it('keeps a saved sale retryable when PDF upload initially fails', async () => {
    const user = userEvent.setup()
    db.failNextUpload = true
    render(<AdminSalesPanel client={makeClient()} />)
    await startDirectSale(user)
    await user.click(screen.getByRole('button', { name: 'Efectivo' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText(/La venta quedó guardada; puedes reintentar/)).toBeInTheDocument()
    expect(db.sales).toHaveLength(1)
    expect(db.products[0].stock).toBe(-1)
    const firstPath = db.uploadPaths[0]
    await user.click(screen.getByRole('button', { name: 'Reintentar PDF' }))
    await waitFor(() => expect(db.sales[0].pdf_url).toContain('/ventas/'))
    expect(db.sales).toHaveLength(1)
    expect(db.products[0].stock).toBe(-1)
    expect(db.uploadPaths[1]).toBe(firstPath)
  })

  it('clears the old receipt URL during sale edits and removes the old file after retry', async () => {
    const user = userEvent.setup()
    const oldUrl = 'https://example.test/storage/v1/object/public/ventas/s1/comprobante-old.pdf'
    db.products[0].stock = -1
    db.objects.add('ventas/s1/comprobante-old.pdf')
    db.failNextUpload = true
    db.sales = [{ id: 's1', numero_transaccion: 8, cliente_id: 'c1', fecha: '2026-11-20', estado_pago: 'pagado', metodo_pago: 'efectivo', items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 1, precio_unitario: 20000, valor: 20000 }], subtotal: 20000, descuento_porcentaje: 0, descuento_valor: 0, total: 20000, abono_valor: 0, concepto: 'Venta', nota: null, pdf_url: oldUrl }]
    render(<AdminSalesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    await user.click(screen.getByText('Más opciones'))
    await user.clear(screen.getByLabelText('Concepto'))
    await user.type(screen.getByLabelText('Concepto'), 'Venta actualizada')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText(/No se pudo generar o subir el PDF/)).toBeInTheDocument()
    expect(db.sales[0]).toMatchObject({ concepto: 'Venta actualizada', pdf_url: null })
    expect(screen.getByRole('button', { name: 'Descargar comprobante' })).toBeDisabled()
    expect(db.objects.has('ventas/s1/comprobante-old.pdf')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Reintentar PDF' }))
    await waitFor(() => expect(db.sales[0].pdf_url).toContain('/ventas/'))
    expect(db.objects.has('ventas/s1/comprobante-old.pdf')).toBe(false)
  })

  it('keeps sales saved and warns when inventory adjustment fails', async () => {
    const user = userEvent.setup()
    db.failStockUpdates = 1
    render(<AdminSalesPanel client={makeClient()} />)
    await startDirectSale(user)
    await user.click(screen.getByRole('button', { name: 'Efectivo' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findAllByText(/La venta quedó guardada, pero no se pudo actualizar todo el inventario/)).toHaveLength(2)
    expect(db.sales).toHaveLength(1)
    expect(db.products[0].stock).toBe(0)
  })

  it('compensates restored old stock when applying edited sale inventory fails', async () => {
    const user = userEvent.setup()
    db.products[0].stock = -1
    db.products.push({ id: 'p2', nombre: 'Piedra azul', descripcion: '', precio: 5000, stock: 4, producto_fotos: [] })
    db.sales = [{ id: 's1', numero_transaccion: 8, cliente_id: 'c1', fecha: '2026-11-20', estado_pago: 'pagado', metodo_pago: 'efectivo', items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 1, precio_unitario: 10000, valor: 10000 }], subtotal: 10000, descuento_porcentaje: 0, descuento_valor: 0, total: 10000, abono_valor: 0, concepto: 'Venta', nota: null, pdf_url: null }]
    render(<AdminSalesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    await user.click(screen.getByRole('button', { name: /Seleccionar productos/ }))
    await user.click(screen.getByRole('button', { name: 'Aumentar Piedra azul' }))
    await user.click(screen.getByRole('button', { name: 'Añadir productos' }))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    db.products = db.products.filter((product) => product.id !== 'p2')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('No se pudo aplicar todo el inventario nuevo; se restauró el inventario anterior y la venta no se actualizó.')).toBeInTheDocument()
    expect(db.sales[0].items).toHaveLength(1)
    expect(db.sales[0].items[0].cantidad).toBe(1)
    expect(db.products[0].stock).toBe(-1)
  })

  it('keeps a sale and its stock unchanged when restoring inventory fails on deletion', async () => {
    const user = userEvent.setup()
    db.products[0].stock = -1
    db.sales = [{ id: 's1', cliente_id: null, fecha: '2026-11-20', estado_pago: 'pagado', metodo_pago: 'efectivo', items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 1, precio_unitario: 20000, valor: 20000 }], subtotal: 20000, descuento_porcentaje: 0, descuento_valor: 0, total: 20000, abono_valor: 0, concepto: 'Venta', nota: null, pdf_url: null }]
    db.failStockUpdates = 1
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<AdminSalesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText(/No se pudo restaurar todo el inventario/)).toBeInTheDocument()
    expect(db.sales).toHaveLength(1)
    expect(db.products[0].stock).toBe(-1)
  })

  it('reports receipt cleanup failure after deleting the sale row', async () => {
    const user = userEvent.setup()
    db.products[0].stock = -1
    const url = 'https://example.test/storage/v1/object/public/ventas/s1/comprobante-old.pdf'
    db.sales = [{ id: 's1', cliente_id: null, fecha: '2026-11-20', estado_pago: 'pagado', metodo_pago: 'efectivo', items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 1, precio_unitario: 20000, valor: 20000 }], subtotal: 20000, descuento_porcentaje: 0, descuento_valor: 0, total: 20000, abono_valor: 0, concepto: 'Venta', nota: null, pdf_url: url }]
    db.objects.add('ventas/s1/comprobante-old.pdf')
    db.failNextRemove = true
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<AdminSalesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('La venta se eliminó y el inventario se restauró, pero no se pudo eliminar el PDF de Storage.')).toBeInTheDocument()
    expect(db.sales).toHaveLength(0)
    expect(db.products[0].stock).toBe(0)
    expect(db.objects.has('ventas/s1/comprobante-old.pdf')).toBe(true)
  })

  it('keeps the all-time income total unchanged when filtering the sale list', async () => {
    const user = userEvent.setup()
    db.sales = [
      { id: 's1', total: 10000, clientes: db.customers[0] },
      { id: 's2', total: 20000, clientes: { id: 'c2', nombre: 'Beatriz', celular: '3000000000' } },
    ]
    render(<AdminSalesPanel client={makeClient()} />)
    await screen.findByText('Ingresos totales')
    const income = screen.getByText('Ingresos totales').parentElement.querySelector('strong').textContent
    await user.type(screen.getByLabelText('Buscar cliente'), 'Ana')
    expect(screen.getByText('Ingresos totales').parentElement.querySelector('strong').textContent).toBe(income)
    expect(screen.getByText('Ingresos totales').parentElement).toHaveTextContent('1 venta')
  })

  it('converts a quote into one prefilled sale and marks the quote sold', async () => {
    const quote = { id: 'q1', cliente_id: 'c1', clientes: db.customers[0], concepto: 'Regalo', estado: 'creada', items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 2, precio_unitario: 15000, valor: 30000 }], subtotal: 30000, descuento_porcentaje: 0, descuento_valor: 0, total: 30000 }
    const user = userEvent.setup()
    render(<AdminSalesPanel client={makeClient()} initialQuote={quote} />)
    await screen.findByRole('heading', { name: 'Datos de la venta' })
    await user.click(screen.getByRole('button', { name: 'Efectivo' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('button', { name: 'Descargar comprobante' })).toBeInTheDocument()
    expect(db.sales[0]).toMatchObject({ cotizacion_id: 'q1', cliente_id: 'c1', total: 30000 })
    expect(db.quotes[0].estado).toBe('vendida')
  })

  it('records an optional debt payment and restores stock and quote status on deletion', async () => {
    const user = userEvent.setup()
    const quote = { id: 'q1', cliente_id: 'c1', clientes: db.customers[0], concepto: 'Regalo', estado: 'creada', items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 2, precio_unitario: 10000, valor: 20000 }], subtotal: 20000, descuento_porcentaje: 0, descuento_valor: 0, total: 20000 }
    render(<AdminSalesPanel client={makeClient()} initialQuote={quote} />)
    await screen.findByRole('heading', { name: 'Datos de la venta' })
    await user.click(screen.getByRole('button', { name: 'Deuda' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    const amount = await screen.findByLabelText('Abono (opcional)')
    await user.type(amount, '5000')
    expect(screen.getByText(/^Deuda:/)).toHaveTextContent('15.000')
    await user.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(await screen.findAllByText('Selecciona un método de pago para registrar el abono.')).toHaveLength(2)
    expect(db.sales).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Nequi' }))
    await user.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(await screen.findByRole('button', { name: 'Descargar comprobante' })).toBeInTheDocument()
    expect(db.sales[0]).toMatchObject({ estado_pago: 'deuda', abono_valor: 5000, metodo_pago: 'nequi' })
    await user.click(screen.getByRole('button', { name: 'Cerrar y volver a Balance' }))
    window.confirm = vi.fn(() => true)
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(db.sales).toHaveLength(0))
    expect(db.products[0].stock).toBe(0)
    expect(db.objects.size).toBe(0)
    expect(db.quotes[0].estado).toBe('creada')
  })

  it('saves a full debt without an initial payment method when the abono dialog closes', async () => {
    const user = userEvent.setup()
    render(<AdminSalesPanel client={makeClient()} />)
    await startDirectSale(user)
    await user.click(screen.getByRole('button', { name: 'Deuda' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(await screen.findByRole('button', { name: 'Cerrar abono parcial' }))
    expect(await screen.findByRole('button', { name: 'Descargar comprobante' })).toBeInTheDocument()
    expect(db.sales[0]).toMatchObject({ estado_pago: 'deuda', metodo_pago: null, abono_valor: 0 })
  })

  it('preserves an existing partial payment when closing the edit abono dialog', async () => {
    const user = userEvent.setup()
    db.products[0].stock = -1
    db.sales = [{ id: 's1', numero_transaccion: 8, cliente_id: 'c1', fecha: '2026-11-20', estado_pago: 'deuda', metodo_pago: 'nequi', items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 1, precio_unitario: 20000, valor: 20000 }], subtotal: 20000, descuento_porcentaje: 0, descuento_valor: 0, total: 20000, abono_valor: 5000, concepto: 'Venta', nota: null, pdf_url: null }]
    render(<AdminSalesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(await screen.findByRole('button', { name: 'Cerrar abono parcial' }))
    expect(await screen.findByRole('button', { name: 'Descargar comprobante' })).toBeInTheDocument()
    expect(db.sales[0]).toMatchObject({ estado_pago: 'deuda', abono_valor: 5000, metodo_pago: 'nequi' })
    expect(db.products[0].stock).toBe(-1)
  })

  it('normalizes a debt fully covered by its initial payment to paid', async () => {
    const user = userEvent.setup()
    render(<AdminSalesPanel client={makeClient()} />)
    await startDirectSale(user)
    await user.click(screen.getByRole('button', { name: 'Deuda' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.type(await screen.findByLabelText('Abono (opcional)'), '20000')
    await user.click(screen.getByRole('button', { name: 'Efectivo' }))
    await user.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(await screen.findByRole('button', { name: 'Descargar comprobante' })).toBeInTheDocument()
    expect(db.sales[0]).toMatchObject({ estado_pago: 'pagado', metodo_pago: 'efectivo', abono_valor: 0 })
  })

  it('reports a failed sale deletion and restores the deducted stock', async () => {
    const user = userEvent.setup()
    db.products[0].stock = -1
    db.sales = [{ id: 's1', cliente_id: null, fecha: '2026-11-20', estado_pago: 'pagado', metodo_pago: 'efectivo', items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 1, precio_unitario: 20000, valor: 20000 }], subtotal: 20000, descuento_porcentaje: 0, descuento_valor: 0, total: 20000, abono_valor: 0, concepto: 'Venta', nota: null, pdf_url: null }]
    db.failNextSaleDelete = true
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<AdminSalesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('No se pudo eliminar la venta; se revirtió la restauración del inventario.')).toBeInTheDocument()
    expect(db.sales).toHaveLength(1)
    expect(db.products[0].stock).toBe(-1)
  })

  it('rebuilds the idempotent payload after a confirmed failed insert', async () => {
    const user = userEvent.setup()
    db.failNextSaleInsert = true
    render(<AdminSalesPanel client={makeClient()} />)
    await startDirectSale(user)
    await user.click(screen.getByRole('button', { name: 'Efectivo' }))
    const concept = screen.getByLabelText('Concepto')
    await user.clear(concept)
    await user.type(concept, 'Venta corregida')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('No se pudo guardar la venta. Inténtalo de nuevo.')).toBeInTheDocument()
    expect(db.products[0].stock).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('button', { name: 'Descargar comprobante' })).toBeInTheDocument()
    expect(db.sales[0].concepto).toBe('Venta corregida')
    expect(db.products[0].stock).toBe(-1)
  })

  it('retries a stock compare-and-set after a concurrent update', async () => {
    const user = userEvent.setup()
    db.conflictNextStockUpdate = true
    render(<AdminSalesPanel client={makeClient()} />)
    await startDirectSale(user)
    await user.click(screen.getByRole('button', { name: 'Efectivo' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('button', { name: 'Descargar comprobante' })).toBeInTheDocument()
    expect(db.products[0].stock).toBe(0)
  })

  it('confirms a stock update that committed before its response was lost', async () => {
    const user = userEvent.setup()
    db.commitStockThenFail = true
    render(<AdminSalesPanel client={makeClient()} />)
    await startDirectSale(user)
    await user.click(screen.getByRole('button', { name: 'Efectivo' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('button', { name: 'Descargar comprobante' })).toBeInTheDocument()
    expect(db.products[0].stock).toBe(-1)
    expect(screen.queryByText(/no se pudo actualizar todo el inventario/)).not.toBeInTheDocument()
  })

  it('does not roll back stock when a sale update may have committed but cannot be confirmed', async () => {
    const user = userEvent.setup()
    db.products[0].stock = -1
    db.sales = [{ id: 's1', numero_transaccion: 8, cliente_id: 'c1', fecha: '2026-11-20', estado_pago: 'pagado', metodo_pago: 'efectivo', items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 1, precio_unitario: 20000, valor: 20000 }], subtotal: 20000, descuento_porcentaje: 0, descuento_valor: 0, total: 20000, abono_valor: 0, concepto: 'Venta', nota: null, pdf_url: null }]
    db.failSaleUpdateAfterCommit = true
    render(<AdminSalesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    await user.click(screen.getByRole('button', { name: /Seleccionar productos/ }))
    await user.click(screen.getByRole('button', { name: 'Aumentar Raíz carmesí' }))
    await user.click(screen.getByRole('button', { name: 'Añadir productos' }))
    await user.clear(screen.getByLabelText('Cantidad Raíz carmesí'))
    await user.type(screen.getByLabelText('Cantidad Raíz carmesí'), '2')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('No se pudo confirmar si la venta se actualizó. Verifica la venta y el inventario antes de reintentar.')).toBeInTheDocument()
    expect(db.sales[0].items[0].cantidad).toBe(2)
    expect(db.products[0].stock).toBe(-2)
  })

  it('preserves a fixed-value discount when an existing sale is saved unchanged', async () => {
    const user = userEvent.setup()
    db.products[0].stock = -1000
    db.sales = [{ id: 's1', numero_transaccion: 8, cliente_id: 'c1', fecha: '2026-11-20', estado_pago: 'pagado', metodo_pago: 'efectivo', clientes: db.customers[0], items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 1000, precio_unitario: 20000, valor: 20000000 }], subtotal: 20000000, descuento_porcentaje: 1.17, descuento_valor: 234567, total: 19765433, abono_valor: 0, concepto: 'Venta', nota: null, pdf_url: null }]
    render(<AdminSalesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('button', { name: 'Descargar comprobante' })).toBeInTheDocument()
    expect(db.sales[0]).toMatchObject({ descuento_valor: 234567, total: 19765433 })
  })

  it('applies old and new quantity deltas when a saved sale is edited', async () => {
    const user = userEvent.setup()
    db.products[0].stock = -1
    db.sales = [{ id: 's1', numero_transaccion: 8, cliente_id: 'c1', fecha: '2026-11-20', estado_pago: 'pagado', metodo_pago: 'efectivo', items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 1, precio_unitario: 10000, valor: 10000 }], subtotal: 10000, descuento_porcentaje: 0, descuento_valor: 0, total: 10000, abono_valor: 0, concepto: 'Venta', nota: null, pdf_url: 'https://example.test/storage/v1/object/public/ventas/s1/comprobante-old.pdf' }]
    render(<AdminSalesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    await user.click(screen.getByRole('button', { name: /Seleccionar productos/ }))
    await user.click(screen.getByRole('button', { name: 'Aumentar Raíz carmesí' }))
    await user.click(screen.getByRole('button', { name: 'Añadir productos' }))
    const quantity = screen.getByLabelText('Cantidad Raíz carmesí')
    expect(quantity).toHaveValue(2)
    await user.clear(quantity)
    await user.type(quantity, '3')
    expect(quantity).toHaveValue(3)
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('button', { name: 'Descargar comprobante' })).toBeInTheDocument()
    expect(db.sales[0]).toMatchObject({ numero_transaccion: 8, total: 30000 })
    expect(db.products[0].stock).toBe(-3)
  })
})
