import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OptionsPanel } from './Admin'

const tables = ['tipos_piedra', 'bolas_metal', 'dijes', 'colores_hilo', 'tipos_tejido']
const database = { rows: {}, config: [], storage: new Set(), uploads: [] }

function makeClient() {
  return {
    from(table) {
      let operation = 'select'
      let values
      const filters = {}
      const builder = {
        select() { operation = 'select'; return this },
        order() { return this },
        limit() { return this },
        insert(input) { operation = 'insert'; values = input; return this },
        update(input) { operation = 'update'; values = input; return this },
        delete() { operation = 'delete'; return this },
        eq(key, value) { filters[key] = value; return this },
        then(resolve, reject) {
          let data = null
          let error = null
          const rows = table === 'config_manilla' ? database.config : database.rows[table] || []
          if (operation === 'select') data = [...rows]
          if (operation === 'insert') rows.push(values)
          if (operation === 'update') Object.assign(rows.find((row) => row.id === filters.id), values)
          if (operation === 'delete') database.rows[table] = rows.filter((row) => row.id !== filters.id)
          return Promise.resolve({ data, error }).then(resolve, reject)
        },
      }
      return builder
    },
    storage: { from: (bucket) => ({
      upload: async (path) => { database.uploads.push({ bucket, path }); database.storage.add(path); return { error: null } },
      getPublicUrl: (path) => ({ data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/productos/${path}` } }),
      remove: async (paths) => { paths.forEach((path) => database.storage.delete(path)); return { error: null } },
    }) },
  }
}

beforeEach(() => {
  database.rows = {
    tipos_piedra: [{ id: 'howlita', nombre: 'Howlita', precio_unit: 2500, imagen_url: 'https://project.supabase.co/storage/v1/object/public/productos/personalizacion/piedras/old.webp', disponible: true }],
    bolas_metal: [{ id: 'plata', nombre: 'Plata', precio: 4000, imagen_url: 'https://project.supabase.co/storage/v1/object/public/productos/personalizacion/bolas/plata.webp', disponible: true }],
    dijes: [{ id: 'corazon', nombre: 'Corazón', precio: 10000, imagen_url: 'https://project.supabase.co/storage/v1/object/public/productos/personalizacion/dijes/corazon.webp', disponible: true }],
    colores_hilo: [{ id: 'negro', nombre: 'Negro', hex_color: '#282522', disponible: true }],
    tipos_tejido: [{ id: 'clasico', nombre: 'Macramé clásico', disponible: true }],
  }
  database.config = [{ id: 'config', precio_base: 18000, min_piedras: 3, max_piedras: 10 }]
  database.storage = new Set()
  database.uploads = []
  vi.stubGlobal('crypto', { randomUUID: () => 'new-option-id' })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('admin personalization options', () => {
  it('stages and saves edits, then replaces and removes the previous image', async () => {
    const user = userEvent.setup()
    render(<OptionsPanel client={makeClient()} />)
    const section = screen.getByRole('region', { name: 'Piedras' })
    await within(section).findByLabelText('Piedras Howlita')
    expect(within(section).queryByRole('button', { name: 'Guardar piedras' })).not.toBeInTheDocument()
    const nameInput = within(section).getByLabelText('Piedras Howlita')
    await user.clear(nameInput)
    await user.type(nameInput, 'Howlita clara')
    await user.upload(section.querySelector('input[type="file"]'), new File(['image'], 'howlita.png', { type: 'image/png' }))
    const saveButton = await within(section).findByRole('button', { name: 'Guardar piedras' })
    await user.click(saveButton)
    await waitFor(() => expect(database.rows.tipos_piedra[0].nombre).toBe('Howlita clara'))
    expect(database.rows.tipos_piedra[0].imagen_url).toContain('personalizacion/piedras/howlita/')
    expect(database.storage.has('personalizacion/piedras/howlita/old.webp')).toBe(false)
    expect(database.uploads).toHaveLength(1)
    expect(within(section).queryByRole('button', { name: 'Guardar piedras' })).not.toBeInTheDocument()
  })

  it('edits charm prices and defaults newly added charms to 10000', async () => {
    const user = userEvent.setup()
    render(<OptionsPanel client={makeClient()} />)
    const section = screen.getByRole('region', { name: 'Dijes' })
    const charmPrice = await within(section).findByLabelText('Precio Corazón')
    expect(charmPrice).toHaveValue(10000)
    await user.clear(charmPrice)
    await user.type(charmPrice, '12000')
    await user.click(within(section).getByRole('button', { name: 'Guardar dijes' }))
    await waitFor(() => expect(database.rows.dijes[0].precio).toBe(12000))
    await user.click(within(section).getByRole('button', { name: '+ Agregar dije' }))
    expect(within(section).getByLabelText('Precio nuevo')).toHaveValue(10000)
    await user.type(within(section).getByLabelText('Dijes nuevo'), 'Cruz nueva')
    await user.upload(within(section).getByLabelText('Imagen Cruz nueva'), new File(['image'], 'cruz.png', { type: 'image/png' }))
    await user.click(within(section).getByRole('button', { name: 'Guardar dijes' }))
    await waitFor(() => expect(database.rows.dijes).toHaveLength(2))
    expect(database.rows.dijes[1]).toMatchObject({ nombre: 'Cruz nueva', precio: 10000 })
  })

  it('keeps deletions pending until section save and supports undo', async () => {
    const user = userEvent.setup()
    render(<OptionsPanel client={makeClient()} />)
    const section = screen.getByRole('region', { name: 'Tejidos' })
    await within(section).findByLabelText('Tejidos Macramé clásico')
    await user.click(within(section).getByRole('button', { name: 'Eliminar' }))
    expect(database.rows.tipos_tejido).toHaveLength(1)
    expect(within(section).getByRole('button', { name: 'Deshacer' })).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'Deshacer' }))
    expect(within(section).queryByRole('button', { name: 'Guardar tejidos' })).not.toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'Eliminar' }))
    await user.click(within(section).getByRole('button', { name: 'Guardar tejidos' }))
    await waitFor(() => expect(database.rows.tipos_tejido).toHaveLength(0))
  })

  it('adds an inline color row and exposes a swatch plus editable hexadecimal value', async () => {
    const user = userEvent.setup()
    render(<OptionsPanel client={makeClient()} />)
    const section = screen.getByRole('region', { name: 'Colores de hilo' })
    await within(section).findByLabelText('Hex Negro')
    expect(within(section).getByLabelText('Selector de color Negro')).toHaveValue('#282522')
    await user.clear(within(section).getByLabelText('Hex Negro'))
    await user.type(within(section).getByLabelText('Hex Negro'), '#112233')
    expect(within(section).getByRole('button', { name: 'Guardar colores de hilo' })).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: /agregar color de hilo/i }))
    expect(within(section).getByLabelText('Colores de hilo nuevo')).toHaveValue('')
    expect(within(section).getByLabelText('Disponible nuevo')).toBeChecked()
    expect(within(section).getByRole('button', { name: 'Guardar colores de hilo' })).toBeInTheDocument()
  })

  it('requires images for new image-backed options before saving', async () => {
    const user = userEvent.setup()
    render(<OptionsPanel client={makeClient()} />)
    const section = screen.getByRole('region', { name: 'Bolas metálicas' })
    await within(section).findByLabelText('Bolas metálicas Plata')
    await user.click(within(section).getByRole('button', { name: /agregar bola metálica/i }))
    await user.type(within(section).getByLabelText('Bolas metálicas nuevo'), 'Bronce')
    await user.click(within(section).getByRole('button', { name: 'Guardar bolas metálicas' }))
    expect(await within(section).findByRole('status')).toHaveTextContent(/sube una imagen/i)
    expect(database.rows.bolas_metal).toHaveLength(1)
  })
})
