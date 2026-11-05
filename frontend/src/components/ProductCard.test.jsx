import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProductCard from './ProductCard'
import { PRODUCTS } from '../data/catalog'

afterEach(cleanup)

describe('product card', () => {
  it('changes between product photos and adds the product', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<ProductCard product={PRODUCTS[0]} onAdd={onAdd} />)
    expect(screen.getByRole('img', { name: 'Raíz carmesí' })).toHaveAttribute('src', '/products/1.1.jpeg')
    await user.click(screen.getByRole('button', { name: 'Foto siguiente' }))
    expect(screen.getByRole('img', { name: 'Raíz carmesí' })).toHaveAttribute('src', '/products/1.2.jpeg')
    await user.click(screen.getByRole('button', { name: /agregar/i }))
    expect(onAdd).toHaveBeenCalledWith(PRODUCTS[0])
  })
})
