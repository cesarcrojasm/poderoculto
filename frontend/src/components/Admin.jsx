import { useEffect, useRef, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Brand from './Brand'
import './admin-products.css'
import './admin-options.css'
import { formatPrice } from '../lib/commerce'
import { getNextProductOrder, getProductOrderUpdates, getStorageObjectPath, hasUnsavedProductOrder, isValidProductImage, moveItem } from '../lib/adminProducts'
import { hasSupabase, supabase } from '../lib/supabase'

const TABLES = [
  { key: 'tipos_piedra', label: 'Piedras', addLabel: 'piedra', priceColumn: 'precio_unit', image: true, folder: 'piedras' },
  { key: 'bolas_metal', label: 'Bolas metálicas', addLabel: 'bola metálica', priceColumn: 'precio', image: true, folder: 'bolas' },
  { key: 'dijes', label: 'Dijes', addLabel: 'dije', image: true, folder: 'dijes' },
  { key: 'colores_hilo', label: 'Colores de hilo', addLabel: 'color de hilo', colorColumn: 'hex_color' },
  { key: 'tipos_tejido', label: 'Tejidos', addLabel: 'tejido' },
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

function SortableProductCard({ product, categories, onChange, onSave, onUpload, onDelete, onDeletePhoto }) {
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
      <label>Categoría<select aria-label={`Categoría ${product.nombre}`} value={product.categoria_id || ''} onChange={(event) => onChange(product.id, 'categoria_id', event.target.value || null)}><option value="">Sin categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label>
      <div className="admin-product-meta"><label>Precio COP<input aria-label={`Precio ${product.nombre}`} type="number" min="0" step="1" value={product.precio} onChange={(event) => onChange(product.id, 'precio', event.target.value)} /></label><label className="admin-available"><input aria-label={`Disponible ${product.nombre}`} type="checkbox" checked={product.disponible} onChange={(event) => onChange(product.id, 'disponible', event.target.checked)} /> Disponible</label></div>
      <div className="admin-product-actions"><label className="button button-outline button-small upload-button">＋ Agregar fotos<input aria-label={`Subir foto ${product.nombre}`} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => { onUpload(product, [...(event.target.files || [])]); event.target.value = '' }} /></label><button className="button button-dark button-small" onClick={() => onSave(product)}>Guardar</button><button className="button button-danger button-small" onClick={() => onDelete(product)}>Eliminar producto</button></div>
    </div>
  </article>
}

export function ProductsPanel({ client = supabase }) {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [savedOrder, setSavedOrder] = useState([])
  const orderDirty = hasUnsavedProductOrder(products, savedOrder)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showNewProduct, setShowNewProduct] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const refresh = async () => {
    setLoading(true)
    const [{ data, error }, { data: categoryData, error: categoryError }] = await Promise.all([
      client.from('productos').select('*,producto_fotos(url,orden)').order('orden').order('id'),
      client.from('categorias').select('id,nombre').order('nombre'),
    ])
    setLoading(false)
    if (categoryError) { setCategories([]); setMessage('No fue posible cargar categorías. Ejecuta la migración de categorías en Supabase.') }
    else setCategories(categoryData || [])
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
    const { error } = await client.from('productos').update({ nombre: product.nombre.trim(), descripcion: product.descripcion || '', precio: Number(product.precio), disponible: product.disponible, categoria_id: product.categoria_id || null }).eq('id', product.id)
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
    const newProduct = { id: crypto.randomUUID(), nombre: name, descripcion: String(form.get('description') || '').trim(), precio: price, disponible: form.get('available') === 'on', orden: getNextProductOrder(products), categoria_id: String(form.get('categoryId') || '') || null }
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
    {showNewProduct && <form className="new-product-form" onSubmit={createProduct}><h3>Agregar producto</h3><label>Nombre *<input name="name" required maxLength="100" /></label><label>Precio (COP) *<input name="price" type="number" required min="0" step="1" /></label><label>Descripción<textarea name="description" maxLength="1000" /></label><label>Categoría<select name="categoryId" defaultValue=""><option value="">Sin categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label><label className="new-product-available"><input name="available" type="checkbox" defaultChecked /> Disponible en la tienda</label><label className="new-product-photos">Fotos *<input name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple required /></label><small>Selecciona una o más imágenes JPG, PNG, WebP o GIF de hasta 5 MB cada una.</small><button className="button button-dark" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Crear producto'}</button></form>}
    {loading ? <p>Cargando productos…</p> : !products.length ? <p>Aún no hay productos. Crea el primero con el botón “Nuevo producto”.</p> : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderProducts}><SortableContext items={products.map((product) => product.id)} strategy={verticalListSortingStrategy}><div className="admin-products-grid">{products.map((product) => <SortableProductCard key={product.id} product={product} categories={categories} onChange={changeProduct} onSave={saveProduct} onUpload={uploadFiles} onDelete={deleteProduct} onDeletePhoto={deletePhoto} />)}</div></SortableContext></DndContext>}
    {saving && <p role="status" className="admin-saving">Guardando cambios…</p>}
  </section>
}

export function CategoriesPanel({ client = supabase }) {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [categoryName, setCategoryName] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const refresh = async () => {
    const [{ data: categoryData, error: categoryError }, { data: productData, error: productError }] = await Promise.all([
      client.from('categorias').select('id,nombre').order('nombre'),
      client.from('productos').select('id,categoria_id'),
    ])
    setLoading(false)
    if (categoryError || productError) { setMessage('No fue posible cargar las categorías. Revisa los permisos de Supabase.'); return }
    setCategories(categoryData || [])
    setProducts(productData || [])
  }
  useEffect(() => { refresh() }, [])
  const createCategory = async (event) => {
    event.preventDefault()
    const name = categoryName.trim()
    const id = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (!name || !id) { setMessage('Escribe un nombre válido para la categoría.'); return }
    const { error } = await client.from('categorias').insert({ id, nombre: name })
    if (error) { setMessage('No se pudo crear la categoría. Verifica que el nombre o su identificador no estén repetidos.'); return }
    setCategoryName('')
    setMessage('Categoría creada.')
    await refresh()
  }
  const saveCategory = async (category) => {
    const name = category.nombre.trim()
    if (!name) { setMessage('El nombre de la categoría no puede quedar vacío.'); return }
    const { error } = await client.from('categorias').update({ nombre: name }).eq('id', category.id)
    setMessage(error ? 'No se pudo guardar la categoría. El nombre debe ser único.' : 'Categoría guardada.')
    if (!error) await refresh()
  }
  const deleteCategory = async (category) => {
    if (!window.confirm(`¿Eliminar la categoría “${category.nombre}”? Los productos asignados quedarán sin categoría.`)) return
    const { error } = await client.from('categorias').delete().eq('id', category.id)
    if (error) { setMessage('No se pudo eliminar la categoría.'); return }
    setCategories((current) => current.filter((item) => item.id !== category.id))
    setProducts((current) => current.map((product) => product.categoria_id === category.id ? { ...product, categoria_id: null } : product))
    setMessage('Categoría eliminada. Los productos quedaron sin categoría.')
  }
  const changeCategoryName = (id, value) => setCategories((current) => current.map((category) => category.id === id ? { ...category, nombre: value } : category))
  return <section className="admin-category-manager" aria-labelledby="category-manager-title"><div><h2 id="category-manager-title">Categorías</h2><p>Organiza los productos y administra los filtros de la tienda.</p></div><form className="admin-category-create" onSubmit={createCategory}><label htmlFor="new-category-name">Nueva categoría</label><input id="new-category-name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} maxLength="60" placeholder="Nombre de categoría" required /><button className="button button-dark button-small" type="submit">Crear categoría</button></form>{message && <p className="notice" role="status">{message}</p>}{loading ? <p>Cargando categorías…</p> : categories.length ? <div className="admin-category-list">{categories.map((category) => <div className="admin-category-row" key={category.id}><label><span>{category.nombre}</span><input aria-label={`Nombre categoría ${category.nombre}`} value={category.nombre} onChange={(event) => changeCategoryName(category.id, event.target.value)} /></label><small>{products.filter((product) => product.categoria_id === category.id).length} productos</small><button className="button button-outline button-small" onClick={() => saveCategory(category)}>Guardar</button><button className="button button-danger button-small" onClick={() => deleteCategory(category)}>Eliminar</button></div>)}</div> : <p>Aún no hay categorías. Crea una para asignarla a tus productos.</p>}</section>
}

const OPTION_IMAGE_MAX_SIZE = 5 * 1024 * 1024
const cleanOptionRow = (row, definition) => {
  const values = { nombre: row.nombre.trim(), disponible: Boolean(row.disponible) }
  if (definition.priceColumn) values[definition.priceColumn] = Number(row[definition.priceColumn] || 0)
  if (definition.colorColumn) values[definition.colorColumn] = row[definition.colorColumn]
  if (definition.image) values.imagen_url = row.imagen_url || null
  return values
}
const optionRowChanged = (row, baseline, definition) => row._isNew || JSON.stringify(cleanOptionRow(row, definition)) !== JSON.stringify(cleanOptionRow(baseline, definition)) || Boolean(row._imageFile)
const imagePath = (url) => getStorageObjectPath(url)

function OptionSection({ definition, initialRows, client, onMessage }) {
  const previews = useRef(new Set())
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), [])
  const [rows, setRows] = useState(() => initialRows.map((row) => ({ ...row, _isNew: false, _deleted: false, _imageFile: null })))
  const [baseline, setBaseline] = useState(initialRows)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    setRows(initialRows.map((row) => ({ ...row, _isNew: false, _deleted: false, _imageFile: null })))
    setBaseline(initialRows)
  }, [initialRows])
  const changed = rows.some((row) => !row._deleted && optionRowChanged(row, baseline.find((item) => item.id === row.id) || {}, definition)) || rows.some((row) => row._deleted)
  const change = (id, values) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...values } : row))
  const addRow = () => setRows((current) => [...current, { id: crypto.randomUUID(), nombre: '', disponible: true, _isNew: true, _deleted: false, _imageFile: null, ...(definition.priceColumn ? { [definition.priceColumn]: 0 } : {}), ...(definition.colorColumn ? { [definition.colorColumn]: '#ffffff' } : {}), ...(definition.image ? { imagen_url: null } : {}) }])
  const removeRow = (row) => {
    if (row._isNew) { setRows((current) => current.filter((item) => item.id !== row.id)); return }
    change(row.id, { _deleted: true })
  }
  const uploadImage = async (row) => {
    if (!row._imageFile) return { url: row.imagen_url, path: null }
    const path = `personalizacion/${definition.folder}/${row.id}/${crypto.randomUUID()}-${row._imageFile.name.replace(/[^\w.-]/g, '-')}`
    const { error } = await client.storage.from('productos').upload(path, row._imageFile, { upsert: false })
    if (error) throw error
    return { url: client.storage.from('productos').getPublicUrl(path).data.publicUrl, path }
  }
  const save = async () => {
    const activeChanged = rows.filter((row) => !row._deleted && optionRowChanged(row, baseline.find((item) => item.id === row.id) || {}, definition))
    for (const row of activeChanged) {
      if (!row.nombre.trim()) { setMessage(`Completa el nombre en ${definition.label.toLocaleLowerCase('es')}.`); return }
      if (definition.priceColumn && (!Number.isInteger(Number(row[definition.priceColumn])) || Number(row[definition.priceColumn]) < 0)) { setMessage(`Escribe un precio COP entero válido para “${row.nombre}”.`); return }
      if (definition.image && !row._imageFile && !row.imagen_url) { setMessage(`Sube una imagen para “${row.nombre}” antes de guardar.`); return }
      if (row._imageFile && !isValidProductImage(row._imageFile)) { setMessage('Usa imágenes JPG, PNG, WebP o GIF de hasta 5 MB.'); return }
      if (definition.colorColumn && !/^#[\da-f]{6}$/i.test(row.hex_color || '')) { setMessage(`Usa un color hexadecimal válido para “${row.nombre}”.`); return }
    }
    setSaving(true)
    setMessage('')
    const successful = new Map()
    let failures = 0
    let cleanupWarning = false
    for (const row of rows) {
      try {
        if (row._deleted) {
          const { error } = await client.from(definition.key).delete().eq('id', row.id)
          if (error) throw error
          const oldPath = imagePath(row.imagen_url)
          if (oldPath) {
            const { error: removeError } = await client.storage.from('productos').remove([oldPath])
            if (removeError) cleanupWarning = true
          }
          successful.set(row.id, null)
          continue
        }
        if (!optionRowChanged(row, baseline.find((item) => item.id === row.id) || {}, definition)) continue
        const oldUrl = row.imagen_url
        const uploaded = await uploadImage(row)
        const values = cleanOptionRow({ ...row, imagen_url: uploaded.url }, definition)
        const result = row._isNew
          ? await client.from(definition.key).insert({ id: row.id, ...values })
          : await client.from(definition.key).update(values).eq('id', row.id)
        if (result.error) {
          if (uploaded.path) await client.storage.from('productos').remove([uploaded.path])
          throw result.error
        }
        const oldPath = imagePath(oldUrl)
        if (uploaded.path && oldPath && oldPath !== uploaded.path) {
          const { error: removeError } = await client.storage.from('productos').remove([oldPath])
          if (removeError) cleanupWarning = true
        }
        successful.set(row.id, { ...row, ...values, _isNew: false, _deleted: false, _imageFile: null, _imagePreview: null })
      } catch {
        failures += 1
      }
    }
    if (successful.size) {
      for (const id of successful.keys()) {
        const preview = rows.find((row) => row.id === id)?._imagePreview
        if (preview) { URL.revokeObjectURL(preview); previews.current.delete(preview) }
      }
      const committed = [...successful.values()].filter(Boolean)
      setBaseline((current) => {
        const existing = current.flatMap((row) => {
          if (!successful.has(row.id)) return [row]
          const saved = successful.get(row.id)
          return saved ? [{ id: saved.id, ...cleanOptionRow(saved, definition) }] : []
        })
        return [...existing, ...committed.filter((row) => !current.some((saved) => saved.id === row.id)).map((row) => ({ id: row.id, ...cleanOptionRow(row, definition) }))]
      })
      setRows((current) => current.flatMap((row) => successful.has(row.id) ? (successful.get(row.id) ? [successful.get(row.id)] : []) : [row]))
    }
    setSaving(false)
    setMessage(failures ? `${failures} cambio(s) no se pudieron guardar; puedes corregirlos e intentarlo de nuevo.${cleanupWarning ? ' No se pudo limpiar algún archivo anterior de Storage.' : ''}` : `Cambios guardados en ${definition.label.toLocaleLowerCase('es')}.${cleanupWarning ? ' No se pudo limpiar algún archivo anterior de Storage.' : ''}`)
    if (!failures) onMessage(`Cambios guardados en ${definition.label.toLocaleLowerCase('es')}.`)
  }
  const colorInput = (row) => <div className="thread-color-input"><label className="thread-color-swatch" style={{ '--thread-color': row.hex_color }} title="Elegir color"><input aria-label={`Selector de color ${row.nombre || 'nuevo'}`} type="color" value={/^#[\da-f]{6}$/i.test(row.hex_color || '') ? row.hex_color : '#ffffff'} onChange={(event) => change(row.id, { hex_color: event.target.value })} /></label><input aria-label={`Hex ${row.nombre || 'nuevo'}`} value={row.hex_color || ''} maxLength="7" placeholder="#9b2928" onChange={(event) => change(row.id, { hex_color: event.target.value })} /></div>
  const imageInput = (row) => {
    const preview = row._imagePreview || row.imagen_url
    return <div className="option-image-control">{preview ? <img src={preview} alt={`Imagen ${row.nombre || 'nueva'}`} /> : <span>Sin imagen</span>}<label className="button button-outline button-small">{row.imagen_url || row._imageFile ? 'Reemplazar imagen' : 'Subir imagen'}<input aria-label={`Imagen ${row.nombre || 'nuevo'}`} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) { if (row._imagePreview) { URL.revokeObjectURL(row._imagePreview); previews.current.delete(row._imagePreview) } const url = URL.createObjectURL(file); previews.current.add(url); change(row.id, { _imageFile: file, _imagePreview: url }) }; event.target.value = '' }} /></label>{(row.imagen_url || row._imageFile) && <button className="button button-danger button-small" type="button" onClick={() => { if (row._imagePreview) { URL.revokeObjectURL(row._imagePreview); previews.current.delete(row._imagePreview) }; change(row.id, { imagen_url: null, _imageFile: null, _imagePreview: null }) }}>Quitar imagen</button>}</div>
  }
  return <section className="option-table" aria-labelledby={`options-${definition.key}`}><div className="option-section-heading"><h3 id={`options-${definition.key}`}>{definition.label}</h3><button className="button button-outline button-small" type="button" onClick={addRow}>+ Agregar {definition.addLabel}</button></div>{message && <p className="form-status" role="status">{message}</p>}<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Nombre</th>{definition.priceColumn && <th>Precio COP</th>}{definition.colorColumn && <th>Color</th>}{definition.image && <th>Imagen</th>}<th>Disponible</th><th>Acción</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className={`${row._isNew ? 'option-new-row ' : ''}${row._deleted ? 'option-deleted-row' : ''}`}><td><input aria-label={`${definition.label} ${row.nombre || 'nuevo'}`} value={row.nombre} disabled={row._deleted} onChange={(event) => change(row.id, { nombre: event.target.value })} /></td>{definition.priceColumn && <td><input aria-label={`Precio ${row.nombre || 'nuevo'}`} type="number" min="0" value={row[definition.priceColumn]} disabled={row._deleted} onChange={(event) => change(row.id, { [definition.priceColumn]: event.target.value })} /></td>}{definition.colorColumn && <td>{colorInput(row)}</td>}{definition.image && <td>{imageInput(row)}</td>}<td><input aria-label={`Disponible ${row.nombre || 'nuevo'}`} type="checkbox" checked={Boolean(row.disponible)} disabled={row._deleted} onChange={(event) => change(row.id, { disponible: event.target.checked })} /></td><td>{row._deleted ? <button className="button button-outline button-small" type="button" onClick={() => change(row.id, { _deleted: false })}>Deshacer</button> : <button className="button button-danger button-small" type="button" onClick={() => removeRow(row)}>Eliminar</button>}</td></tr>)}</tbody></table></div>{changed && <button className="button button-dark option-save" type="button" onClick={save} disabled={saving}>{saving ? 'Guardando…' : `Guardar ${definition.label.toLocaleLowerCase('es')}`}</button>}</section>
}

export function OptionsPanel({ client = supabase }) {
  const [catalogs, setCatalogs] = useState({})
  const [settings, setSettings] = useState(null)
  const [message, setMessage] = useState('')
  const refresh = async () => {
    const requests = await Promise.all([...TABLES.map(({ key }) => client.from(key).select('*').order('nombre')), client.from('config_manilla').select('*').limit(1)])
    const failed = requests.find((result) => result.error)
    if (failed) { setMessage('No fue posible cargar las opciones. Revisa la configuración de Supabase.'); return }
    setCatalogs(Object.fromEntries(TABLES.map(({ key }, index) => [key, requests[index].data || []])))
    setSettings(requests.at(-1).data?.[0] || null)
  }
  useEffect(() => { refresh() }, [])
  const saveSettings = async (event) => {
    event.preventDefault()
    const { error } = await client.from('config_manilla').update({ precio_base: Number(settings.precio_base), min_piedras: Number(settings.min_piedras), max_piedras: Number(settings.max_piedras) }).eq('id', settings.id)
    setMessage(error ? 'No se pudo guardar el precio base.' : 'Precio base y límites guardados.')
  }
  return <div className="admin-options">{message && <p className="notice" role="status">{message}</p>}
    {settings && <form className="settings-form" onSubmit={saveSettings}><h3>Configuración de la manilla</h3><label>Precio base<input type="number" min="0" value={settings.precio_base} onChange={(event) => setSettings({ ...settings, precio_base: event.target.value })} /></label><label>Mínimo de piedras<input type="number" min="1" value={settings.min_piedras} onChange={(event) => setSettings({ ...settings, min_piedras: event.target.value })} /></label><label>Máximo de piedras<input type="number" min={settings.min_piedras} value={settings.max_piedras} onChange={(event) => setSettings({ ...settings, max_piedras: event.target.value })} /></label><button className="button button-dark">Guardar ajustes</button></form>}
    {TABLES.map((definition) => <OptionSection key={definition.key} definition={definition} initialRows={catalogs[definition.key] || []} client={client} onMessage={setMessage} />)}
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
  return <main className="admin-page"><div className="admin-heading"><Brand /><div><span className="eyebrow">GESTIÓN DE TIENDA</span><h1>Hola, Poder Oculto</h1></div><button className="button button-outline" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button></div><div className="admin-tabs" role="tablist">{[['productos', 'Productos'], ['categorias', 'Categorías'], ['opciones', 'Personalización'], ['pedidos', 'Pedidos']].map(([key, title]) => <button role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} key={key} onClick={() => setTab(key)}>{title}</button>)}</div>{tab === 'productos' ? <ProductsPanel client={supabase} /> : tab === 'categorias' ? <CategoriesPanel client={supabase} /> : tab === 'opciones' ? <OptionsPanel /> : <OrdersPanel />}</main>
}
