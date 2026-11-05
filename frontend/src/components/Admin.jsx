import { useEffect, useState } from 'react'
import Brand from './Brand'
import { formatPrice } from '../lib/commerce'
import { hasSupabase, supabase } from '../lib/supabase'

const TABLES = [
  { key: 'tipos_piedra', label: 'Piedras', priceColumn: 'precio_unit', colorColumn: 'hex_color', paletteColumn: 'colores' },
  { key: 'bolas_metal', label: 'Bolas metálicas', priceColumn: 'precio', colorColumn: 'hex_color' },
  { key: 'dijes', label: 'Dijes', priceColumn: null },
  { key: 'colores_hilo', label: 'Colores de hilo', priceColumn: null, colorColumn: 'hex_color' },
  { key: 'tipos_tejido', label: 'Tejidos', priceColumn: null },
]

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) setError('No pudimos iniciar sesión. Revisa tus credenciales.')
  }
  return <form className="admin-login" onSubmit={submit}><Brand /><span className="eyebrow">ACCESO PRIVADO</span><h1>Panel de gestión</h1><label>Correo<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Contraseña<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="button button-primary full-width">Iniciar sesión</button>{error && <p role="alert" className="form-status error-text">{error}</p>}</form>
}

function ProductsPanel() {
  const [products, setProducts] = useState([])
  const [message, setMessage] = useState('')
  const refresh = async () => {
    const { data, error } = await supabase.from('productos').select('*,producto_fotos(url,orden)').order('orden')
    if (error) setMessage('No fue posible cargar los productos. Revisa los permisos de Supabase.')
    else setProducts(data || [])
  }
  useEffect(() => { refresh() }, [])
  const changeProduct = (id, key, value) => setProducts((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item))
  const saveProduct = async (product) => {
    const { error } = await supabase.from('productos').update({ nombre: product.nombre, descripcion: product.descripcion, precio: Number(product.precio), disponible: product.disponible }).eq('id', product.id)
    setMessage(error ? 'No se pudo guardar el producto.' : 'Cambios guardados.')
  }
  const uploadPhoto = async (product, file) => {
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setMessage('Elige una imagen de hasta 5 MB.'); return }
    const path = `${product.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '-')}`
    const { error: uploadError } = await supabase.storage.from('productos').upload(path, file, { upsert: false })
    if (uploadError) { setMessage('No se pudo subir la foto. Comprueba que exista el bucket productos.'); return }
    const { data } = supabase.storage.from('productos').getPublicUrl(path)
    const { error } = await supabase.from('producto_fotos').insert({ producto_id: product.id, url: data.publicUrl, orden: (product.producto_fotos?.length || 0) + 1 })
    setMessage(error ? 'La foto se subió, pero no se pudo asociar al producto.' : 'Foto agregada.')
    refresh()
  }
  return <div className="admin-table-wrap">{message && <p className="notice" role="status">{message}</p>}<table className="admin-table"><thead><tr><th>Producto</th><th>Precio COP</th><th>Disponible</th><th>Fotos</th><th /></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><input aria-label={`Nombre ${product.nombre}`} value={product.nombre} onChange={(event) => changeProduct(product.id, 'nombre', event.target.value)} /><textarea aria-label={`Descripción ${product.nombre}`} value={product.descripcion || ''} onChange={(event) => changeProduct(product.id, 'descripcion', event.target.value)} /></td><td><input aria-label={`Precio ${product.nombre}`} type="number" min="0" value={product.precio} onChange={(event) => changeProduct(product.id, 'precio', event.target.value)} /></td><td><input aria-label={`Disponible ${product.nombre}`} type="checkbox" checked={product.disponible} onChange={(event) => changeProduct(product.id, 'disponible', event.target.checked)} /></td><td><span>{product.producto_fotos?.length || 0}</span><label className="upload-button">Subir<input aria-label={`Subir foto ${product.nombre}`} type="file" accept="image/*" onChange={(event) => uploadPhoto(product, event.target.files?.[0])} /></label></td><td><button className="button button-outline button-small" onClick={() => saveProduct(product)}>Guardar</button></td></tr>)}</tbody></table></div>
}

function OptionsPanel() {
  const [catalogs, setCatalogs] = useState({})
  const [settings, setSettings] = useState(null)
  const [message, setMessage] = useState('')
  const refresh = async () => {
    const requests = await Promise.all([...TABLES.map(({ key }) => supabase.from(key).select('*').order('nombre')), supabase.from('config_manilla').select('*').limit(1)])
    const failed = requests.find((result) => result.error)
    if (failed) { setMessage('No fue posible cargar las opciones. Revisa la configuración de Supabase.'); return }
    setCatalogs(Object.fromEntries(TABLES.map(({ key }, index) => [key, requests[index].data || []])))
    setSettings(requests.at(-1).data?.[0] || null)
  }
  useEffect(() => { refresh() }, [])
  const updateRow = (table, id, values) => setCatalogs((current) => ({ ...current, [table]: current[table].map((row) => row.id === id ? { ...row, ...values } : row) }))
  const saveRow = async (table, row) => {
    const definition = TABLES.find((item) => item.key === table)
    const values = { nombre: row.nombre, disponible: row.disponible }
    if (definition.priceColumn) values[definition.priceColumn] = Number(row[definition.priceColumn])
    if (definition.colorColumn) values[definition.colorColumn] = row[definition.colorColumn]
    if (definition.paletteColumn) values[definition.paletteColumn] = row[definition.paletteColumn]
    const { error } = await supabase.from(table).update(values).eq('id', row.id)
    setMessage(error ? 'No se pudo guardar esta opción.' : 'Opción guardada.')
  }
  const saveSettings = async (event) => {
    event.preventDefault()
    const { error } = await supabase.from('config_manilla').update({ precio_base: Number(settings.precio_base), min_piedras: Number(settings.min_piedras), max_piedras: Number(settings.max_piedras) }).eq('id', settings.id)
    setMessage(error ? 'No se pudo guardar el precio base.' : 'Precio base y límites guardados.')
  }
  return <div className="admin-options">{message && <p className="notice" role="status">{message}</p>}
    {settings && <form className="settings-form" onSubmit={saveSettings}><h3>Configuración de la manilla</h3><label>Precio base<input type="number" min="0" value={settings.precio_base} onChange={(event) => setSettings({ ...settings, precio_base: event.target.value })} /></label><label>Mínimo de piedras<input type="number" min="1" value={settings.min_piedras} onChange={(event) => setSettings({ ...settings, min_piedras: event.target.value })} /></label><label>Máximo de piedras<input type="number" min={settings.min_piedras} value={settings.max_piedras} onChange={(event) => setSettings({ ...settings, max_piedras: event.target.value })} /></label><button className="button button-dark">Guardar ajustes</button></form>}
    {TABLES.map(({ key, label, priceColumn, colorColumn, paletteColumn }) => <section className="option-table" key={key}><h3>{label}</h3><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Nombre</th>{priceColumn && <th>Precio COP</th>}{colorColumn && <th>Color</th>}{paletteColumn && <th>Colores alternos (hex, separados por coma)</th>}<th>Disponible</th><th /></tr></thead><tbody>{(catalogs[key] || []).map((row) => <tr key={row.id}><td><input aria-label={`${label} ${row.nombre}`} value={row.nombre} onChange={(event) => updateRow(key, row.id, { nombre: event.target.value })} /></td>{priceColumn && <td><input aria-label={`Precio ${row.nombre}`} type="number" min="0" value={row[priceColumn]} onChange={(event) => updateRow(key, row.id, { [priceColumn]: event.target.value })} /></td>}{colorColumn && <td><input aria-label={`Color ${row.nombre}`} type="color" value={row[colorColumn]} onChange={(event) => updateRow(key, row.id, { [colorColumn]: event.target.value })} /></td>}{paletteColumn && <td><input aria-label={`Colores alternos ${row.nombre}`} value={(row[paletteColumn] || []).join(', ')} onChange={(event) => updateRow(key, row.id, { [paletteColumn]: event.target.value.split(',').map((color) => color.trim()).filter(Boolean) })} /></td>}<td><input aria-label={`Disponible ${row.nombre}`} type="checkbox" checked={row.disponible} onChange={(event) => updateRow(key, row.id, { disponible: event.target.checked })} /></td><td><button className="button button-outline button-small" onClick={() => saveRow(key, row)}>Guardar</button></td></tr>)}</tbody></table></div></section>)}
  </div>
}

function OrdersPanel() {
  const [orders, setOrders] = useState([])
  const [message, setMessage] = useState('')
  useEffect(() => { supabase.from('pedidos').select('*').order('created_at', { ascending: false }).then(({ data, error }) => { if (error) setMessage('No fue posible cargar los pedidos.'); else setOrders(data || []) }) }, [])
  const markContacted = async (id) => {
    const { error } = await supabase.from('pedidos').update({ estado: 'contactado' }).eq('id', id)
    if (!error) setOrders((current) => current.map((item) => item.id === id ? { ...item, estado: 'contactado' } : item))
  }
  return <div className="orders-list">{message && <p className="notice">{message}</p>}{!orders.length && !message && <p>Aún no hay pedidos registrados.</p>}{orders.map((order) => <article className="order-card" key={order.id}><div className="order-top"><div><strong>{order.nombre}</strong><span>{order.celular}</span></div><span className={`order-status ${order.estado}`}>{order.estado}</span></div><p>{new Date(order.created_at).toLocaleString('es-CO')}</p><ul>{(order.items || []).map((item, index) => <li key={`${order.id}-${index}`}><strong>{item.name} × {item.quantity} — {formatPrice(item.price * item.quantity)}</strong>{item.configuration && <small className="order-detail">{item.configuration.weave} · hilo {item.configuration.thread} · {item.configuration.stones.map((stone) => stone.name).join(', ')}{item.configuration.charmName ? ` · dije ${item.configuration.charmName}` : ''}{item.configuration.metalName ? ` · bola ${item.configuration.metalName}` : ''}</small>}</li>)}</ul><div className="order-total"><strong>{formatPrice(order.total)}</strong>{order.estado !== 'contactado' && <button className="button button-outline button-small" onClick={() => markContacted(order.id)}>Marcar contactado</button>}</div></article>)}</div>
}

export default function Admin() {
  const [session, setSession] = useState(null)
  const [tab, setTab] = useState('productos')
  const [authReady, setAuthReady] = useState(false)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, value) => { setSession(value); setAuthReady(true) })
    return () => listener.subscription.unsubscribe()
  }, [])
  if (!hasSupabase) return <main className="admin-page"><Brand /><div className="setup-card"><span className="eyebrow">CONFIGURACIÓN PENDIENTE</span><h1>Conecta Supabase</h1><p>Agrega <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en el entorno de Vercel para activar el panel y guardar pedidos. Ejecuta primero <code>supabase/schema.sql</code> en el SQL Editor.</p><a className="button button-dark" href="/">Volver a la tienda</a></div></main>
  if (!authReady) return <main className="admin-page"><p>Cargando panel…</p></main>
  if (!session) return <main className="admin-page"><a className="back-link" href="/">← Volver a la tienda</a><LoginForm /></main>
  return <main className="admin-page"><div className="admin-heading"><Brand /><div><span className="eyebrow">GESTIÓN DE TIENDA</span><h1>Hola, Poder Oculto</h1></div><button className="button button-outline" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button></div><div className="admin-tabs" role="tablist">{[['productos', 'Productos'], ['opciones', 'Personalización'], ['pedidos', 'Pedidos']].map(([key, title]) => <button role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} key={key} onClick={() => setTab(key)}>{title}</button>)}</div>{tab === 'productos' ? <ProductsPanel /> : tab === 'opciones' ? <OptionsPanel /> : <OrdersPanel />}</main>
}
