import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuotesPanel } from './AdminQuotesPanel'
import { shareOrDownloadFile } from '../lib/fileShare'
import { renderQuotePdfAsPng } from '../lib/quoteImage'

vi.mock('../lib/fileShare', () => ({ shareOrDownloadFile: vi.fn() }))
vi.mock('../lib/quoteImage', () => ({ renderQuotePdfAsPng: vi.fn() }))

const db = { products: [], customers: [], quotes: [], sales: [], objects: new Set(), id: 0, failUploads: 0, failUpdates: 0, failQuoteDeletes: 0, failRemoves: 0, uploadCount: 0, uploadPaths: [], commitThenFailUpload: false, commitThenFailUpdate: 0, commitThenFailCustomerInsert: false, rejectProducts: false, holdQuoteInsert: false, releaseQuoteInsert: null, commitThenRejectInsert: false, holdPdfUpload: false, releasePdfUpload: null }
function makeClient() {
  return {
    from(table) {
      let operation = 'select'
      let values
      let filter
      let singleRow = false
      const builder = {
        select() { if (operation !== 'insert') operation = 'select'; return this },
        order() { return this },
        insert(input) { operation = 'insert'; values = input; return this },
        update(input) { operation = 'update'; values = input; return this },
        delete() { operation = 'delete'; return this },
        eq(key, value) { filter = { key, value }; return this },
        single() { singleRow = true; return this },
        maybeSingle() { singleRow = true; return this },
        then(resolve, reject) {
          let data = null
          let error = null
          if (table === 'productos' && db.rejectProducts) return Promise.reject(new Error('product read failed')).then(resolve, reject)
          if (table === 'productos') data = db.products.map((product) => ({ ...product, producto_fotos: product.producto_fotos || [] }))
          if (table === 'clientes') {
            if (operation === 'select') {
              const matching = db.customers.filter((customer) => !filter || customer[filter.key] === filter.value)
              data = singleRow ? matching[0] || null : matching
            }
            if (operation === 'insert') {
              data = { id: values.id || `customer-${++db.id}`, ...values }
              db.customers.push(data)
              if (db.commitThenFailCustomerInsert) { db.commitThenFailCustomerInsert = false; return Promise.reject(new Error('customer insert response lost')).then(resolve, reject) }
            }
          }
          if (table === 'ventas' && operation === 'select') {
            const matching = db.sales.filter((sale) => !filter || sale[filter.key] === filter.value)
            data = singleRow ? matching[0] || null : matching
          }
          if (table === 'cotizaciones') {
            if (operation === 'select') {
              const matching = db.quotes.filter((quote) => !filter || quote[filter.key] === filter.value).map((quote) => ({ ...quote, clientes: db.customers.find((customer) => customer.id === quote.cliente_id) })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              data = singleRow ? matching[0] || null : matching
            }
            if (operation === 'insert') {
              if (db.holdQuoteInsert) return new Promise((complete) => { db.releaseQuoteInsert = () => { data = { id: `quote-${++db.id}`, created_at: '2026-11-20T15:00:00.000Z', ...values }; db.quotes.push(data); complete({ data, error }) } }).then(resolve, reject)
              data = { id: values.id || `quote-${++db.id}`, created_at: '2026-11-20T15:00:00.000Z', ...values }
              db.quotes.push(data)
              if (db.commitThenRejectInsert) { db.commitThenRejectInsert = false; return Promise.reject(new Error('connection lost after insert')).then(resolve, reject) }
            }
            if (operation === 'update') {
              if (db.failUpdates > 0) { db.failUpdates -= 1; error = new Error('update failed') }
              else {
                Object.assign(db.quotes.find((quote) => quote[filter.key] === filter.value), values)
                if (db.commitThenFailUpdate > 0) { db.commitThenFailUpdate -= 1; error = new Error('update response lost') }
              }
            }
            if (operation === 'delete') {
              if (db.failQuoteDeletes > 0) { db.failQuoteDeletes -= 1; error = new Error('delete failed') }
              else db.quotes = db.quotes.filter((quote) => !filter || quote[filter.key] !== filter.value)
            }
          }
          return Promise.resolve({ data, error }).then(resolve, reject)
        },
      }
      return builder
    },
    storage: { from: () => ({
      upload: async (path) => {
        db.uploadCount += 1
        db.uploadPaths.push(path)
        if (db.failUploads > 0) { db.failUploads -= 1; return { error: new Error('upload failed') } }
        if (db.commitThenFailUpload) { db.commitThenFailUpload = false; db.objects.add(path); return { error: new Error('upload response lost') } }
        if (db.holdPdfUpload) return new Promise((resolve) => { db.releasePdfUpload = () => { db.objects.add(path); resolve({ error: null }) } })
        if (db.objects.has(path)) return { error: new Error('already exists') }
        db.objects.add(path)
        return { error: null }
      },
      download: async (path) => db.objects.has(path) ? { data: new Blob(['pdf']), error: null } : { data: null, error: new Error('not found') },
      remove: async (paths) => {
        if (db.failRemoves > 0) { db.failRemoves -= 1; return { error: new Error('remove failed') } }
        paths.forEach((path) => db.objects.delete(path))
        return { error: null }
      },
      getPublicUrl: (path) => ({ data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/cotizaciones/${path}` } }),
    }) },
  }
}

beforeEach(() => {
  db.products = [{ id: 'p1', nombre: 'Raíz carmesí', descripcion: 'Macramé artesanal', precio: 20000, codigo: 'RC-01', stock: 0, producto_fotos: [{ url: '/products/1.jpg', orden: 1 }] }]
  db.customers = [{ id: 'c1', nombre: 'Ana Torres', celular: '3001234567', direccion: null }]
  db.quotes = []
  db.sales = []
  db.objects = new Set()
  db.id = 0
  db.failUploads = 0
  db.failUpdates = 0
  db.failQuoteDeletes = 0
  db.failRemoves = 0
  db.uploadCount = 0
  db.uploadPaths = []
  db.commitThenFailUpload = false
  db.commitThenFailUpdate = 0
  db.commitThenFailCustomerInsert = false
  db.rejectProducts = false
  db.holdQuoteInsert = false
  db.releaseQuoteInsert = null
  db.commitThenRejectInsert = false
  db.holdPdfUpload = false
  db.releasePdfUpload = null
  vi.stubGlobal('crypto', { randomUUID: () => `random-${++db.id}` })
  vi.clearAllMocks()
  shareOrDownloadFile.mockResolvedValue('shared')
  renderQuotePdfAsPng.mockResolvedValue(new Blob(['png-bytes'], { type: 'image/png' }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function openWizard(user) {
  await user.click(await screen.findByRole('button', { name: '+ Nueva cotización' }))
}
async function pickOneProduct(user) {
  await user.click(screen.getByRole('button', { name: 'Aumentar Raíz carmesí' }))
  expect(screen.getByText('No disponible')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Añadir productos/ }))
}

describe('admin quote workflows', () => {
  it('shows a load error and exits loading state when a query rejects', async () => {
    db.rejectProducts = true
    render(<QuotesPanel client={makeClient()} />)
    expect(await screen.findByText('No fue posible cargar los datos de cotizaciones. Inténtalo de nuevo.')).toBeInTheDocument()
    expect(screen.queryByText('Cargando cotizaciones…')).not.toBeInTheDocument()
  })

  it('shows a search-specific empty state when no customer matches', async () => {
    const user = userEvent.setup()
    render(<QuotesPanel client={makeClient()} />)
    await user.type(await screen.findByPlaceholderText('Nombre del cliente'), 'No existe')
    expect(screen.getByText('No hay cotizaciones que coincidan con la búsqueda.')).toBeInTheDocument()
  })

  it('keeps keyboard focus inside the quote wizard dialog', async () => {
    const user = userEvent.setup()
    render(<QuotesPanel client={makeClient()} />)
    await openWizard(user)
    const dialog = screen.getByRole('dialog')
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]')]
    await waitFor(() => expect(dialog).toContainElement(document.activeElement))
    fireEvent.keyDown(focusable.at(-1), { key: 'Tab' })
    expect(document.activeElement).toBe(focusable[0])
    fireEvent.keyDown(focusable[0], { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(focusable.at(-1))
  })

  it('guards against duplicate inline customer inserts', async () => {
    const user = userEvent.setup()
    render(<QuotesPanel client={makeClient()} />)
    await openWizard(user)
    await pickOneProduct(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await user.click(screen.getByRole('button', { name: '+ Crear nuevo cliente' }))
    await user.type(screen.getByLabelText('Nombre *'), 'Camila')
    await user.type(screen.getByLabelText('Celular *'), '3101234567')
    const form = document.querySelector('.admin-inline-customer')
    fireEvent.submit(form)
    fireEvent.submit(form)
    await waitFor(() => expect(db.customers).toHaveLength(2))
    expect(db.customers.filter((customer) => customer.nombre === 'Camila')).toHaveLength(1)
  })

  it('recovers a committed inline customer insert after its response is lost', async () => {
    db.commitThenFailCustomerInsert = true
    const user = userEvent.setup()
    render(<QuotesPanel client={makeClient()} />)
    await openWizard(user)
    await pickOneProduct(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await user.click(screen.getByRole('button', { name: '+ Crear nuevo cliente' }))
    await user.type(screen.getByLabelText('Nombre *'), 'Camila')
    await user.type(screen.getByLabelText('Celular *'), '3101234567')
    await user.click(screen.getByRole('button', { name: 'Guardar y seleccionar' }))
    expect(await screen.findByText('Camila · 3101234567')).toBeInTheDocument()
    expect(db.customers.filter((customer) => customer.nombre === 'Camila')).toHaveLength(1)
  })

  it('returns to product selection when the last quote line is removed', async () => {
    const user = userEvent.setup()
    render(<QuotesPanel client={makeClient()} />)
    await openWizard(user)
    await pickOneProduct(user)
    await user.click(screen.getByRole('button', { name: 'Eliminar Raíz carmesí' }))
    expect(screen.getByRole('heading', { name: 'Seleccionar productos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir productos' })).toBeDisabled()
    expect(db.quotes).toHaveLength(0)
  })

  it('preserves edited product details when revisiting selection and blocks invalid lines', async () => {
    const user = userEvent.setup()
    render(<QuotesPanel client={makeClient()} />)
    await openWizard(user)
    await pickOneProduct(user)
    const quantity = screen.getByLabelText('Cantidad Raíz carmesí')
    await user.click(screen.getByRole('button', { name: 'Disminuir cantidad Raíz carmesí' }))
    await user.click(screen.getByRole('button', { name: 'Aumentar cantidad Raíz carmesí' }))
    await user.click(screen.getByRole('button', { name: 'Aumentar cantidad Raíz carmesí' }))
    expect(quantity).toHaveValue(3)
    const price = screen.getByLabelText('Precio unitario Raíz carmesí')
    await user.clear(price)
    await user.type(price, '15000')
    await user.click(screen.getByRole('button', { name: 'Volver a productos' }))
    expect(screen.getByLabelText('Cantidad Raíz carmesí')).toHaveTextContent('3')
    await user.click(screen.getByRole('button', { name: /Añadir productos/ }))
    expect(screen.getByLabelText('Precio unitario Raíz carmesí')).toHaveValue(15000)
    await user.clear(screen.getByLabelText('Precio unitario Raíz carmesí'))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('cantidad mínima de 1')
    await user.type(screen.getByLabelText('Precio unitario Raíz carmesí'), '15000')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('Datos de la cotización')).toBeInTheDocument()
  })

  it('prevents cancellation while quote confirmation is being saved', async () => {
    const user = userEvent.setup()
    db.holdQuoteInsert = true
    render(<QuotesPanel client={makeClient()} />)
    await openWizard(user)
    await pickOneProduct(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await user.click(screen.getByRole('button', { name: 'Ana Torres · 3001234567' }))
    await user.click(screen.getByRole('button', { name: 'Crear cotización' }))
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    db.releaseQuoteInsert()
    expect(await screen.findByText('¡Creaste una cotización!')).toBeInTheDocument()
  })

  it('recovers a committed quote after the insert response is lost without duplicating it', async () => {
    db.commitThenRejectInsert = true
    const user = userEvent.setup()
    render(<QuotesPanel client={makeClient()} />)
    await openWizard(user)
    await pickOneProduct(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await user.click(screen.getByRole('button', { name: 'Ana Torres · 3001234567' }))
    await user.click(screen.getByRole('button', { name: 'Crear cotización' }))
    expect(await screen.findByText('¡Creaste una cotización!')).toBeInTheDocument()
    expect(db.quotes).toHaveLength(1)
    expect(db.quotes[0].id).toMatch(/^random-/)
  })

  it('shows PDF progress and prevents leaving success before the upload finishes', async () => {
    const user = userEvent.setup()
    db.holdPdfUpload = true
    render(<QuotesPanel client={makeClient()} />)
    await openWizard(user)
    await pickOneProduct(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await user.click(screen.getByRole('button', { name: 'Ana Torres · 3001234567' }))
    await user.click(screen.getByRole('button', { name: 'Crear cotización' }))
    await waitFor(() => expect(db.releasePdfUpload).toBeTypeOf('function'))
    expect(screen.getByRole('status')).toHaveTextContent('Cotización guardada. Generando el PDF…')
    expect(screen.queryByText('¡Creaste una cotización!')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver a cotizaciones' })).toBeDisabled()
    db.releasePdfUpload()
    expect(await screen.findByText('¡Creaste una cotización!')).toBeInTheDocument()
  })

  it('creates one quote and shares the attached PDF or PNG from either entry point', async () => {
    const user = userEvent.setup()
    const pdfBlob = new Blob(['pdf-bytes'], { type: 'application/pdf' })
    pdfBlob.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8))
    shareOrDownloadFile.mockResolvedValueOnce('shared').mockResolvedValueOnce('downloaded')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => pdfBlob }))
    render(<QuotesPanel client={makeClient()} />)
    await openWizard(user)
    await pickOneProduct(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await user.click(screen.getByRole('button', { name: '1 semana' }))
    await user.click(screen.getByRole('button', { name: 'Ana Torres · 3001234567' }))
    await user.clear(screen.getByLabelText('Descuento porcentaje'))
    await user.type(screen.getByLabelText('Descuento porcentaje'), '10')
    expect(screen.getByLabelText('Descuento valor')).toHaveValue(2000)
    await user.clear(screen.getByLabelText('Descuento valor'))
    await user.type(screen.getByLabelText('Descuento valor'), '3000')
    expect(screen.getByLabelText('Descuento porcentaje')).toHaveValue(15)
    await user.clear(screen.getByLabelText('Concepto'))
    await user.type(screen.getByLabelText('Concepto'), 'Pedido especial')
    await user.click(screen.getByRole('button', { name: 'Crear cotización' }))
    expect(await screen.findByText('¡Creaste una cotización!')).toBeInTheDocument()
    await waitFor(() => expect(db.quotes).toHaveLength(1))
    expect(db.quotes[0]).toMatchObject({ cliente_id: 'c1', expiracion: '1_semana', concepto: 'Pedido especial', subtotal: 20000, descuento_porcentaje: 15, descuento_valor: 3000, total: 17000 })
    expect(db.quotes[0].items[0]).toMatchObject({ producto_id: 'p1', codigo: 'RC-01', cantidad: 1, precio_unitario: 20000, valor: 20000 })
    await waitFor(() => expect(db.quotes[0].pdf_url).toContain(`/cotizaciones/${db.quotes[0].id}/`))
    expect(db.objects.size).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Compartir cotización' }))
    expect(screen.getByRole('dialog', { name: 'Compartir cotización' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compartir como imagen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compartir como PDF' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Compartir como PDF' }))
    await waitFor(() => expect(shareOrDownloadFile).toHaveBeenCalledOnce())
    const pdfFile = shareOrDownloadFile.mock.calls[0][0]
    expect(pdfFile).toBeInstanceOf(File)
    expect(pdfFile.type).toBe('application/pdf')
    expect(pdfFile.name).toMatch(/^cotizacion-.*\.pdf$/)
    expect(shareOrDownloadFile.mock.calls[0][1].text).not.toContain(db.quotes[0].pdf_url)
    expect(db.uploadCount).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Volver a cotizaciones' }))
    expect(await screen.findByText('1 cotización')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Ana Torres/ }))
    expect(screen.getByRole('link', { name: 'Ver PDF' })).toHaveAttribute('href', db.quotes[0].pdf_url)
    await user.click(screen.getByRole('button', { name: 'Compartir' }))
    await user.click(screen.getByRole('button', { name: 'Compartir como imagen' }))
    await waitFor(() => expect(shareOrDownloadFile).toHaveBeenCalledTimes(2))
    const imageFile = shareOrDownloadFile.mock.calls[1][0]
    expect(renderQuotePdfAsPng).toHaveBeenCalledOnce()
    expect(imageFile).toBeInstanceOf(File)
    expect(imageFile.type).toBe('image/png')
    expect(imageFile.name).toMatch(/^cotizacion-.*\.png$/)
    expect(await screen.findByRole('status')).toHaveTextContent('Se descargó el archivo. Adjúntalo manualmente en WhatsApp.')
    expect(db.uploadCount).toBe(1)
  })

  it('retries PDF generation from the share chooser when a new quote has no uploaded PDF', async () => {
    db.failUploads = 1
    const user = userEvent.setup()
    const pdfBlob = new Blob(['pdf-bytes'], { type: 'application/pdf' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => pdfBlob }))
    render(<QuotesPanel client={makeClient()} />)
    await openWizard(user)
    await pickOneProduct(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await user.click(screen.getByRole('button', { name: 'Ana Torres · 3001234567' }))
    await user.click(screen.getByRole('button', { name: 'Crear cotización' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La cotización quedó guardada')
    await user.click(screen.getByRole('button', { name: 'Compartir cotización' }))
    await user.click(screen.getByRole('button', { name: 'Compartir como PDF' }))
    await waitFor(() => expect(shareOrDownloadFile).toHaveBeenCalledOnce())
    expect(db.quotes).toHaveLength(1)
    expect(db.uploadCount).toBe(2)
    expect(shareOrDownloadFile.mock.calls[0][0].type).toBe('application/pdf')
  })

  it('allows closing during preparation and does not share after dismissal', async () => {
    const user = userEvent.setup()
    let resolveFetch
    const fetchMock = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    db.quotes = [{ id: 'quote-1', cliente_id: 'c1', created_at: '2026-11-20T15:00:00.000Z', pdf_url: 'https://example.com/quote.pdf', total: 25000 }]
    render(<QuotesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: /Ana Torres/ }))
    await user.click(screen.getByRole('button', { name: 'Compartir' }))
    await user.click(screen.getByRole('button', { name: 'Compartir como imagen' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    await act(async () => {
      resolveFetch({ ok: true, blob: vi.fn() })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.queryByRole('dialog', { name: 'Compartir cotización' })).not.toBeInTheDocument()
    expect(shareOrDownloadFile).not.toHaveBeenCalled()
  })

  it('keeps the share chooser open on fetch failure and retries the same format', async () => {
    const user = userEvent.setup()
    const pdfBlob = new Blob(['pdf-bytes'], { type: 'application/pdf' })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, blob: async () => pdfBlob })
      .mockResolvedValueOnce({ ok: true, blob: async () => pdfBlob }))
    db.quotes = [{ id: 'quote-1', cliente_id: 'c1', created_at: '2026-11-20T15:00:00.000Z', pdf_url: 'https://example.com/quote.pdf', total: 25000 }]
    render(<QuotesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: /Ana Torres/ }))
    await user.click(screen.getByRole('button', { name: 'Compartir' }))
    await user.click(screen.getByRole('button', { name: 'Compartir como PDF' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo preparar el archivo')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(shareOrDownloadFile).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog', { name: 'Compartir cotización' })).not.toBeInTheDocument()
  })

  it('keeps the inserted quote after a PDF error and retries without inserting again', async () => {
    db.failUploads = 1
    const user = userEvent.setup()
    render(<QuotesPanel client={makeClient()} />)
    await openWizard(user)
    await pickOneProduct(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await user.click(screen.getByRole('button', { name: 'Ana Torres · 3001234567' }))
    await user.click(screen.getByRole('button', { name: 'Crear cotización' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La cotización quedó guardada')
    expect(db.quotes).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Reintentar PDF' }))
    await waitFor(() => expect(db.quotes[0].pdf_url).toContain(`/cotizaciones/${db.quotes[0].id}/`))
    expect(db.quotes).toHaveLength(1)
    expect(db.uploadCount).toBe(2)
  })

  it('reuses the stable PDF object when saving its URL fails, then retries the same quote', async () => {
    db.failUpdates = 1
    const user = userEvent.setup()
    render(<QuotesPanel client={makeClient()} />)
    await openWizard(user)
    await pickOneProduct(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await user.click(screen.getByRole('button', { name: 'Ana Torres · 3001234567' }))
    await user.click(screen.getByRole('button', { name: 'Crear cotización' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La cotización quedó guardada')
    expect(db.quotes).toHaveLength(1)
    expect(db.objects.size).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Reintentar PDF' }))
    await waitFor(() => expect(db.quotes[0].pdf_url).toContain(`/cotizaciones/${db.quotes[0].id}/`))
    expect(db.quotes).toHaveLength(1)
    expect(db.objects.size).toBe(1)
    expect(new Set(db.uploadPaths).size).toBe(1)
  })

  it('recovers when a committed PDF upload response is lost', async () => {
    db.commitThenFailUpload = true
    const user = userEvent.setup()
    render(<QuotesPanel client={makeClient()} />)
    await openWizard(user)
    await pickOneProduct(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await user.click(screen.getByRole('button', { name: 'Ana Torres · 3001234567' }))
    await user.click(screen.getByRole('button', { name: 'Crear cotización' }))
    expect(await screen.findByText('¡Creaste una cotización!')).toBeInTheDocument()
    expect(db.objects.size).toBe(1)
    expect(db.quotes).toHaveLength(1)
    expect(db.quotes[0].pdf_url).toContain(`/cotizaciones/${db.quotes[0].id}/`)
  })

  it('recovers when the PDF URL update commits but its response is lost', async () => {
    db.commitThenFailUpdate = 1
    const user = userEvent.setup()
    render(<QuotesPanel client={makeClient()} />)
    await openWizard(user)
    await pickOneProduct(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await user.click(screen.getByRole('button', { name: 'Ana Torres · 3001234567' }))
    await user.click(screen.getByRole('button', { name: 'Crear cotización' }))
    expect(await screen.findByText('¡Creaste una cotización!')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(db.quotes).toHaveLength(1)
    expect(db.objects.size).toBe(1)
    expect(db.quotes[0].pdf_url).toContain(`/cotizaciones/${db.quotes[0].id}/`)
  })

  it('persists an inline customer even when the quote wizard is cancelled', async () => {
    const user = userEvent.setup()
    render(<QuotesPanel client={makeClient()} />)
    await openWizard(user)
    await pickOneProduct(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await user.click(screen.getByRole('button', { name: '+ Crear nuevo cliente' }))
    await user.type(screen.getByLabelText('Nombre *'), 'Camila')
    await user.type(screen.getByLabelText('Celular *'), '3101234567')
    await user.click(screen.getByRole('button', { name: 'Guardar y seleccionar' }))
    await waitFor(() => expect(db.customers).toHaveLength(2))
    expect(screen.getByText('Camila · 3101234567')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(db.customers).toHaveLength(2)
    expect(db.quotes).toHaveLength(0)
  })

  it('opens quote details and routes an unsold quote to sale registration', async () => {
    const user = userEvent.setup()
    const onRegisterSale = vi.fn()
    db.quotes = [{ id: 'q1', cliente_id: 'c1', created_at: '2026-11-20T15:00:00.000Z', expiracion: 'no_expira', concepto: 'Regalo', items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 1, precio_unitario: 20000, valor: 20000 }], subtotal: 20000, descuento_porcentaje: 0, descuento_valor: 0, total: 20000, estado: 'creada' }]
    render(<QuotesPanel client={makeClient()} onRegisterSale={onRegisterSale} />)
    await user.click(await screen.findByRole('button', { name: /Ana Torres/ }))
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }))
    expect(screen.getByText('Referencias totales')).toBeInTheDocument()
    expect(screen.getByText('Creada')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
    expect(onRegisterSale).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1', clientes: db.customers[0] }))
  })

  it('preserves a fixed-value discount when an existing quote is saved unchanged', async () => {
    const user = userEvent.setup()
    db.quotes = [{ id: 'q1', cliente_id: 'c1', created_at: '2026-11-20T15:00:00.000Z', expiracion: 'no_expira', concepto: 'Regalo', items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 1000, precio_unitario: 20000, valor: 20000000 }], subtotal: 20000000, descuento_porcentaje: 1.17, descuento_valor: 234567, total: 19765433, estado: 'creada' }]
    render(<QuotesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: /Ana Torres/ }))
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }))
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(db.quotes[0]).toMatchObject({ descuento_valor: 234567, total: 19765433 }))
  })

  it('clears the stale PDF link while an edited quote waits for PDF regeneration', async () => {
    const user = userEvent.setup()
    const pdfUrl = 'https://project.supabase.co/storage/v1/object/public/cotizaciones/q1/cotizacion-old.pdf'
    db.quotes = [{ id: 'q1', cliente_id: 'c1', created_at: '2026-11-20T15:00:00.000Z', expiracion: 'no_expira', concepto: 'Regalo', items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 1, precio_unitario: 20000, valor: 20000 }], subtotal: 20000, descuento_porcentaje: 0, descuento_valor: 0, total: 20000, estado: 'creada', pdf_url: pdfUrl }]
    db.objects.add('q1/cotizacion-old.pdf')
    db.failUploads = 1
    render(<QuotesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: /Ana Torres/ }))
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }))
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.clear(screen.getByLabelText('Concepto'))
    await user.type(screen.getByLabelText('Concepto'), 'Regalo actualizado')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(db.quotes[0]).toMatchObject({ concepto: 'Regalo actualizado', pdf_url: null }))
    expect(await screen.findByText(/La cotización quedó guardada; puedes reintentar/)).toBeInTheDocument()
  })

  it('reports a returned Storage error while cleaning the previous quote PDF', async () => {
    const user = userEvent.setup()
    const pdfUrl = 'https://project.supabase.co/storage/v1/object/public/cotizaciones/q1/cotizacion-old.pdf'
    db.quotes = [{ id: 'q1', cliente_id: 'c1', created_at: '2026-11-20T15:00:00.000Z', expiracion: 'no_expira', concepto: 'Regalo', items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 1, precio_unitario: 20000, valor: 20000 }], subtotal: 20000, descuento_porcentaje: 0, descuento_valor: 0, total: 20000, estado: 'creada', pdf_url: pdfUrl }]
    db.objects.add('q1/cotizacion-old.pdf')
    db.failRemoves = 1
    render(<QuotesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: /Ana Torres/ }))
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }))
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.clear(screen.getByLabelText('Concepto'))
    await user.type(screen.getByLabelText('Concepto'), 'Regalo actualizado')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await user.click(await screen.findByRole('button', { name: 'Volver a cotizaciones' }))
    expect(await screen.findByText('La cotización se actualizó, pero no se pudo limpiar el PDF anterior de Storage.')).toBeInTheDocument()
    expect(db.objects.has('q1/cotizacion-old.pdf')).toBe(true)
  })

  it('blocks deletion if a linked sale exists despite a stale quote status', async () => {
    const user = userEvent.setup()
    db.quotes = [{ id: 'q1', cliente_id: 'c1', created_at: '2026-11-20T15:00:00.000Z', expiracion: 'no_expira', concepto: 'Regalo', items: [], total: 100, estado: 'creada' }]
    db.sales = [{ id: 's1', cotizacion_id: 'q1' }]
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<QuotesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: /Ana Torres/ }))
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('No se puede eliminar una cotización vendida. Primero elimina la venta asociada.')).toBeInTheDocument()
    expect(db.quotes).toHaveLength(1)
  })

  it('preserves the quote PDF if row deletion fails', async () => {
    const user = userEvent.setup()
    const pdfUrl = 'https://project.supabase.co/storage/v1/object/public/cotizaciones/q1/cotizacion-old.pdf'
    db.quotes = [{ id: 'q1', cliente_id: 'c1', created_at: '2026-11-20T15:00:00.000Z', expiracion: 'no_expira', concepto: 'Regalo', items: [], total: 100, estado: 'creada', pdf_url: pdfUrl }]
    db.objects.add('q1/cotizacion-old.pdf')
    db.failQuoteDeletes = 1
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<QuotesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: /Ana Torres/ }))
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('No se pudo eliminar la cotización.')).toBeInTheDocument()
    expect(db.quotes).toHaveLength(1)
    expect(db.objects.has('q1/cotizacion-old.pdf')).toBe(true)
  })

  it('reports a receipt cleanup failure after deleting the quote row', async () => {
    const user = userEvent.setup()
    const pdfUrl = 'https://project.supabase.co/storage/v1/object/public/cotizaciones/q1/cotizacion-old.pdf'
    db.quotes = [{ id: 'q1', cliente_id: 'c1', created_at: '2026-11-20T15:00:00.000Z', expiracion: 'no_expira', concepto: 'Regalo', items: [], total: 100, estado: 'creada', pdf_url: pdfUrl }]
    db.objects.add('q1/cotizacion-old.pdf')
    db.failRemoves = 1
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<QuotesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: /Ana Torres/ }))
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('La cotización se eliminó, pero no se pudo eliminar su PDF de Storage.')).toBeInTheDocument()
    expect(db.quotes).toHaveLength(0)
    expect(db.objects.has('q1/cotizacion-old.pdf')).toBe(true)
  })

  it('edits a quote without changing its status and blocks deletion of a sold quote', async () => {
    const user = userEvent.setup()
    db.quotes = [{ id: 'q1', cliente_id: 'c1', created_at: '2026-11-20T15:00:00.000Z', expiracion: 'no_expira', concepto: 'Regalo', items: [{ producto_id: 'p1', nombre: 'Raíz carmesí', cantidad: 1, precio_unitario: 20000, valor: 20000 }], subtotal: 20000, descuento_porcentaje: 0, descuento_valor: 0, total: 20000, estado: 'vendida' }]
    db.sales = [{ id: 's1', cotizacion_id: 'q1', concepto: 'Sale unchanged', total: 20000 }]
    render(<QuotesPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: /Ana Torres/ }))
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }))
    expect(screen.queryByRole('button', { name: 'Registrar venta' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const conceptInput = screen.getByLabelText('Concepto')
    await user.clear(conceptInput)
    await user.type(conceptInput, 'Regalo actualizado')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(db.quotes[0].concepto).toBe('Regalo actualizado'))
    expect(db.quotes[0].estado).toBe('vendida')
    expect(db.sales[0]).toEqual({ id: 's1', cotizacion_id: 'q1', concepto: 'Sale unchanged', total: 20000 })
    await user.click(screen.getByRole('button', { name: 'Volver a cotizaciones' }))
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }))
    const confirm = vi.spyOn(window, 'confirm')
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(db.quotes).toHaveLength(1)
    expect(await screen.findByText('No se puede eliminar una cotización vendida. Primero elimina la venta asociada.')).toBeInTheDocument()
  })
})
