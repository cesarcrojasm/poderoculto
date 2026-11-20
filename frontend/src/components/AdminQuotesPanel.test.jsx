import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuotesPanel } from './AdminQuotesPanel'

const db = { products: [], customers: [], quotes: [], objects: new Set(), id: 0, failUploads: 0, failUpdates: 0, uploadCount: 0, uploadPaths: [], commitThenFailUpload: false, commitThenFailUpdate: 0, commitThenFailCustomerInsert: false, rejectProducts: false, holdQuoteInsert: false, releaseQuoteInsert: null, commitThenRejectInsert: false, holdPdfUpload: false, releasePdfUpload: null }
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
      remove: async (paths) => { paths.forEach((path) => db.objects.delete(path)); return { error: null } },
      getPublicUrl: (path) => ({ data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/cotizaciones/${path}` } }),
    }) },
  }
}

beforeEach(() => {
  db.products = [{ id: 'p1', nombre: 'Raíz carmesí', descripcion: 'Macramé artesanal', precio: 20000, codigo: 'RC-01', stock: 0, producto_fotos: [{ url: '/products/1.jpg', orden: 1 }] }]
  db.customers = [{ id: 'c1', nombre: 'Ana Torres', celular: '3001234567', direccion: null }]
  db.quotes = []
  db.objects = new Set()
  db.id = 0
  db.failUploads = 0
  db.failUpdates = 0
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

  it('creates one snapshot, uploads a PDF, and opens WhatsApp with the link', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    vi.stubGlobal('open', open)
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
    expect(open).toHaveBeenCalledWith(expect.stringContaining('wa.me/3001234567'), '_blank')
    expect(new URL(open.mock.calls[0][0]).searchParams.get('text')).toContain(db.quotes[0].pdf_url)
    expect(db.uploadCount).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Volver a cotizaciones' }))
    expect(await screen.findByText('1 cotización')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Ana Torres/ }))
    expect(screen.getByRole('link', { name: 'Ver PDF' })).toHaveAttribute('href', db.quotes[0].pdf_url)
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
})
