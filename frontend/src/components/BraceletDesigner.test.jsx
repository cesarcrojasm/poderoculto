import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BraceletDesigner from './BraceletDesigner'
import { makeOrderMessage } from '../lib/commerce'
import { createDesignPng, downloadDesignPng } from '../lib/shareDesign'

vi.mock('../lib/shareDesign', () => ({ createDesignPng: vi.fn(), downloadDesignPng: vi.fn() }))

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
beforeEach(() => { createDesignPng.mockReset(); downloadDesignPng.mockReset() })

describe('bracelet designer', () => {
  it('adds centered stones, charm, and metal and calculates the configured price', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<BraceletDesigner onAdd={onAdd} />)
    const stoneButton = screen.getByRole('button', { name: /howlita/i })
    await user.click(stoneButton)
    await user.click(stoneButton)
    await user.click(stoneButton)
    await user.selectOptions(screen.getByLabelText('Dije'), 'corazon')
    await user.selectOptions(screen.getByLabelText('Bola metálica'), 'plata')
    expect(screen.getByText(/29\.500/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /agregar mi diseño al carrito/i }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      stones: expect.arrayContaining([expect.objectContaining({ name: 'Howlita', position: 0.5 })]),
      charm: 'corazon', charmPosition: 0.5, metal: 'plata', metalPosition: 0.5,
    }), 29500)
    expect(onAdd.mock.calls[0][0].stones).toHaveLength(3)
    expect(onAdd.mock.calls[0][0].stones.every((stone) => stone.position === 0.5)).toBe(true)
  })

  it('edits and removes a stone from the preview editor', async () => {
    const user = userEvent.setup()
    render(<BraceletDesigner onAdd={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /howlita/i }))
    await user.click(screen.getByRole('button', { name: /piedra 1: howlita/i }))
    const colorButton = screen.getByRole('button', { name: 'Cambiar color piedra seleccionada' })
    expect(colorButton.style.getPropertyValue('--swatch')).toBe('#e7e0d4')
    await user.click(colorButton)
    expect(screen.queryByRole('group', { name: 'Editar piedra seleccionada' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /piedra 1: howlita/i }))
    expect(screen.getByRole('button', { name: 'Cambiar color piedra seleccionada' }).style.getPropertyValue('--swatch')).toBe('#8cb9c2')
    await user.selectOptions(screen.getByLabelText('Tipo de piedra seleccionada'), 'amatista')
    expect(screen.getByRole('button', { name: /piedra 1: amatista/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /piedra 1: amatista/i }))
    await user.click(screen.getByRole('button', { name: 'Quitar piedra' }))
    expect(screen.queryByRole('button', { name: /piedra 1:/i })).not.toBeInTheDocument()
  })

  it('moves pieces by pointer and updates their left-to-right order with minimum spacing', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<BraceletDesigner onAdd={onAdd} />)
    await user.click(screen.getByRole('button', { name: /howlita/i }))
    await user.click(screen.getByRole('button', { name: /amatista/i }))
    await user.click(screen.getByRole('button', { name: /cuarzo rosa/i }))
    const svg = screen.getByRole('group', { name: 'Manilla con 3 piedras' })
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 360, height: 270, right: 360, bottom: 270, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent(screen.getByRole('button', { name: /piedra 3: cuarzo rosa/i }), new MouseEvent('pointerdown', { bubbles: true, clientX: 180, clientY: 208 }))
    fireEvent(svg, new MouseEvent('pointermove', { bubbles: true, clientX: 60, clientY: 208 }))
    fireEvent(svg, new MouseEvent('pointerup', { bubbles: true, clientX: 60, clientY: 208 }))
    await user.click(screen.getByRole('button', { name: /agregar mi diseño al carrito/i }))
    const design = onAdd.mock.calls[0][0]
    expect(design.stones.map((stone) => stone.instanceId)).toEqual(['stone-3', 'stone-1', 'stone-2'])
    expect(design.stones.map((stone) => stone.name)).toEqual(['Cuarzo rosa', 'Howlita', 'Amatista'])
    expect(design.stones[1].position - design.stones[0].position).toBeGreaterThanOrEqual(0.075)
    const message = makeOrderMessage([{ type: 'custom', name: 'Manilla personalizada', price: 30000, quantity: 1, configuration: design }], 30000)
    expect(message.indexOf('Cuarzo rosa, Howlita, Amatista')).toBeGreaterThan(-1)
  })

  it('moves a focused bracelet piece with the keyboard', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<BraceletDesigner onAdd={onAdd} />)
    const stoneButton = screen.getByRole('button', { name: /howlita/i })
    await user.click(stoneButton)
    await user.click(stoneButton)
    await user.click(stoneButton)
    const stone = screen.getByRole('button', { name: /piedra 1: howlita/i })
    stone.focus()
    await user.keyboard('{ARROWRIGHT}')
    await user.click(screen.getByRole('button', { name: /agregar mi diseño al carrito/i }))
    expect(onAdd.mock.calls[0][0].stones.find((item) => item.instanceId === 'stone-1').position).toBeGreaterThan(0.5)
  })

  it('shares a PNG through the native share sheet when supported', async () => {
    const user = userEvent.setup()
    const image = new File(['png'], 'bracelet.png', { type: 'image/png' })
    createDesignPng.mockResolvedValue(image)
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { canShare: vi.fn().mockReturnValue(true), share })
    render(<BraceletDesigner onAdd={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /compartir mi diseño/i }))
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [image], title: 'Mi manilla personalizada' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/diseño compartido/i)
  })

  it('downloads the design image and opens WhatsApp when image sharing is unavailable', async () => {
    const user = userEvent.setup()
    const image = new File(['png'], 'bracelet.png', { type: 'image/png' })
    createDesignPng.mockResolvedValue(image)
    vi.stubGlobal('navigator', {})
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<BraceletDesigner onAdd={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /compartir mi diseño/i }))
    expect(downloadDesignPng).toHaveBeenCalledWith(image)
    expect(open).toHaveBeenCalledWith(expect.stringContaining('wa.me/573214411674'), '_blank', 'noopener,noreferrer')
    expect(await screen.findByRole('status')).toHaveTextContent(/adjunta la imagen/i)
  })
})
