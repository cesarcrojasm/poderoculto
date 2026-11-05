import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Admin from './Admin'

afterEach(cleanup)

describe('admin setup', () => {
  it('explains Supabase setup when the project has no credentials', () => {
    render(<Admin />)
    expect(screen.getByRole('heading', { name: 'Conecta Supabase' })).toBeInTheDocument()
    expect(screen.getByText(/VITE_SUPABASE_URL/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /volver a la tienda/i })).toHaveAttribute('href', '/')
  })
})
