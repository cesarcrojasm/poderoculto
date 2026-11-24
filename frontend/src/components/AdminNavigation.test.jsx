import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Admin from './Admin'

const { supabase } = vi.hoisted(() => {
  const makeQuery = () => ({
    select() { return this },
    order() { return this },
    then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject) },
  })
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'admin' } } } }),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        signOut: vi.fn(),
      },
      from: vi.fn(makeQuery),
    },
  }
})

vi.mock('../lib/supabase', () => ({ hasSupabase: true, supabase }))
vi.mock('./AdminClientsPanel', () => ({ default: () => <section>Clients panel mounted</section> }))
vi.mock('./AdminQuotesPanel', () => ({ default: ({ onRegisterSale }) => <section>Quotes panel mounted<button onClick={() => onRegisterSale({ id: 'q1', concepto: 'Quote', items: [] })}>Registrar venta</button></section> }))
vi.mock('./AdminSalesPanel', () => ({ default: ({ initialQuote }) => <section>Balance panel mounted{initialQuote && <span>Sale quote {initialQuote.id}</span>}</section> }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('admin feature navigation', () => {
  it('routes quote conversion through the authenticated admin shell into Balance', async () => {
    const user = userEvent.setup()
    render(<Admin />)
    await user.click(await screen.findByRole('tab', { name: 'Cotizaciones' }))
    await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
    expect(screen.getByRole('tab', { name: 'Balance' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Sale quote q1')).toBeInTheDocument()
  })

  it('opens the customer and quote tabs in the authenticated admin shell', async () => {
    const user = userEvent.setup()
    render(<Admin />)
    await user.click(await screen.findByRole('tab', { name: 'Clientes' }))
    expect(screen.getByText('Clients panel mounted')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Clientes' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'Cotizaciones' }))
    expect(screen.getByText('Quotes panel mounted')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Cotizaciones' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: 'Pedidos' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Balance' }))
    expect(screen.getByText('Balance panel mounted')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Balance' })).toHaveAttribute('aria-selected', 'true')
  })
})
