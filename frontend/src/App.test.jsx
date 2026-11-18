import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./lib/supabase', () => ({
  hasSupabase: false,
  supabase: null,
  loadProducts: vi.fn().mockResolvedValue(null),
  loadCategories: vi.fn().mockResolvedValue(null),
  loadDesignerOptions: vi.fn().mockResolvedValue(null),
  saveOrder: vi.fn().mockResolvedValue({ saved: false, reason: 'demo' }),
}))

import App from './App'
import { CATEGORIES, PRODUCTS } from './data/catalog'
import { loadCategories, loadProducts } from './lib/supabase'

beforeEach(() => {
  loadProducts.mockResolvedValue(null)
  loadCategories.mockResolvedValue(null)
  window.history.replaceState(null, '', '/')
  const values = new Map()
  vi.stubGlobal('localStorage', { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), clear: () => values.clear() })
  localStorage.clear()
  vi.spyOn(window, 'open').mockImplementation(() => null)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

describe('storefront flow', () => {
  it('shows the catalog and keeps WhatsApp contact available', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /manillas con historia/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /contactar a poder oculto por whatsapp/i })).toHaveAttribute('href', expect.stringContaining('wa.me/573214411674'))
  })

  it('promotes Colombian bracelets with the four collection photos', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /tejido con los colores de nuestra tierra/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ver manillas colombianas/i })).toHaveAttribute('href', '/?categoria=colombiana#catalogo')
    expect(screen.getByRole('img', { name: /corazón con la bandera de colombia/i })).toHaveAttribute('src', '/colombia/colombia-heart.jpeg')
    expect(within(screen.getByRole('region', { name: /tejido con los colores de nuestra tierra/i })).getAllByRole('img')).toHaveLength(4)
  })

  it('lists every Colombian bracelet individually at COP 20,000 with live inventory', async () => {
    loadProducts.mockResolvedValue([{ id: 'remote-1', name: 'Producto del inventario remoto', description: 'Producto de prueba', price: 12000, images: ['/products/1.1.jpeg'] }])
    render(<App />)
    await screen.findByRole('heading', { name: 'Producto del inventario remoto' })
    const colombianProducts = PRODUCTS.filter((product) => product.id.startsWith('colombia-'))
    expect(colombianProducts).toHaveLength(4)
    colombianProducts.forEach((product) => {
      const title = screen.getByRole('heading', { name: product.name })
      expect(within(title.closest('article')).getByText(/20\.000/)).toBeInTheDocument()
      expect(product.price).toBe(20000)
    })
  })

  it('adds a premade bracelet to the cart and sends the two-field order to WhatsApp', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getAllByRole('button', { name: /agregar/i })[0])
    expect(screen.getByRole('dialog', { name: 'Carrito' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nombre'), 'Ana Pérez')
    await user.type(screen.getByLabelText('Celular'), '3001234567')
    await user.click(screen.getByRole('button', { name: /continuar por whatsapp/i }))
    await waitFor(() => expect(window.open).toHaveBeenCalledWith(expect.stringContaining('wa.me/573214411674'), '_blank', 'noopener,noreferrer'))
    expect(await screen.findByText(/conecta supabase para guardar pedidos/i)).toBeInTheDocument()
    expect(localStorage.getItem('poder-oculto-cart')).toBe('[]')
  })
})

describe('category filter', () => {
  it('shows a pill per category plus "Todas", defaulting to "Todas"', async () => {
    render(<App />)
    const filters = screen.getByRole('group', { name: /filtrar por categoría/i })
    expect(within(filters).getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
    CATEGORIES.forEach((category) => expect(within(filters).getByRole('button', { name: category.nombre })).toBeInTheDocument())
  })

  it('filters the catalog by category when a pill is clicked and updates the URL', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Colombiana' }))
    expect(screen.getByRole('button', { name: 'Colombiana' })).toHaveAttribute('aria-pressed', 'true')
    PRODUCTS.filter((product) => product.categoryId === 'colombiana').forEach((product) => expect(screen.getByRole('heading', { name: product.name })).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: 'Raíz carmesí' })).not.toBeInTheDocument()
    expect(window.location.search).toBe('?categoria=colombiana')
    await user.click(screen.getByRole('button', { name: 'Todas' }))
    expect(window.location.search).toBe('')
    expect(screen.getByRole('heading', { name: 'Raíz carmesí' })).toBeInTheDocument()
  })

  it('reads the initial category from the ?categoria= URL parameter', () => {
    window.history.replaceState(null, '', '/?categoria=colombiana')
    render(<App />)
    expect(screen.getByRole('button', { name: 'Colombiana' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('heading', { name: 'Raíz carmesí' })).not.toBeInTheDocument()
  })

  it('falls back to "Todas" when the URL has an unknown category id', () => {
    window.history.replaceState(null, '', '/?categoria=inexistente')
    render(<App />)
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Raíz carmesí' })).toBeInTheDocument()
  })

  it('combines the category filter with the text search', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Clásica' }))
    await user.type(screen.getByLabelText(/buscar manillas/i), 'corazón tricolor')
    expect(screen.queryByRole('heading', { name: 'Raíz carmesí' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Corazón tricolor' })).not.toBeInTheDocument()
    expect(screen.getByText(/no encontramos piezas/i)).toBeInTheDocument()
  })
})
