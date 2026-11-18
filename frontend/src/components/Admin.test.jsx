import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { hasSupabase } from '../lib/supabase'
import Admin from './Admin'

afterEach(cleanup)

describe('admin setup', () => {
  it('shows setup guidance or the login panel according to configured Supabase credentials', async () => {
    render(<Admin />)
    if (hasSupabase) {
      expect(await screen.findByRole('heading', { name: 'Panel de gestión' })).toBeInTheDocument()
    } else {
      expect(screen.getByRole('heading', { name: 'Conecta Supabase' })).toBeInTheDocument()
      expect(screen.getByText(/VITE_SUPABASE_URL/)).toBeInTheDocument()
    }
  })
})
