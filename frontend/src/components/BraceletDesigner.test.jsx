import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BraceletDesigner from './BraceletDesigner'

afterEach(cleanup)

describe('bracelet designer', () => {
  it('enables adding a design once the minimum stones are selected and calculates options', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<BraceletDesigner onAdd={onAdd} />)
    const stoneButton = screen.getByRole('button', { name: /howlita/i })
    await user.click(stoneButton)
    await user.click(stoneButton)
    await user.click(stoneButton)
    const addButton = screen.getByRole('button', { name: /agregar mi diseño al carrito/i })
    expect(addButton).toBeEnabled()
    await user.selectOptions(screen.getByLabelText('Bola metálica'), 'plata')
    expect(screen.getByText(/29\.500/)).toBeInTheDocument()
    await user.click(addButton)
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ stones: expect.arrayContaining([expect.objectContaining({ name: 'Howlita' })]), metalName: 'Plata' }), 29500)
  })

  it('cycles the available color on an individual stone', async () => {
    const user = userEvent.setup()
    render(<BraceletDesigner onAdd={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /howlita/i }))
    const colorButton = screen.getByRole('button', { name: 'Cambiar color piedra 1' })
    expect(colorButton.style.getPropertyValue('--swatch')).toBe('#e7e0d4')
    await user.click(colorButton)
    expect(colorButton.style.getPropertyValue('--swatch')).toBe('#8cb9c2')
  })
})
