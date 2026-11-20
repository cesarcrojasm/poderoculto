import { useEffect, useMemo, useRef, useState } from 'react'
import { formatPrice } from '../lib/commerce'
import { calculateDiscountPercent, calculateQuoteTotals, expirationLabel, formatDate, getExpirationDate, MAX_QUOTE_AMOUNT, quoteWhatsAppUrl, summarizeQuoteItems, validateCustomer, validateQuoteLine } from '../lib/cotizaciones'
import { generateQuotePdf } from '../lib/quotePdf'
import { supabase } from '../lib/supabase'
import './admin-cotizaciones.css'

function dateWithTime(value) {
  return formatDate(value, { hour: '2-digit', minute: '2-digit' })
}

export function QuotesPanel({ client = supabase }) {
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [expandedClient, setExpandedClient] = useState(null)
  const [wizard, setWizard] = useState(false)
  const [step, setStep] = useState(1)
  const [productSearch, setProductSearch] = useState('')
  const [quantities, setQuantities] = useState({})
  const [lines, setLines] = useState([])
  const [expiration, setExpiration] = useState('no_expira')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ nombre: '', celular: '', direccion: '' })
  const [discountPercent, setDiscountPercent] = useState(0)
  const [discountValueInput, setDiscountValueInput] = useState(0)
  const [discountMode, setDiscountMode] = useState('percent')
  const [concept, setConcept] = useState('')
  const [conceptEdited, setConceptEdited] = useState(false)
  const [validation, setValidation] = useState('')
  const [busy, setBusy] = useState(false)
  const [createdQuote, setCreatedQuote] = useState(null)
  const [pdfError, setPdfError] = useState('')
  const [retryQuote, setRetryQuote] = useState(null)
  const inlineCustomerInFlight = useRef(false)
  const inlineCustomerId = useRef(null)
  const quoteInsertId = useRef(null)
  const quoteInsertPayload = useRef(null)
  const wizardRef = useRef(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const [productResult, customerResult, quoteResult] = await Promise.all([
        client.from('productos').select('id,nombre,descripcion,precio,codigo,stock,producto_fotos(url,orden)').order('orden').order('id'),
        client.from('clientes').select('*').order('nombre'),
        client.from('cotizaciones').select('*,clientes(id,nombre,celular)').order('created_at', { ascending: false }),
      ])
      const error = productResult.error || customerResult.error || quoteResult.error
      if (error) { setMessage('No fue posible cargar los datos de cotizaciones. Revisa que la migración esté aplicada.'); return }
      setProducts((productResult.data || []).map((product) => ({ ...product, producto_fotos: [...(product.producto_fotos || [])].sort((a, b) => a.orden - b.orden) })))
      setCustomers(customerResult.data || [])
      setQuotes(quoteResult.data || [])
    } catch {
      setMessage('No fue posible cargar los datos de cotizaciones. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => {
    if (!wizard) return undefined
    const dialog = wizardRef.current
    const focusable = () => [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]')]
    focusable()[0]?.focus()
    const containFocus = (event) => {
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (!elements.length) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    dialog.addEventListener('keydown', containFocus)
    return () => dialog.removeEventListener('keydown', containFocus)
  }, [wizard, step, showNewCustomer, selectedCustomer])

  const subtotal = lines.reduce((sum, line) => sum + Number(line.cantidad || 0) * Number(line.precio_unitario || 0), 0)
  const discountValue = discountMode === 'percent'
    ? calculateQuoteTotals(lines, discountPercent).descuento_valor
    : Math.min(subtotal, Math.max(0, Number(discountValueInput) || 0))
  const finalDiscountPercent = discountMode === 'percent' ? Number(discountPercent) || 0 : calculateDiscountPercent(subtotal, discountValue)
  const total = Math.max(0, subtotal - discountValue)
  const selectedUnitCount = Object.values(quantities).reduce((sum, value) => sum + (Number(value) || 0), 0)
  const selectedSubtotal = products.reduce((sum, product) => sum + Number(product.precio) * (Number(quantities[product.id]) || 0), 0)

  useEffect(() => {
    if (!conceptEdited && lines.length) setConcept(summarizeQuoteItems(lines))
  }, [lines, conceptEdited])

  const beginWizard = () => {
    setWizard(true)
    setStep(1)
    quoteInsertId.current = null
    quoteInsertPayload.current = null
    setQuantities({})
    setLines([])
    setExpiration('no_expira')
    setSelectedCustomer(null)
    setCustomerSearch('')
    setShowNewCustomer(false)
    setDiscountPercent(0)
    setDiscountValueInput(0)
    setDiscountMode('percent')
    setConcept('')
    setConceptEdited(false)
    setValidation('')
    setCreatedQuote(null)
    setPdfError('')
  }
  const cancelWizard = () => { setWizard(false); setCreatedQuote(null); setStep(1); setValidation('') }
  const adjustProduct = (id, amount) => setQuantities((current) => ({ ...current, [id]: Math.max(0, (Number(current[id]) || 0) + amount) }))
  const goToLines = () => {
    const existing = new Map(lines.map((line) => [String(line.producto_id), line]))
    const selected = products.filter((product) => (Number(quantities[product.id]) || 0) > 0).map((product) => {
      const old = existing.get(String(product.id))
      return { producto_id: String(product.id), nombre: product.nombre, descripcion: product.descripcion || '', codigo: product.codigo || '', imagen_url: product.producto_fotos?.[0]?.url || '', cantidad: Number(quantities[product.id]), precio_unitario: old ? old.precio_unitario : Number(product.precio) }
    })
    if (!selected.length) return
    setLines(selected)
    setStep(2)
    setValidation('')
  }
  const changeLine = (id, key, value) => {
    setLines((current) => current.map((line) => line.producto_id === id ? { ...line, [key]: value } : line))
    if (key === 'cantidad') setQuantities((current) => ({ ...current, [id]: value }))
  }
  const removeLine = (id) => {
    const remaining = lines.filter((line) => line.producto_id !== id)
    setLines(remaining)
    setQuantities((current) => ({ ...current, [id]: 0 }))
    if (!remaining.length) setStep(1)
  }
  const continueToDetails = () => {
    if (!lines.length || lines.some((line) => !validateQuoteLine(line))) { setValidation('Cada producto debe tener una cantidad mínima de 1 y un precio entero no negativo.'); return }
    if (lines.reduce((sum, line) => sum + Number(line.cantidad) * Number(line.precio_unitario), 0) > MAX_QUOTE_AMOUNT) { setValidation('El subtotal supera el máximo permitido para una cotización.'); return }
    setValidation('')
    setStep(3)
  }
  const updateDiscountPercent = (value) => {
    const bounded = Math.min(100, Math.max(0, Number(value) || 0))
    setDiscountPercent(bounded)
    setDiscountValueInput(Math.round(subtotal * bounded / 100))
    setDiscountMode('percent')
  }
  const updateDiscountValue = (value) => {
    const bounded = Math.min(subtotal, Math.max(0, Math.round(Number(value) || 0)))
    setDiscountValueInput(bounded)
    setDiscountPercent(calculateDiscountPercent(subtotal, bounded))
    setDiscountMode('value')
  }

  const uploadPdfForQuote = async (quote, customer) => {
    const document = await generateQuotePdf({ ...quote, cliente: customer })
    const blob = document.output('blob')
    const timestamp = new Date(quote.created_at || Date.now()).getTime()
    const path = `${quote.id}/cotizacion-${timestamp}.pdf`
    const storage = client.storage.from('cotizaciones')
    const { error: uploadError } = await storage.upload(path, blob, { contentType: 'application/pdf', upsert: false })
    if (uploadError) {
      const { data: existingFile, error: lookupError } = await storage.download(path)
      if (lookupError || !existingFile) throw uploadError
    }
    const { data } = storage.getPublicUrl(path)
    if (!data?.publicUrl) throw new Error('No se obtuvo la URL pública del PDF.')
    const { error: updateError } = await client.from('cotizaciones').update({ pdf_url: data.publicUrl }).eq('id', quote.id)
    if (updateError) {
      const { data: savedQuote, error: lookupError } = await client.from('cotizaciones').select('pdf_url').eq('id', quote.id).maybeSingle()
      if (lookupError || savedQuote?.pdf_url !== data.publicUrl) throw updateError
    }
    const updated = { ...quote, pdf_url: data.publicUrl, clientes: customer, cliente: customer }
    setQuotes((current) => current.map((item) => item.id === quote.id ? { ...item, ...updated } : item))
    setCreatedQuote((current) => current?.id === quote.id || !current ? updated : current)
    return updated
  }
  const retryPdf = async (quote = createdQuote, customer = selectedCustomer || quote?.clientes) => {
    if (!quote || !customer) return null
    setBusy(true)
    setPdfError('')
    setRetryQuote(quote)
    try {
      const result = await uploadPdfForQuote(quote, customer)
      setRetryQuote(null)
      return result
    } catch {
      setPdfError('No se pudo generar o subir el PDF. La cotización quedó guardada; puedes reintentar sin crear otra.')
      setRetryQuote(quote)
      return null
    } finally { setBusy(false) }
  }
  const createQuote = async () => {
    if (!selectedCustomer) { setValidation('Selecciona un cliente para continuar.'); return }
    if (!lines.length || lines.some((line) => !validateQuoteLine(line))) { setValidation('Revisa las cantidades y precios de los productos.'); return }
    if (subtotal > MAX_QUOTE_AMOUNT) { setValidation('El subtotal supera el máximo permitido para una cotización.'); return }
    setBusy(true)
    setValidation('')
    setPdfError('')
    const items = lines.map((line) => ({ ...line, valor: Number(line.cantidad) * Number(line.precio_unitario) }))
    const payload = {
      cliente_id: selectedCustomer.id,
      expiracion: expiration,
      concepto: concept.trim(),
      items,
      subtotal,
      descuento_porcentaje: finalDiscountPercent,
      descuento_valor: discountValue,
      total,
    }
    try {
      const quoteId = quoteInsertId.current || crypto.randomUUID()
      const insertPayload = quoteInsertPayload.current || { id: quoteId, ...payload }
      quoteInsertId.current = quoteId
      quoteInsertPayload.current = insertPayload
      let insertResult
      try {
        insertResult = await client.from('cotizaciones').insert(insertPayload).select('*').single()
      } catch (error) {
        insertResult = { error }
      }
      let data = insertResult.data
      if (insertResult.error || !data?.id) {
        const { data: existing, error: lookupError } = await client.from('cotizaciones').select('*').eq('id', quoteId).maybeSingle()
        if (lookupError || !existing?.id) {
          if (!lookupError) { quoteInsertId.current = null; quoteInsertPayload.current = null }
          setValidation('No se pudo guardar la cotización. Inténtalo de nuevo.')
          return
        }
        data = existing
      }
      const quote = { ...insertPayload, ...data, cliente: selectedCustomer, clientes: selectedCustomer }
      setCreatedQuote(quote)
      setRetryQuote(quote)
      setStep(4)
      await retryPdf(quote, selectedCustomer)
      await refresh()
    } catch {
      setValidation('No se pudo guardar la cotización. Inténtalo de nuevo.')
    } finally { setBusy(false) }
  }
  const createInlineCustomer = async (event) => {
    event.preventDefault()
    const result = validateCustomer(newCustomer)
    if (!result.valid) { setValidation(result.message); return }
    if (inlineCustomerInFlight.current) return
    inlineCustomerInFlight.current = true
    setBusy(true)
    try {
      const id = inlineCustomerId.current || crypto.randomUUID()
      inlineCustomerId.current = id
      let response
      try {
        response = await client.from('clientes').insert({ id, ...result.value }).select('*').single()
      } catch (error) {
        response = { error }
      }
      let customer = response?.data
      if (response?.error || !customer?.id) {
        let lookup
        try {
          lookup = await client.from('clientes').select('*').eq('id', id).maybeSingle()
        } catch (error) {
          lookup = { error }
        }
        if (lookup?.error || !lookup?.data) { setValidation('No se pudo guardar el nuevo cliente.'); return }
        customer = lookup.data
      }
      setCustomers((current) => [...current.filter((item) => item.id !== id), customer].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      inlineCustomerId.current = null
      setSelectedCustomer(customer)
      setShowNewCustomer(false)
      setNewCustomer({ nombre: '', celular: '', direccion: '' })
      setValidation('')
    } catch {
      setValidation('No se pudo guardar el nuevo cliente.')
    } finally {
      inlineCustomerInFlight.current = false
      setBusy(false)
    }
  }
  const shareQuote = async (quote, customer) => {
    const pendingWindow = quote.pdf_url ? null : window.open('about:blank', '_blank')
    let ready = quote
    if (!ready.pdf_url) ready = await retryPdf(quote, customer)
    if (!ready?.pdf_url) { pendingWindow?.close(); return }
    const url = quoteWhatsAppUrl(customer, ready)
    if (pendingWindow) pendingWindow.location.href = url
    else window.open(url, '_blank')
  }
  const closeSuccess = async () => {
    setWizard(false)
    setStep(1)
    setCreatedQuote(null)
    setSelectedCustomer(null)
    setLines([])
    setQuantities({})
    setRetryQuote(null)
    await refresh()
  }

  const visibleProducts = products.filter((product) => product.nombre.toLocaleLowerCase('es').includes(productSearch.trim().toLocaleLowerCase('es')))
  const visibleCustomers = customers.filter((customer) => customer.nombre.toLocaleLowerCase('es').includes(customerSearch.trim().toLocaleLowerCase('es')))
  const groups = useMemo(() => {
    const result = new Map()
    quotes.forEach((quote) => {
      const customer = quote.clientes || quote.cliente
      if (!customer) return
      const id = customer.id || quote.cliente_id
      if (!result.has(id)) result.set(id, { customer, quotes: [] })
      result.get(id).quotes.push(quote)
    })
    return [...result.entries()].sort((a, b) => new Date(b[1].quotes[0]?.created_at) - new Date(a[1].quotes[0]?.created_at))
  }, [quotes])
  const visibleGroups = groups.filter(([, group]) => group.customer.nombre.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')))

  return <section className="admin-quotes" aria-labelledby="quotes-title">
    {!wizard && <><div className="admin-quotes-toolbar"><div><h2 id="quotes-title">Cotizaciones</h2><p>Consulta el historial o crea una nueva cotización para tu cliente.</p></div><button className="button button-primary" onClick={beginWizard}>+ Nueva cotización</button></div>
      <label className="admin-quote-search">Buscar cliente<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre del cliente" /></label>
      {message && <p className="notice" role="status">{message}</p>}
      {loading ? <p>Cargando cotizaciones…</p> : !visibleGroups.length ? <p>{search.trim() ? 'No hay cotizaciones que coincidan con la búsqueda.' : 'Aún no hay cotizaciones registradas.'}</p> : <div className="admin-quote-groups">{visibleGroups.map(([id, group]) => <article className="admin-quote-group" key={id}><button className="admin-quote-group-toggle" aria-expanded={expandedClient === id} onClick={() => setExpandedClient(expandedClient === id ? null : id)}><span className="admin-client-avatar">{group.customer.nombre.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('es')}</span><span><strong>{group.customer.nombre}</strong><small>{group.quotes.length} {group.quotes.length === 1 ? 'cotización' : 'cotizaciones'}</small></span><span aria-hidden="true">{expandedClient === id ? '−' : '+'}</span></button>{expandedClient === id && <div className="admin-quote-history">{group.quotes.map((quote) => <article className="admin-quote-card" key={quote.id}><div><strong>{dateWithTime(quote.created_at)}</strong><span>{formatPrice(quote.total)}</span><small>{expirationLabel(quote.expiracion)}{getExpirationDate(quote.created_at, quote.expiracion) ? ` · hasta ${formatDate(getExpirationDate(quote.created_at, quote.expiracion))}` : ''}</small></div><div className="admin-quote-actions"><button className="button button-outline button-small" onClick={() => shareQuote(quote, group.customer)}>Compartir</button>{quote.pdf_url && <a className="button button-dark button-small" href={quote.pdf_url} target="_blank" rel="noreferrer">Ver PDF</a>}</div>{pdfError && retryQuote?.id === quote.id && <p role="alert">{pdfError} <button className="button button-outline button-small" disabled={busy} onClick={() => retryPdf(quote, group.customer)}>Reintentar PDF</button></p>}</article>)}</div>}</article>)}</div>}
    </>}
    {wizard && <div ref={wizardRef} className="admin-quote-wizard" role="dialog" aria-modal="true" aria-labelledby="quote-wizard-title">
      <div className="admin-wizard-heading"><div><span className="eyebrow">COTIZACIONES · PASO {step} DE 4</span><h2 id="quote-wizard-title">{step === 1 ? 'Seleccionar productos' : step === 2 ? 'Confirmar precios y cantidades' : step === 3 ? 'Datos de la cotización' : busy && !createdQuote?.pdf_url && !pdfError ? 'Generando PDF' : pdfError ? 'Cotización creada' : 'Cotización lista'}</h2></div>{step < 4 && <button className="button button-outline button-small" disabled={busy} onClick={cancelWizard}>Cancelar</button>}</div>
      {step === 1 && <><label className="admin-quote-search">Buscar producto<input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Nombre del producto" /></label><div className="admin-quote-products">{visibleProducts.map((product) => <article className="admin-quote-product" key={product.id}><img src={product.producto_fotos?.[0]?.url || '/brand/mark.svg'} alt={product.nombre} /><div><strong>{product.nombre}</strong><span>{formatPrice(product.precio)}</span><small className={Number(product.stock) > 0 ? 'stock-available' : 'stock-empty'}>{Number(product.stock) > 0 ? `${product.stock} disponibles` : 'No disponible'}</small></div><div className="admin-quantity-control"><button aria-label={`Disminuir ${product.nombre}`} onClick={() => adjustProduct(product.id, -1)}>−</button><output aria-label={`Cantidad ${product.nombre}`}>{Number(quantities[product.id]) || 0}</output><button aria-label={`Aumentar ${product.nombre}`} onClick={() => adjustProduct(product.id, 1)}>+</button></div></article>)}</div><div className="admin-quote-sticky"><span>{selectedUnitCount} unidades · {formatPrice(selectedSubtotal)}</span><button className="button button-dark" disabled={!selectedUnitCount} onClick={goToLines}>Añadir productos</button></div></>}
      {step === 2 && <><div className="admin-quote-line-list">{lines.map((line) => <article className="admin-quote-line" key={line.producto_id}><img src={line.imagen_url || '/brand/mark.svg'} alt=""/><div className="admin-quote-line-name"><strong>{line.nombre}</strong><small>{line.codigo || 'Sin código'}</small></div><label>Cantidad<div className="admin-line-quantity-control"><button type="button" aria-label={`Disminuir cantidad ${line.nombre}`} onClick={() => changeLine(line.producto_id, 'cantidad', Math.max(1, Number(line.cantidad) - 1))}>−</button><input aria-label={`Cantidad ${line.nombre}`} type="number" min="1" step="1" value={line.cantidad} onChange={(event) => changeLine(line.producto_id, 'cantidad', event.target.value === '' ? '' : Number(event.target.value))} /><button type="button" aria-label={`Aumentar cantidad ${line.nombre}`} onClick={() => changeLine(line.producto_id, 'cantidad', Number(line.cantidad || 0) + 1)}>+</button></div></label><label>Precio unitario<input aria-label={`Precio unitario ${line.nombre}`} type="number" min="0" step="1" value={line.precio_unitario} onChange={(event) => changeLine(line.producto_id, 'precio_unitario', event.target.value === '' ? '' : Number(event.target.value))} /></label><button aria-label={`Eliminar ${line.nombre}`} className="button button-danger button-small" onClick={() => removeLine(line.producto_id)}>Eliminar</button><small className="admin-line-total">Precio por {line.cantidad} unidad(es): {formatPrice(Number(line.cantidad || 0) * Number(line.precio_unitario || 0))}</small></article>)}</div>{validation && <p role="alert">{validation}</p>}<div className="admin-quote-sticky"><button className="button button-outline" onClick={() => { setStep(1); setValidation('') }}>Volver a productos</button><span>Total provisional: {formatPrice(lines.reduce((sum, line) => sum + Number(line.cantidad || 0) * Number(line.precio_unitario || 0), 0))}</span><button className="button button-dark" onClick={continueToDetails}>Confirmar</button></div></>}
      {step === 3 && <><div className="admin-quote-details"><p><strong>Fecha de cotización:</strong> {formatDate(new Date())}</p><fieldset><legend>Tiempo de expiración</legend>{[['1_semana', '1 semana'], ['15_dias', '15 días'], ['1_mes', '1 mes'], ['no_expira', 'No expira']].map(([value, label]) => <button type="button" className={expiration === value ? 'active' : ''} key={value} onClick={() => setExpiration(value)}>{label}</button>)}</fieldset><button className="button button-outline button-small" onClick={() => setStep(1)}>Seleccionar más productos ({lines.length} líneas)</button>
        <div className="admin-customer-picker"><strong>Cliente *</strong>{selectedCustomer ? <div className="admin-selected-customer"><span>{selectedCustomer.nombre} · {selectedCustomer.celular}</span><button className="button button-outline button-small" onClick={() => setSelectedCustomer(null)}>Cambiar</button></div> : <><input aria-label="Buscar cliente" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Buscar cliente por nombre"/><div className="admin-customer-options">{visibleCustomers.map((customer) => <button key={customer.id} onClick={() => { setSelectedCustomer(customer); setCustomerSearch('') }}>{customer.nombre} · {customer.celular}</button>)}</div><button className="button button-outline button-small" onClick={() => setShowNewCustomer((value) => !value)}>{showNewCustomer ? 'Cancelar nuevo cliente' : '+ Crear nuevo cliente'}</button></>}
          {showNewCustomer && !selectedCustomer && <form className="admin-inline-customer" onSubmit={createInlineCustomer}><label>Nombre *<input required maxLength="100" value={newCustomer.nombre} onChange={(event) => setNewCustomer({ ...newCustomer, nombre: event.target.value })}/></label><label>Celular *<input required minLength="7" maxLength="20" value={newCustomer.celular} onChange={(event) => setNewCustomer({ ...newCustomer, celular: event.target.value })}/></label><label>Dirección<input value={newCustomer.direccion} onChange={(event) => setNewCustomer({ ...newCustomer, direccion: event.target.value })}/></label><button className="button button-dark" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y seleccionar'}</button></form>}
        </div>
        <div className="admin-discount-fields"><label>Descuento (%)<input aria-label="Descuento porcentaje" type="number" min="0" max="100" step="0.01" value={discountPercent} onChange={(event) => updateDiscountPercent(event.target.value)} /></label><label>Descuento (COP)<input aria-label="Descuento valor" type="number" min="0" max={subtotal} step="1" value={discountMode === 'percent' ? Math.round(subtotal * discountPercent / 100) : discountValueInput} onChange={(event) => updateDiscountValue(event.target.value)} /></label></div>
        <label className="admin-concept-field">Concepto<textarea value={concept} onChange={(event) => { setConcept(event.target.value); setConceptEdited(true) }} /></label>{validation && <p role="alert">{validation}</p>}</div><div className="admin-quote-sticky"><button className="button button-outline" onClick={() => setStep(2)}>Volver</button><span>Total: {formatPrice(total)}</span><button className="button button-dark" disabled={!selectedCustomer || busy} onClick={createQuote}>{busy ? 'Creando…' : 'Crear cotización'}</button></div></>}
      {step === 4 && <div className="admin-quote-success">{busy && !createdQuote?.pdf_url && !pdfError ? <><p role="status">Cotización guardada. Generando el PDF…</p><button className="button button-outline" disabled>Volver a cotizaciones</button></> : <><div aria-hidden="true">✓</div><h3>{pdfError ? 'Cotización creada' : '¡Creaste una cotización!'}</h3><p>{pdfError ? 'La cotización quedó guardada, pero el PDF no está disponible todavía.' : 'Ya está lista para compartir con tu cliente.'}</p>{pdfError && <p role="alert">{pdfError}</p>}{createdQuote?.pdf_url && <button className="button button-primary" onClick={() => shareQuote(createdQuote, selectedCustomer)}>Compartir cotización</button>}{pdfError && <button className="button button-outline" disabled={busy} onClick={() => retryPdf(createdQuote, selectedCustomer)}>{busy ? 'Reintentando…' : 'Reintentar PDF'}</button>}<button className="button button-outline" disabled={busy} onClick={closeSuccess}>Volver a cotizaciones</button></>}</div>}
    </div>}
  </section>
}

export default QuotesPanel
