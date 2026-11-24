import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CategoriesPanel, ProductsPanel } from './Admin'

const database = { products: [], photos: [], categories: [], storage: new Set(), id: 0 }

function makeClient({ failCategoryInsert = false, failCategoryUpdate = false } = {}) {
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
          let error = null
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
          if (table === 'categorias') {
            if (operation === 'select') data = [...database.categories].sort((a, b) => a.nombre.localeCompare(b.nombre))
            if (operation === 'insert') {
              if (failCategoryInsert || database.categories.some((category) => category.id === values.id || category.nombre === values.nombre)) error = { message: 'duplicate' }
              else database.categories.push(values)
            }
            if (operation === 'update') {
              const existing = database.categories.find((category) => category.id === filters.id)
              if (failCategoryUpdate || database.categories.some((category) => category.id !== filters.id && category.nombre === values.nombre)) error = { message: 'duplicate' }
              else Object.assign(existing, values)
            }
            if (operation === 'delete') {
              database.categories = database.categories.filter((category) => category.id !== filters.id)
              database.products.filter((product) => product.categoria_id === filters.id).forEach((product) => { product.categoria_id = null })
            }
          }
          return Promise.resolve({ data, error }).then(resolve, reject)
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
  database.products = [{ id: '1', nombre: 'Prueba', descripcion: 'Descripción', precio: 20000, disponible: true, orden: 1, categoria_id: null }]
  database.photos = [
    { id: 'p1', producto_id: '1', url: '/products/1.1.jpeg', orden: 1 },
    { id: 'p2', producto_id: '1', url: '/products/1.2.jpeg', orden: 2 },
  ]
  database.categories = [{ id: 'clasica', nombre: 'Clásica' }, { id: 'colombiana', nombre: 'Colombiana' }]
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

  it('creates and edits the product SKU and informational stock fields', async () => {
    const user = userEvent.setup()
    render(<ProductsPanel client={makeClient()} />)
    await user.click(await screen.findByRole('button', { name: /nuevo producto/i }))
    await user.type(screen.getByLabelText('Nombre *'), 'SKU nueva')
    await user.type(screen.getByLabelText('Precio (COP) *'), '12000')
    await user.type(document.querySelector('.new-product-form input[name="code"]'), 'SKU-01')
    await user.clear(document.querySelector('.new-product-form input[name="stock"]'))
    await user.type(document.querySelector('.new-product-form input[name="stock"]'), '3')
    await user.upload(screen.getByLabelText(/fotos \*/i), new File(['image'], 'sku.png', { type: 'image/png' }))
    fireEvent.submit(document.querySelector('.new-product-form'))
    await waitFor(() => expect(database.products).toHaveLength(2))
    expect(database.products.at(-1)).toMatchObject({ codigo: 'SKU-01', stock: 3 })
    const existing = screen.getByLabelText('Código Prueba')
    await user.clear(existing)
    await user.type(existing, 'PR-22')
    await user.clear(screen.getByLabelText('Stock Prueba'))
    await user.type(screen.getByLabelText('Stock Prueba'), '8')
    await user.click(screen.getAllByRole('button', { name: 'Guardar' })[0])
    await waitFor(() => expect(database.products[0]).toMatchObject({ codigo: 'PR-22', stock: 8 }))
  })

  it('rejects stock above the database integer range on create and edit', async () => {
    const user = userEvent.setup()
    render(<ProductsPanel client={makeClient()} />)
    const currentStock = await screen.findByLabelText('Stock Prueba')
    await user.clear(currentStock)
    await user.type(currentStock, '2147483648')
    await user.click(screen.getAllByRole('button', { name: 'Guardar' })[0])
    expect(await screen.findByText('El stock debe ser un entero dentro del límite permitido.')).toBeInTheDocument()
    expect(database.products[0].stock).toBeUndefined()

    await user.click(screen.getByRole('button', { name: /nuevo producto/i }))
    await user.type(screen.getByLabelText('Nombre *'), 'Stock fuera de rango')
    await user.type(screen.getByLabelText('Precio (COP) *'), '12000')
    await user.clear(document.querySelector('.new-product-form input[name="stock"]'))
    await user.type(document.querySelector('.new-product-form input[name="stock"]'), '2147483648')
    fireEvent.submit(document.querySelector('.new-product-form'))
    expect(await screen.findByText('El stock debe ser un entero no negativo dentro del límite permitido.')).toBeInTheDocument()
    expect(database.products).toHaveLength(1)
  })

  it('allows signed integer inventory balances in the product editor', async () => {
    const user = userEvent.setup()
    render(<ProductsPanel client={makeClient()} />)
    const stock = await screen.findByLabelText('Stock Prueba')
    expect(stock).toHaveAttribute('min', '-2147483648')
    await user.clear(stock)
    await user.type(stock, '-3')
    await user.click(screen.getAllByRole('button', { name: 'Guardar' })[0])
    await waitFor(() => expect(database.products[0].stock).toBe(-3))
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

  it('lets a product be assigned to a category, defaulting to "Sin categoría"', async () => {
    const user = userEvent.setup()
    render(<ProductsPanel client={makeClient()} />)
    const select = await screen.findByLabelText('Categoría Prueba')
    expect(screen.queryByLabelText('Nueva categoría')).not.toBeInTheDocument()
    expect(select).toHaveValue('')
    await user.selectOptions(select, 'colombiana')
    const productCard = select.closest('.admin-product-card')
    await user.click(within(productCard).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(database.products[0].categoria_id).toBe('colombiana'))
  })

  it('creates, renames and deletes categories, reassigning their products to "Sin categoría"', async () => {
    const user = userEvent.setup()
    database.products[0].categoria_id = 'colombiana'
    render(<CategoriesPanel client={makeClient()} />)
    await screen.findByText('1 productos')
    await user.type(screen.getByLabelText('Nueva categoría'), 'Edición especial')
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }))
    expect(await screen.findByText('Categoría creada.')).toBeInTheDocument()
    expect(database.categories.some((category) => category.id === 'edicion-especial' && category.nombre === 'Edición especial')).toBe(true)
    const nameInput = screen.getByLabelText('Nombre categoría Colombiana')
    const categoryRow = nameInput.closest('.admin-category-row')
    expect(within(categoryRow).getByText('1 productos')).toBeInTheDocument()
    await user.clear(nameInput)
    await user.type(nameInput, 'Colombia 🇨🇴')
    await user.click(within(categoryRow).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Categoría guardada.')).toBeInTheDocument()
    expect(database.categories.find((category) => category.id === 'colombiana').nombre).toBe('Colombia 🇨🇴')
    await user.click(within(categoryRow).getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('Categoría eliminada. Los productos quedaron sin categoría.')).toBeInTheDocument()
    expect(database.categories.some((category) => category.id === 'colombiana')).toBe(false)
    expect(database.products[0].categoria_id).toBeNull()
  })

  it('rejects a category name that produces a duplicate slug', async () => {
    const user = userEvent.setup()
    render(<CategoriesPanel client={makeClient()} />)
    await screen.findByLabelText('Nombre categoría Clásica')
    await user.type(screen.getByLabelText('Nueva categoría'), 'Clásica')
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }))
    expect(await screen.findByText(/no se pudo crear la categoría/i)).toBeInTheDocument()
    expect(database.categories).toHaveLength(2)
  })
})
