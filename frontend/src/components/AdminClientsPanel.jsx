import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { validateCustomer } from '../lib/cotizaciones'
import './admin-clientes.css'

export function ClientsPanel({ client = supabase }) {
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ nombre: '', celular: '', direccion: '' })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const createInFlight = useRef(false)
  const createCustomerId = useRef(null)

  const refresh = async () => {
    try {
      const { data, error } = await client.from('clientes').select('*').order('nombre')
      if (error) { setMessage('No fue posible cargar los clientes.'); return }
      setCustomers(data || [])
    } catch {
      setMessage('No fue posible cargar los clientes.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { refresh() }, [])

  const updateCustomer = (id, key, value) => setCustomers((current) => current.map((customer) => customer.id === id ? { ...customer, [key]: value } : customer))
  const saveCustomer = async (customer) => {
    const result = validateCustomer(customer)
    if (!result.valid) { setMessage(result.message); return }
    try {
      const { error } = await client.from('clientes').update(result.value).eq('id', customer.id)
      if (error) { setMessage('No se pudo guardar el cliente.'); return }
      setMessage('Cliente guardado.')
      await refresh()
    } catch {
      setMessage('No se pudo guardar el cliente.')
    }
  }
  const createCustomer = async (event) => {
    event.preventDefault()
    const result = validateCustomer(form)
    if (!result.valid) { setMessage(result.message); return }
    if (createInFlight.current) return
    createInFlight.current = true
    setSaving(true)
    try {
      const id = createCustomerId.current || crypto.randomUUID()
      createCustomerId.current = id
      let response
      try {
        response = await client.from('clientes').insert({ id, ...result.value }).select('*').single()
      } catch (error) {
        response = { error }
      }
      let customer = response.data
      if (response.error || !customer?.id) {
        let lookup
        try {
          lookup = await client.from('clientes').select('*').eq('id', id).maybeSingle()
        } catch (error) {
          lookup = { error }
        }
        if (lookup.error || !lookup.data) { setMessage('No se pudo crear el cliente.'); return }
        customer = lookup.data
      }
      setCustomers((current) => [...current.filter((item) => item.id !== id), customer].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      createCustomerId.current = null
      setForm({ nombre: '', celular: '', direccion: '' })
      setShowCreate(false)
      setMessage('Cliente creado.')
    } finally {
      createInFlight.current = false
      setSaving(false)
    }
  }
  const deleteCustomer = async (customer) => {
    if (!window.confirm(`¿Eliminar a ${customer.nombre}? Sus cotizaciones también se eliminarán. Esta acción no se puede deshacer.`)) return
    try {
      const { data: quotes, error: quoteError } = await client.from('cotizaciones').select('pdf_url').eq('cliente_id', customer.id)
      if (quoteError) { setMessage('No se pudieron preparar los archivos de las cotizaciones para eliminarlos.'); return }
      const paths = (quotes || []).map((quote) => {
        if (!quote.pdf_url) return null
        try {
          const marker = '/storage/v1/object/public/cotizaciones/'
          const pathname = new URL(quote.pdf_url).pathname
          const index = pathname.indexOf(marker)
          return index < 0 ? null : decodeURIComponent(pathname.slice(index + marker.length))
        } catch { return null }
      }).filter(Boolean)
      const { error } = await client.from('clientes').delete().eq('id', customer.id)
      if (error) { setMessage('No se pudo eliminar el cliente.'); return }
      setCustomers((current) => current.filter((item) => item.id !== customer.id))
      if (paths.length) {
        try {
          const { error: storageError } = await client.storage.from('cotizaciones').remove(paths)
          if (storageError) { setMessage('Cliente y cotizaciones eliminados, pero no se pudieron eliminar algunos PDF públicos.'); return }
        } catch {
          setMessage('Cliente y cotizaciones eliminados, pero no se pudieron eliminar algunos PDF públicos.')
          return
        }
      }
      setMessage('Cliente y cotizaciones eliminados.')
    } catch {
      setMessage('No se pudo eliminar el cliente.')
    }
  }
  const visibleCustomers = customers.filter((customer) => `${customer.nombre} ${customer.celular}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')))

  return <section className="admin-clients" aria-labelledby="clients-title">
    <div className="admin-clients-toolbar"><div><h2 id="clients-title">Clientes</h2><p>Administra los datos de contacto para tus cotizaciones.</p></div><button className="button button-primary" onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Cancelar' : '+ Nuevo cliente'}</button></div>
    <label className="admin-client-search">Buscar por nombre o celular<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente" /></label>
    {message && <p className="notice" role="status">{message}</p>}
    {showCreate && <form className="admin-client-form" onSubmit={createCustomer}><h3>Nuevo cliente</h3><label>Nombre *<input value={form.nombre} maxLength="100" onChange={(event) => setForm({ ...form, nombre: event.target.value })} required /></label><label>Celular *<input value={form.celular} minLength="7" maxLength="20" onChange={(event) => setForm({ ...form, celular: event.target.value })} required /></label><label>Dirección<input value={form.direccion} onChange={(event) => setForm({ ...form, direccion: event.target.value })} /></label><button className="button button-dark" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cliente'}</button></form>}
    {loading ? <p>Cargando clientes…</p> : visibleCustomers.length ? <div className="admin-client-list">{visibleCustomers.map((customer) => <article className="admin-client-row" key={customer.id}><label>Nombre<input aria-label={`Nombre ${customer.nombre}`} value={customer.nombre} maxLength="100" onChange={(event) => updateCustomer(customer.id, 'nombre', event.target.value)} /></label><label>Celular<input aria-label={`Celular ${customer.nombre}`} value={customer.celular} minLength="7" maxLength="20" onChange={(event) => updateCustomer(customer.id, 'celular', event.target.value)} /></label><label>Dirección<input aria-label={`Dirección ${customer.nombre}`} value={customer.direccion || ''} onChange={(event) => updateCustomer(customer.id, 'direccion', event.target.value)} /></label><div className="admin-client-actions"><button className="button button-outline button-small" onClick={() => saveCustomer(customer)}>Guardar</button><button className="button button-danger button-small" onClick={() => deleteCustomer(customer)}>Eliminar</button></div></article>)}</div> : <p>{search ? 'No hay clientes que coincidan con la búsqueda.' : 'Aún no hay clientes registrados.'}</p>}
  </section>
}

export default ClientsPanel
