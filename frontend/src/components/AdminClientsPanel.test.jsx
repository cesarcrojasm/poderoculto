import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientsPanel } from './AdminClientsPanel'

let customers
let quotes
let storedPaths
let removedPaths
let nextId
let failCustomerDelete
let rejectCustomerRead
let rejectCustomerUpdate
let failCustomerInsertAfterCommit
function makeClient() {
  return { from(table) {
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
        if (table === 'clientes' && operation === 'select' && rejectCustomerRead) return Promise.reject(new Error('read failed')).then(resolve, reject)
        if (table === 'clientes' && operation === 'update' && rejectCustomerUpdate) return Promise.reject(new Error('update failed')).then(resolve, reject)
        if (table === 'clientes') {
          if (operation === 'select') {
            const matching = customers.filter((customer) => !filter || customer[filter.key] === filter.value)
            data = singleRow ? matching[0] || null : matching
          }
          if (operation === 'insert') {
            data = { id: values.id || `client-${++nextId}`, ...values }
            customers.push(data)
            if (failCustomerInsertAfterCommit) { failCustomerInsertAfterCommit = false; return Promise.reject(new Error('insert response lost')).then(resolve, reject) }
          }
          if (operation === 'update') Object.assign(customers.find((item) => item[filter.key] === filter.value), values)
          if (operation === 'delete') {
            if (failCustomerDelete) error = new Error('delete failed')
            else customers = customers.filter((item) => item[filter.key] !== filter.value)
          }
        }
        if (table === 'cotizaciones' && operation === 'select') data = quotes.filter((quote) => quote.cliente_id === filter?.value)
        return Promise.resolve({ data, error }).then(resolve, reject)
      },
    }
    return builder
  }, storage: { from: () => ({ remove: async (paths) => { removedPaths = paths; storedPaths = storedPaths.filter((path) => !paths.includes(path)); return { error: null } } }) } }
}

beforeEach(() => {
  customers = [{ id: '1', nombre: 'Ana Torres', celular: '3001234567', direccion: 'Bogotá' }, { id: '2', nombre: 'Luis Rojas', celular: '3107654321', direccion: null }]
  quotes = []
  storedPaths = []
  removedPaths = null
  nextId = 0
  failCustomerDelete = false
  rejectCustomerRead = false
  rejectCustomerUpdate = false
  failCustomerInsertAfterCommit = false
  vi.stubGlobal('confirm', vi.fn(() => true))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('admin customer management', () => {
  it('searches by name or cellphone and saves edits', async () => {
    const user = userEvent.setup()
    render(<ClientsPanel client={makeClient()} />)
    expect(await screen.findByDisplayValue('Ana Torres')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('Buscar cliente'), '310765')
    expect(screen.getByDisplayValue('Luis Rojas')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Ana Torres')).not.toBeInTheDocument()
    await user.clear(screen.getByPlaceholderText('Buscar cliente'))
    await user.clear(screen.getByDisplayValue('Ana Torres'))
    await user.type(document.querySelector('.admin-client-row input'), 'Ana María')
    await user.click(screen.getAllByRole('button', { name: 'Guardar' })[0])
    await waitFor(() => expect(customers[0].nombre).toBe('Ana María'))
  })

  it('reports rejected customer updates', async () => {
    rejectCustomerUpdate = true
    const user = userEvent.setup()
    render(<ClientsPanel client={makeClient()} />)
    const name = await screen.findByDisplayValue('Ana Torres')
    await user.clear(name)
    await user.type(name, 'Ana María')
    await user.click(screen.getAllByRole('button', { name: 'Guardar' })[0])
    expect(await screen.findByText('No se pudo guardar el cliente.')).toBeInTheDocument()
  })

  it('validates required customer fields and creates a normalized customer', async () => {
    const user = userEvent.setup()
    render(<ClientsPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: '+ Nuevo cliente' }))
    await user.type(screen.getByLabelText('Nombre *'), '   ')
    await user.type(screen.getByLabelText('Celular *'), '3001234567')
    fireEvent.submit(document.querySelector('.admin-client-form'))
    expect(await screen.findByText('El nombre es obligatorio.')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Nombre *'))
    await user.type(screen.getByLabelText('Nombre *'), 'Camila')
    await user.clear(screen.getByLabelText('Celular *'))
    await user.type(screen.getByLabelText('Celular *'), '123')
    fireEvent.submit(document.querySelector('.admin-client-form'))
    expect(await screen.findByText('El celular debe tener entre 7 y 20 caracteres.')).toBeInTheDocument()
    expect(customers).toHaveLength(2)
    await user.clear(screen.getByLabelText('Celular *'))
    await user.type(screen.getByLabelText('Celular *'), '3001234567')
    await user.type(document.querySelector('.admin-client-form label:nth-of-type(3) input'), ' Medellín ')
    fireEvent.submit(document.querySelector('.admin-client-form'))
    await waitFor(() => expect(customers).toHaveLength(3))
    expect(customers.at(-1)).toMatchObject({ nombre: 'Camila', celular: '3001234567', direccion: 'Medellín' })
  })

  it('recovers a committed customer insert after its response is lost', async () => {
    failCustomerInsertAfterCommit = true
    const user = userEvent.setup()
    render(<ClientsPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: '+ Nuevo cliente' }))
    await user.type(screen.getByLabelText('Nombre *'), 'Camila')
    await user.type(screen.getByLabelText('Celular *'), '3001234567')
    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }))
    expect(await screen.findByText('Cliente creado.')).toBeInTheDocument()
    expect(customers.filter((customer) => customer.nombre === 'Camila')).toHaveLength(1)
  })

  it('guards against duplicate customer inserts and recovers from rejected loads', async () => {
    const user = userEvent.setup()
    render(<ClientsPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: '+ Nuevo cliente' }))
    await user.type(screen.getByLabelText('Nombre *'), 'Camila')
    await user.type(screen.getByLabelText('Celular *'), '3001234567')
    const form = document.querySelector('.admin-client-form')
    fireEvent.submit(form)
    fireEvent.submit(form)
    await waitFor(() => expect(customers).toHaveLength(3))
    expect(customers.filter((customer) => customer.nombre === 'Camila')).toHaveLength(1)

    cleanup()
    rejectCustomerRead = true
    render(<ClientsPanel client={makeClient()} />)
    expect(await screen.findByText('No fue posible cargar los clientes.')).toBeInTheDocument()
    expect(screen.queryByText('Cargando clientes…')).not.toBeInTheDocument()
  })

  it('keeps quote PDFs and customer rows when the cascade deletion fails', async () => {
    failCustomerDelete = true
    quotes = [{ cliente_id: '1', pdf_url: 'https://project.supabase.co/storage/v1/object/public/cotizaciones/quote-1/cotizacion-123.pdf' }]
    storedPaths = ['quote-1/cotizacion-123.pdf']
    const user = userEvent.setup()
    render(<ClientsPanel client={makeClient()} />)
    await user.click((await screen.findAllByRole('button', { name: 'Eliminar' }))[0])
    expect(await screen.findByText('No se pudo eliminar el cliente.')).toBeInTheDocument()
    expect(customers).toHaveLength(2)
    expect(removedPaths).toBeNull()
    expect(storedPaths).toEqual(['quote-1/cotizacion-123.pdf'])
  })

  it('keeps a customer and its quotes when deletion confirmation is dismissed', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const user = userEvent.setup()
    render(<ClientsPanel client={makeClient()} />)
    await user.click((await screen.findAllByRole('button', { name: 'Eliminar' }))[0])
    expect(customers).toHaveLength(2)
    expect(screen.getByDisplayValue('Ana Torres')).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Sus cotizaciones también se eliminarán'))
  })

  it('deletes quote PDFs before cascading a confirmed customer deletion', async () => {
    quotes = [{ cliente_id: '1', pdf_url: 'https://project.supabase.co/storage/v1/object/public/cotizaciones/quote-1/cotizacion-123.pdf' }]
    storedPaths = ['quote-1/cotizacion-123.pdf']
    const user = userEvent.setup()
    render(<ClientsPanel client={makeClient()} />)
    await user.click((await screen.findAllByRole('button', { name: 'Eliminar' }))[0])
    await waitFor(() => expect(customers).toHaveLength(1))
    expect(removedPaths).toEqual(['quote-1/cotizacion-123.pdf'])
    expect(storedPaths).toEqual([])
  })
})
