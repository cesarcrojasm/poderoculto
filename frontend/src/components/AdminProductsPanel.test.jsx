import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductsPanel } from './Admin'

const database = { products: [], photos: [], storage: new Set(), id: 0 }

function makeClient() {
  const client = {
    from(table) {
      let operation = 'select'
      let values
      const filters = {}
      const builder = {
        select() { operation = 'select'; return this },
        order() { return this },
        insert(input) { operation = 'insert'; values = input; return this },
        update(input) { operation = 'update'; values = input; return this },
        delete() { operation = 'delete'; return this },
        eq(key, value) { filters[key] = value; return this },
        then(resolve, reject) {
          let data = null
          if (table === 'productos') {
            if (operation === 'select') data = database.products.map((product) => ({ ...product, producto_fotos: database.photos.filter((photo) => photo.producto_id === product.id) }))
            if (operation === 'insert') database.products.push(values)
            if (operation === 'update') Object.assign(database.products.find((product) => product.id === filters.id), values)
            if (operation === 'delete') {
              database.products = database.products.filter((product) => product.id !== filters.id)
              database.photos = database.photos.filter((photo) => photo.producto_id !== filters.id)
            }
          }
          if (table === 'producto_fotos') {
            if (operation === 'insert') { data = { id: `photo-${++database.id}`, ...values }; database.photos.push(data) }
            if (operation === 'update') Object.assign(database.photos.find((photo) => photo.id === filters.id), values)
            if (operation === 'delete') database.photos = database.photos.filter((photo) => photo.id !== filters.id)
          }
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return builder
    },
    storage: { from: () => ({
      upload: async (path) => { database.storage.add(path); return { error: null } },
      getPublicUrl: (path) => ({ data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/productos/${path}` } }),
      remove: async (paths) => { paths.forEach((path) => database.storage.delete(path)); return { error: null } },
    }) },
  }
  return client
}

beforeEach(() => {
  database.products = [{ id: '1', nombre: 'Prueba', descripcion: 'Descripción', precio: 20000, disponible: true, orden: 1 }]
  database.photos = [
    { id: 'p1', producto_id: '1', url: '/products/1.1.jpeg', orden: 1 },
    { id: 'p2', producto_id: '1', url: '/products/1.2.jpeg', orden: 2 },
  ]
  database.storage = new Set()
  database.id = 0
  vi.stubGlobal('confirm', () => true)
  vi.stubGlobal('crypto', { randomUUID: () => `uuid-${++database.id}` })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('admin product management', () => {
  it('previews product photos without showing photo-order buttons', async () => {
    const user = userEvent.setup()
    render(<ProductsPanel client={makeClient()} />)
    expect(await screen.findByRole('img', { name: 'Prueba, foto 1' })).toHaveAttribute('src', '/products/1.1.jpeg')
    await user.click(screen.getByRole('button', { name: 'Foto siguiente Prueba' }))
    expect(screen.getByRole('img', { name: 'Prueba, foto 2' })).toHaveAttribute('src', '/products/1.2.jpeg')
    expect(screen.queryByText('← Orden')).not.toBeInTheDocument()
    expect(screen.queryByText('Orden →')).not.toBeInTheDocument()
  })

  it('shows only the drag handles for product ordering and hides save until the order changes', async () => {
    database.products.push({ id: '2', nombre: 'Segunda', descripcion: '', precio: 10000, disponible: false, orden: 2 })
    render(<ProductsPanel client={makeClient()} />)
    expect(await screen.findByRole('button', { name: 'Reordenar producto Prueba' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reordenar producto Segunda' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar orden' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Subir Prueba' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bajar Prueba' })).not.toBeInTheDocument()
  })

  it('creates a product with an uploaded image and appends it in order', async () => {
    const user = userEvent.setup()
    render(<ProductsPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: /nuevo producto/i }))
    await user.type(screen.getByLabelText(/nombre \*/i), 'Nueva pieza')
    await user.type(screen.getByLabelText(/precio \(cop\)/i), '25000')
    const fileInput = screen.getByLabelText(/fotos \*/i)
    await user.upload(fileInput, new File(['image'], 'nuevo.png', { type: 'image/png' }))
    expect(screen.getByLabelText(/nombre \*/i)).toHaveValue('Nueva pieza')
    expect(screen.getByLabelText(/precio \(cop\)/i)).toHaveValue(25000)
    expect(fileInput.files).toHaveLength(1)
    const submitted = new window.FormData(document.querySelector('.new-product-form'))
    expect(submitted.get('name')).toBe('Nueva pieza')
    expect(submitted.get('price')).toBe('25000')
    fireEvent.submit(document.querySelector('.new-product-form'))
    await waitFor(() => expect(database.products).toHaveLength(2))
    expect(await screen.findByRole('img', { name: 'Nueva pieza, foto 1' })).toBeInTheDocument()
    expect(database.products.at(-1)).toMatchObject({ nombre: 'Nueva pieza', precio: 25000, orden: 2, disponible: true })
    expect(database.photos.some((photo) => photo.producto_id === database.products.at(-1).id)).toBe(true)
    expect(database.storage.size).toBe(1)
    await user.click(screen.getAllByRole('button', { name: 'Eliminar producto' }).at(-1))
    await waitFor(() => expect(database.products).toHaveLength(1))
    expect(database.storage.size).toBe(0)
  })

  it('deletes individual photos and products after confirmation', async () => {
    const user = userEvent.setup()
    render(<ProductsPanel client={makeClient()} />)
    await screen.findByRole('img', { name: 'Prueba, foto 1' })
    await user.click(screen.getByRole('button', { name: 'Eliminar foto Prueba' }))
    expect(database.photos).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Eliminar producto' }))
    await waitFor(() => expect(database.products).toHaveLength(0))
  })
})
