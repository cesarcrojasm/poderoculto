import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = url && anonKey ? createClient(url, anonKey) : null
export const hasSupabase = Boolean(supabase)

export async function loadProducts() {
  if (!supabase) return null
  const { data, error } = await supabase.from('productos').select('id,nombre,descripcion,precio,disponible,producto_fotos(url,orden)').eq('disponible', true).order('orden').order('id')
  if (error) throw error
  return data.map((row) => ({
    id: String(row.id), name: row.nombre, description: row.descripcion || '', price: Number(row.precio),
    images: [...(row.producto_fotos || [])].sort((a, b) => a.orden - b.orden).map((photo) => photo.url),
  }))
}

export async function saveOrder(order) {
  if (!supabase) return { saved: false, reason: 'demo' }
  const { error } = await supabase.from('pedidos').insert({ nombre: order.name, celular: order.phone, items: order.items, total: order.total })
  if (error) throw error
  return { saved: true }
}

export async function loadDesignerOptions() {
  if (!supabase) return null
  const queries = [
    supabase.from('config_manilla').select('*').limit(1),
    ...['tipos_piedra', 'colores_hilo', 'tipos_tejido', 'dijes', 'bolas_metal'].map((table) => supabase.from(table).select('*').eq('disponible', true)),
  ]
  const results = await Promise.all(queries)
  const failure = results.find((result) => result.error)
  if (failure) throw failure.error
  const [config, stones, threads, weaves, charms, metals] = results.map((result) => result.data)
  const settings = config[0]
  return {
    config: { basePrice: Number(settings.precio_base), minStones: settings.min_piedras, maxStones: settings.max_piedras },
    stones: stones.map((stone) => ({ id: stone.id, name: stone.nombre, price: Number(stone.precio_unit), color: stone.hex_color, colors: stone.colores || [stone.hex_color] })),
    threads: threads.map((thread) => ({ name: thread.nombre, color: thread.hex_color })),
    weaves: weaves.map((weave) => weave.nombre),
    charms: charms.map((charm) => ({ id: charm.id, name: charm.nombre, icon: charm.icono || '✧' })),
    metals: metals.map((metal) => ({ id: metal.id, name: metal.nombre, price: Number(metal.precio), color: metal.hex_color })),
  }
}
