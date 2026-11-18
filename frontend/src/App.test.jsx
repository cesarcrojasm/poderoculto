import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./lib/supabase', () => ({
  hasSupabase: false,
  supabase: null,
  loadProducts: vi.fn().mockResolvedValue(null),
  loadDesignerOptions: vi.fn().mockResolvedValue(null),
  saveOrder: vi.fn().mockResolvedValue({ saved: false, reason: 'demo' }),
}))

import App from './App'

beforeEach(() => {
  const values = new Map()
  vi.stubGlobal('localStorage', { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), clear: () => values.clear() })
  localStorage.clear()
  vi.spyOn(window, 'open').mockImplementation(() => null)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('storefront flow', () => {
  it('shows the catalog and keeps WhatsApp contact available', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /manillas con historia/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /contactar a poder oculto por whatsapp/i })).toHaveAttribute('href', expect.stringContaining('wa.me/573214411674'))
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
