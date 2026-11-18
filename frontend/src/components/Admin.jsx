import { useEffect, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Brand from './Brand'
import './admin-products.css'
import { formatPrice } from '../lib/commerce'
import { getNextProductOrder, getProductOrderUpdates, getStorageObjectPath, hasUnsavedProductOrder, isValidProductImage, moveItem } from '../lib/adminProducts'
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

function SortableProductCard({ product, onChange, onSave, onUpload, onDelete, onDeletePhoto }) {
  const [photoIndex, setPhotoIndex] = useState(0)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id })
  const photos = [...(product.producto_fotos || [])].sort((a, b) => a.orden - b.orden)
  const photo = photos[photoIndex]
  useEffect(() => setPhotoIndex((current) => Math.min(current, Math.max(photos.length - 1, 0))), [photos.length])
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 }} className="admin-product-card">
    <div className="admin-product-preview">
      {photo ? <img src={photo.url} alt={`${product.nombre}, foto ${photoIndex + 1}`} /> : <div className="admin-no-photo"><img src="/brand/mark.svg" alt="" /><span>Sin fotos</span></div>}
      {photos.length > 1 && <div className="admin-photo-controls"><button aria-label={`Foto anterior ${product.nombre}`} onClick={() => setPhotoIndex((photoIndex + photos.length - 1) % photos.length)}>‹</button><span>{photoIndex + 1} / {photos.length}</span><button aria-label={`Foto siguiente ${product.nombre}`} onClick={() => setPhotoIndex((photoIndex + 1) % photos.length)}>›</button></div>}
      {photo && <div className="admin-photo-actions"><button className="delete-photo" aria-label={`Eliminar foto ${product.nombre}`} onClick={() => onDeletePhoto(product, photo)}>Eliminar foto</button></div>}
    </div>
    <div className="admin-product-fields"><div className="admin-product-title"><button className="admin-drag-handle" aria-label={`Reordenar producto ${product.nombre}`} title="Arrastra para reordenar" {...attributes} {...listeners}>⠿</button><input aria-label={`Nombre ${product.nombre}`} value={product.nombre} onChange={(event) => onChange(product.id, 'nombre', event.target.value)} /></div>
      <label>Descripción<textarea aria-label={`Descripción ${product.nombre}`} value={product.descripcion || ''} onChange={(event) => onChange(product.id, 'descripcion', event.target.value)} /></label>
      <div className="admin-product-meta"><label>Precio COP<input aria-label={`Precio ${product.nombre}`} type="number" min="0" step="1" value={product.precio} onChange={(event) => onChange(product.id, 'precio', event.target.value)} /></label><label className="admin-available"><input aria-label={`Disponible ${product.nombre}`} type="checkbox" checked={product.disponible} onChange={(event) => onChange(product.id, 'disponible', event.target.checked)} /> Disponible</label></div>
      <div className="admin-product-actions"><label className="button button-outline button-small upload-button">＋ Agregar fotos<input aria-label={`Subir foto ${product.nombre}`} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => { onUpload(product, [...(event.target.files || [])]); event.target.value = '' }} /></label><button className="button button-dark button-small" onClick={() => onSave(product)}>Guardar</button><button className="button button-danger button-small" onClick={() => onDelete(product)}>Eliminar producto</button></div>
    </div>
  </article>
}

export function ProductsPanel({ client = supabase }) {
  const [products, setProducts] = useState([])
  const [savedOrder, setSavedOrder] = useState([])
  const orderDirty = hasUnsavedProductOrder(products, savedOrder)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showNewProduct, setShowNewProduct] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const refresh = async () => {
    setLoading(true)
    const { data, error } = await client.from('productos').select('*,producto_fotos(url,orden)').order('orden').order('id')
    setLoading(false)
    if (error) setMessage('No fue posible cargar los productos. Revisa los permisos de Supabase.')
    else {
      const loaded = data || []
      setSavedOrder(loaded.map((product) => product.id))
      if (orderDirty) {
        const byId = new Map(loaded.map((product) => [product.id, product]))
        const pendingOrder = products.map((product) => byId.get(product.id)).filter(Boolean)
        const pendingIds = new Set(pendingOrder.map((product) => product.id))
        setProducts([...pendingOrder, ...loaded.filter((product) => !pendingIds.has(product.id))])
      } else setProducts(loaded)
    }
  }
  useEffect(() => { refresh() }, [])
  const changeProduct = (id, key, value) => setProducts((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item))
  const saveProduct = async (product) => {
    const { error } = await client.from('productos').update({ nombre: product.nombre.trim(), descripcion: product.descripcion || '', precio: Number(product.precio), disponible: product.disponible }).eq('id', product.id)
    setMessage(error ? 'No se pudo guardar el producto.' : 'Cambios guardados.')
    if (!error) refresh()
  }
  const uploadFiles = async (product, files) => {
    if (!files.length) return
    if (files.some((file) => !isValidProductImage(file))) { setMessage('Elige imágenes JPG, PNG, WebP o GIF de hasta 5 MB cada una.'); return }
    setSaving(true)
    const currentOrder = (product.producto_fotos || []).reduce((max, photo) => Math.max(max, photo.orden || 0), 0)
    for (const [index, file] of files.entries()) {
      const path = `${product.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '-')}`
      const { error: uploadError } = await client.storage.from('productos').upload(path, file, { upsert: false })
      if (uploadError) { setMessage('No se pudo subir la foto. Comprueba que exista el bucket productos.'); break }
      const { data } = client.storage.from('productos').getPublicUrl(path)
      const { error } = await client.from('producto_fotos').insert({ producto_id: product.id, url: data.publicUrl, orden: currentOrder + index + 1 })
      if (error) {
        await client.storage.from('productos').remove([path])
        setMessage('La foto se subió, pero no se pudo asociar al producto.')
        break
      }
      setMessage('Foto agregada.')
    }
    setSaving(false)
    await refresh()
  }
  const deletePhoto = async (product, photo) => {
    if (!window.confirm(`¿Eliminar esta foto de “${product.nombre}”?`)) return
    const path = getStorageObjectPath(photo.url)
    if (path) {
      const { error } = await client.storage.from('productos').remove([path])
      if (error) { setMessage('No se pudo eliminar el archivo de Storage.'); return }
    }
    const { error } = await client.from('producto_fotos').delete().eq('id', photo.id)
    if (error) { setMessage('No se pudo eliminar la foto del producto.'); return }
    setProducts((current) => current.map((item) => item.id === product.id ? { ...item, producto_fotos: item.producto_fotos.filter((entry) => entry.id !== photo.id).map((entry, index) => ({ ...entry, orden: index + 1 })) } : item))
    setMessage('Foto eliminada.')
    const remaining = product.producto_fotos.filter((entry) => entry.id !== photo.id)
    await Promise.all(remaining.map((entry, index) => client.from('producto_fotos').update({ orden: index + 1 }).eq('id', entry.id)))
  }
  const deleteProduct = async (product) => {
    if (!window.confirm(`¿Eliminar “${product.nombre}” y todas sus fotos? Esta acción no se puede deshacer.`)) return
    const paths = (product.producto_fotos || []).map((photo) => getStorageObjectPath(photo.url)).filter(Boolean)
    if (paths.length) {
      const { error } = await client.storage.from('productos').remove(paths)
      if (error) { setMessage('No se pudieron eliminar sus fotos de Storage; el producto se conservó.'); return }
    }
    const { error } = await client.from('productos').delete().eq('id', product.id)
    if (error) { setMessage('No se pudo eliminar el producto.'); return }
    setProducts((current) => current.filter((item) => item.id !== product.id))
    setMessage('Producto eliminado.')
  }
  const reorderProducts = ({ active, over }) => {
    if (!over || active.id === over.id) return
    setProducts((current) => moveItem(current, active.id, over.id))
    setMessage('El orden cambió en el panel. Pulsa “Guardar orden” para aplicarlo en la tienda.')
  }
  const saveProductOrder = async () => {
    const updates = getProductOrderUpdates(products)
    const ordersById = new Map(updates.map(({ id, orden }) => [id, orden]))
    const withOrder = products.map((product) => ({ ...product, orden: ordersById.get(product.id) }))
    setSaving(true)
    const results = await Promise.all(updates.map(({ id, orden }) => client.from('productos').update({ orden }).eq('id', id)))
    setSaving(false)
    if (results.some((result) => result.error)) { setMessage('No se pudo guardar el orden. Se volverá a cargar el catálogo.'); await refresh() }
    else {
      setProducts(withOrder)
      setSavedOrder(withOrder.map((product) => product.id))
      setMessage('Orden de productos guardado y publicado en la tienda.')
    }
  }
  const createProduct = async (event) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new window.FormData(formElement)
    const files = Array.from(formElement.elements.namedItem('photos')?.files || [])
    const name = String(form.get('name') || '').trim()
    const price = Number(form.get('price'))
    if (!name) { setMessage('Escribe el nombre del producto.'); return }
    if (!Number.isInteger(price) || price < 0) { setMessage('Escribe un precio entero válido.'); return }
    if (!files.length) { setMessage('Selecciona al menos una foto.'); return }
    if (files.some((file) => !isValidProductImage(file))) { setMessage('Elige imágenes JPG, PNG, WebP o GIF de hasta 5 MB cada una.'); return }
    setSaving(true)
    const newProduct = { id: crypto.randomUUID(), nombre: name, descripcion: String(form.get('description') || '').trim(), precio: price, disponible: form.get('available') === 'on', orden: getNextProductOrder(products) }
    const { error: createError } = await client.from('productos').insert(newProduct)
    if (createError) { setSaving(false); setMessage('No se pudo crear el producto.'); return }
    let uploadError = false
    const uploadedPaths = []
    for (const [index, file] of files.entries()) {
      const path = `${newProduct.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '-')}`
      const { error } = await client.storage.from('productos').upload(path, file, { upsert: false })
      if (error) { uploadError = true; break }
      uploadedPaths.push(path)
      const { data } = client.storage.from('productos').getPublicUrl(path)
      const { error: photoError } = await client.from('producto_fotos').insert({ producto_id: newProduct.id, url: data.publicUrl, orden: index + 1 })
      if (photoError) { uploadError = true; break }
    }
    if (uploadError) {
      if (uploadedPaths.length) await client.storage.from('productos').remove(uploadedPaths)
      await client.from('productos').delete().eq('id', newProduct.id)
      setSaving(false)
      setMessage('No se pudo completar el alta. Se limpió el producto incompleto; verifica Storage y vuelve a intentar.')
      return
    }
    formElement.reset()
    setShowNewProduct(false)
    setSaving(false)
    setMessage('Producto creado.')
    await refresh()
  }
  return <section className="products-admin">
    <div className="products-admin-toolbar"><div><h2>Catálogo de productos</h2><p>Arrastra las tarjetas para cambiar el orden. Guarda los cambios para publicarlos en la tienda.</p></div><div className="products-admin-actions">{orderDirty && <button className="button button-dark" onClick={saveProductOrder} disabled={saving}>Guardar orden</button>}<button className="button button-primary" onClick={() => setShowNewProduct((visible) => !visible)} disabled={saving}>{showNewProduct ? 'Cancelar' : '+ Nuevo producto'}</button></div></div>
    {message && <p className="notice" role="status">{message}</p>}
    {showNewProduct && <form className="new-product-form" onSubmit={createProduct}><h3>Agregar producto</h3><label>Nombre *<input name="name" required maxLength="100" /></label><label>Precio (COP) *<input name="price" type="number" required min="0" step="1" /></label><label>Descripción<textarea name="description" maxLength="1000" /></label><label className="new-product-available"><input name="available" type="checkbox" defaultChecked /> Disponible en la tienda</label><label className="new-product-photos">Fotos *<input name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple required /></label><small>Selecciona una o más imágenes JPG, PNG, WebP o GIF de hasta 5 MB cada una.</small><button className="button button-dark" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Crear producto'}</button></form>}
    {loading ? <p>Cargando productos…</p> : !products.length ? <p>Aún no hay productos. Crea el primero con el botón “Nuevo producto”.</p> : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderProducts}><SortableContext items={products.map((product) => product.id)} strategy={verticalListSortingStrategy}><div className="admin-products-grid">{products.map((product) => <SortableProductCard key={product.id} product={product} onChange={changeProduct} onSave={saveProduct} onUpload={uploadFiles} onDelete={deleteProduct} onDeletePhoto={deletePhoto} />)}</div></SortableContext></DndContext>}
    {saving && <p role="status" className="admin-saving">Guardando cambios…</p>}
  </section>
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
  return <main className="admin-page"><div className="admin-heading"><Brand /><div><span className="eyebrow">GESTIÓN DE TIENDA</span><h1>Hola, Poder Oculto</h1></div><button className="button button-outline" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button></div><div className="admin-tabs" role="tablist">{[['productos', 'Productos'], ['opciones', 'Personalización'], ['pedidos', 'Pedidos']].map(([key, title]) => <button role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} key={key} onClick={() => setTab(key)}>{title}</button>)}</div>{tab === 'productos' ? <ProductsPanel client={supabase} /> : tab === 'opciones' ? <OptionsPanel /> : <OrdersPanel />}</main>
}
