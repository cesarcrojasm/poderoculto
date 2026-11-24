import { useEffect, useMemo, useRef, useState } from 'react'
import { formatPrice } from '../lib/commerce'
import { calculateDiscountPercent, calculateSaleTotals, PAYMENT_METHODS, saleEstadoLabel, saleShareText, summarizeSaleItems, validateAbono, validateSaleLine } from '../lib/ventas'
import { generateSalePdf } from '../lib/salePdf'
import { renderQuotePdfAsPng } from '../lib/quoteImage'
import { shareOrDownloadFile } from '../lib/fileShare'
import { MAX_QUOTE_AMOUNT, validateCustomer } from '../lib/cotizaciones'
import { supabase } from '../lib/supabase'
import './admin-ventas.css'

const INT32_MIN = -2147483648
const INT32_MAX = 2147483647
const localDate = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const saleFilePath = (url) => {
  if (!url) return null
  try {
    const pathname = new URL(url).pathname
    const marker = '/ventas/'
    const index = pathname.indexOf(marker)
    return index < 0 ? null : decodeURIComponent(pathname.slice(index + marker.length))
  } catch { return null }
}
const saleMatchesPayload = (sale, payload) => {
  const columns = ['cliente_id', 'cotizacion_id', 'fecha', 'estado_pago', 'metodo_pago', 'subtotal', 'descuento_porcentaje', 'descuento_valor', 'total', 'abono_valor', 'concepto', 'nota', 'pdf_url']
  if (!sale || !columns.every((key) => String(sale[key] ?? '') === String(payload[key] ?? ''))) return false
  const lineColumns = ['producto_id', 'nombre', 'descripcion', 'codigo', 'imagen_url', 'cantidad', 'precio_unitario', 'valor']
  return Array.isArray(sale.items) && sale.items.length === payload.items.length && sale.items.every((line, index) => lineColumns.every((key) => String(line[key] ?? '') === String(payload.items[index][key] ?? '')))
}

export function AdminSalesPanel({ client = supabase, initialQuote = null, onInitialQuoteHandled = () => {} }) {
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [wizard, setWizard] = useState(false)
  const [step, setStep] = useState(1)
  const [productSearch, setProductSearch] = useState('')
  const [quantities, setQuantities] = useState({})
  const [lines, setLines] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ nombre: '', celular: '', direccion: '' })
  const [paymentState, setPaymentState] = useState('pagado')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [saleDate, setSaleDate] = useState(localDate())
  const [showDateInput, setShowDateInput] = useState(false)
  const [discountPercent, setDiscountPercent] = useState(0)
  const [discountValueInput, setDiscountValueInput] = useState(0)
  const [discountMode, setDiscountMode] = useState('percent')
  const [concept, setConcept] = useState('')
  const [conceptEdited, setConceptEdited] = useState(false)
  const [note, setNote] = useState('')
  const [validation, setValidation] = useState('')
  const [busy, setBusy] = useState(false)
  const [abonoModal, setAbonoModal] = useState(false)
  const [abonoInput, setAbonoInput] = useState('')
  const [createdSale, setCreatedSale] = useState(null)
  const [pdfError, setPdfError] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [stockWarning, setStockWarning] = useState('')
  const [editingSale, setEditingSale] = useState(null)
  const [cotizacionId, setCotizacionId] = useState(null)
  const [shareTarget, setShareTarget] = useState(null)
  const [sharingFormat, setSharingFormat] = useState('')
  const [shareError, setShareError] = useState('')
  const [shareNotice, setShareNotice] = useState('')
  const insertIdRef = useRef(null)
  const insertPayloadRef = useRef(null)
  const stockAppliedRef = useRef(null)
  const pdfPathsRef = useRef(new Map())
  const shareRequestRef = useRef(0)
  const wizardRef = useRef(null)
  const partialPaymentRef = useRef(null)
  const shareDialogRef = useRef(null)

  useEffect(() => {
    if (!wizard || abonoModal || shareTarget) return undefined
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
  }, [wizard, step, abonoModal, shareTarget, showNewCustomer, selectedCustomer])
  useEffect(() => {
    const dialog = abonoModal ? partialPaymentRef.current : shareTarget ? shareDialogRef.current : null
    if (!dialog) return undefined
    const trigger = document.activeElement
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
    return () => {
      dialog.removeEventListener('keydown', containFocus)
      if (trigger?.isConnected) trigger.focus()
    }
  }, [abonoModal, shareTarget])

  const refresh = async () => {
    setLoading(true)
    try {
      const [productResult, customerResult, salesResult] = await Promise.all([
        client.from('productos').select('id,nombre,descripcion,precio,codigo,stock,producto_fotos(url,orden)').order('orden').order('id'),
        client.from('clientes').select('*').order('nombre'),
        client.from('ventas').select('*,clientes(id,nombre,celular)').order('created_at', { ascending: false }),
      ])
      const error = productResult.error || customerResult.error || salesResult.error
      if (error) { setMessage('No fue posible cargar el Balance. Revisa que la migración de ventas esté aplicada.'); return }
      setProducts((productResult.data || []).map((product) => ({ ...product, producto_fotos: [...(product.producto_fotos || [])].sort((a, b) => a.orden - b.orden) })))
      setCustomers(customerResult.data || [])
      setSales(salesResult.data || [])
    } catch {
      setMessage('No fue posible cargar los datos de ventas. Inténtalo de nuevo.')
    } finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => {
    if (!initialQuote) return
    beginWizard(initialQuote)
    onInitialQuoteHandled()
  }, [initialQuote])
  useEffect(() => {
    if (!conceptEdited && lines.length) setConcept(summarizeSaleItems(lines))
  }, [lines, conceptEdited])

  const totals = calculateSaleTotals(lines, discountMode === 'percent' ? discountPercent : calculateDiscountPercent(
    lines.reduce((sum, line) => sum + Number(line.cantidad || 0) * Number(line.precio_unitario || 0), 0), discountValueInput,
  ))
  const subtotal = totals.subtotal
  const discountValue = discountMode === 'percent' ? totals.descuento_valor : Math.min(subtotal, Math.max(0, Number(discountValueInput) || 0))
  const total = Math.max(0, subtotal - discountValue)
  const finalDiscountPercent = discountMode === 'percent' ? Number(discountPercent) || 0 : calculateDiscountPercent(subtotal, discountValue)
  const selectedUnitCount = Object.values(quantities).reduce((sum, value) => sum + (Number(value) || 0), 0)
  const selectedSubtotal = products.reduce((sum, product) => sum + Number(product.precio || 0) * (Number(quantities[product.id]) || 0), 0)

  function beginWizard(quote = null) {
    setWizard(true)
    setStep(quote ? 3 : 1)
    setEditingSale(null)
    setCreatedSale(null)
    setCotizacionId(quote?.id || null)
    setLines((quote?.items || []).map((line) => ({ ...line, producto_id: String(line.producto_id), cantidad: Number(line.cantidad), precio_unitario: Number(line.precio_unitario) })))
    setQuantities(Object.fromEntries((quote?.items || []).map((line) => [String(line.producto_id), Number(line.cantidad)])))
    setSelectedCustomer(quote ? (quote.clientes || quote.cliente || null) : null)
    setCustomerSearch('')
    setShowNewCustomer(false)
    setPaymentState('pagado')
    setPaymentMethod('')
    setSaleDate(localDate())
    setShowDateInput(false)
    setDiscountPercent(0)
    setDiscountValueInput(0)
    setDiscountMode('percent')
    setConcept(quote?.concepto || '')
    setConceptEdited(Boolean(quote?.concepto))
    setNote('')
    setValidation('')
    setPdfError('')
    setDownloadError('')
    setStockWarning('')
    setAbonoInput('')
    setAbonoModal(false)
    insertIdRef.current = null
    insertPayloadRef.current = null
    stockAppliedRef.current = null
  }

  function beginEdit(sale) {
    setWizard(true)
    setStep(3)
    setEditingSale(sale)
    setCreatedSale(null)
    setCotizacionId(sale.cotizacion_id || null)
    const saleLines = (sale.items || []).map((line) => ({ ...line, producto_id: String(line.producto_id), cantidad: Number(line.cantidad), precio_unitario: Number(line.precio_unitario) }))
    setLines(saleLines)
    setQuantities(Object.fromEntries(saleLines.map((line) => [String(line.producto_id), Number(line.cantidad)])))
    setSelectedCustomer(sale.clientes || customers.find((customer) => customer.id === sale.cliente_id) || null)
    const isFullyPaid = sale.estado_pago === 'deuda' && Number(sale.total) > 0 && Number(sale.abono_valor) >= Number(sale.total)
    setPaymentState(isFullyPaid ? 'pagado' : sale.estado_pago)
    setPaymentMethod(sale.metodo_pago || '')
    setSaleDate(sale.fecha || localDate())
    const savedDiscountPercent = Number(sale.descuento_porcentaje) || 0
    const savedDiscountValue = Number(sale.descuento_valor) || 0
    setDiscountPercent(savedDiscountPercent)
    setDiscountValueInput(savedDiscountValue)
    setDiscountMode(calculateSaleTotals(saleLines, savedDiscountPercent).descuento_valor === savedDiscountValue ? 'percent' : 'value')
    setConcept(sale.concepto || '')
    setConceptEdited(true)
    setNote(sale.nota || '')
    setAbonoInput(String(sale.abono_valor || 0))
    setValidation('')
    setPdfError('')
    setDownloadError('')
    setStockWarning('')
    setAbonoModal(false)
  }

  function cancelWizard() {
    setWizard(false)
    setStep(1)
    setCreatedSale(null)
    setEditingSale(null)
    setAbonoModal(false)
    setValidation('')
    insertIdRef.current = null
    insertPayloadRef.current = null
    stockAppliedRef.current = null
  }

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
    if (!lines.length || lines.some((line) => !validateSaleLine(line))) { setValidation('Cada producto debe tener una cantidad mínima de 1 y un precio entero no negativo.'); return }
    if (lines.reduce((sum, line) => sum + Number(line.cantidad) * Number(line.precio_unitario), 0) > MAX_QUOTE_AMOUNT) { setValidation('El subtotal supera el máximo permitido para una venta.'); return }
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

  async function applyStockDelta(items, sign) {
    const failures = []
    const appliedItems = []
    const quantitiesByProduct = new Map()
    for (const item of items || []) {
      const id = String(item.producto_id || '')
      if (id) quantitiesByProduct.set(id, (quantitiesByProduct.get(id) || 0) + Number(item.cantidad || 0))
    }
    for (const [id, quantity] of quantitiesByProduct) {
      let applied = false
      try {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const { data: product, error: readError } = await client.from('productos').select('stock').eq('id', id).maybeSingle()
          if (readError || !product) break
          const previousStock = Number(product.stock || 0)
          const stock = previousStock + sign * quantity
          if (!Number.isInteger(stock) || stock < INT32_MIN || stock > INT32_MAX) break
          let updateResult
          try { updateResult = await client.from('productos').update({ stock }).eq('id', id).eq('stock', product.stock).select('id').maybeSingle() }
          catch (error) { updateResult = { error } }
          if (updateResult?.error) {
            let confirmation
            try { confirmation = await client.from('productos').select('stock').eq('id', id).maybeSingle() }
            catch {}
            if (!confirmation?.error && confirmation?.data && Number(confirmation.data.stock) === stock) {
              applied = true
              appliedItems.push({ producto_id: id, cantidad: quantity })
            }
            break
          }
          if (!updateResult?.data) continue
          applied = true
          appliedItems.push({ producto_id: id, cantidad: quantity })
          break
        }
      } catch {}
      if (!applied) failures.push(id)
    }
    return { failures, appliedItems }
  }

  async function uploadPdfForSale(sale) {
    const doc = await generateSalePdf({ ...sale, clientes: sale.clientes || selectedCustomer })
    const blob = doc.output('blob')
    const path = pdfPathsRef.current.get(sale.id) || `${sale.id}/comprobante-${Date.now()}-${crypto.randomUUID()}.pdf`
    pdfPathsRef.current.set(sale.id, path)
    const storage = client.storage.from('ventas')
    const { error: uploadError } = await storage.upload(path, blob, { contentType: 'application/pdf', upsert: false })
    if (uploadError) {
      const { data: existingFile, error: lookupError } = await storage.download(path)
      if (lookupError || !existingFile) throw uploadError
    }
    const { data } = storage.getPublicUrl(path)
    if (!data?.publicUrl) throw new Error('No se obtuvo la URL pública del PDF.')
    const { error: updateError } = await client.from('ventas').update({ pdf_url: data.publicUrl }).eq('id', sale.id)
    if (updateError) {
      const { data: savedSale, error: lookupError } = await client.from('ventas').select('pdf_url').eq('id', sale.id).maybeSingle()
      if (lookupError || savedSale?.pdf_url !== data.publicUrl) throw updateError
    }
    const previousPdfUrl = sale._previousPdfUrl || sale.pdf_url
    if (previousPdfUrl) {
      const oldPath = saleFilePath(previousPdfUrl)
      if (oldPath && oldPath !== path) {
        const { error: removeError } = await storage.remove([oldPath])
        if (removeError) setMessage('El comprobante nuevo se guardó, pero no se pudo limpiar el PDF anterior de Storage.')
      }
    }
    pdfPathsRef.current.delete(sale.id)
    const updated = { ...sale, pdf_url: data.publicUrl, clientes: sale.clientes || selectedCustomer }
    delete updated._previousPdfUrl
    setSales((current) => current.map((item) => item.id === sale.id ? { ...item, ...updated } : item))
    setCreatedSale((current) => current?.id === sale.id || !current ? updated : current)
    return updated
  }

  async function retryPdf(sale = createdSale) {
    if (!sale) return null
    setBusy(true)
    setPdfError('')
    try { return await uploadPdfForSale(sale) }
    catch { setPdfError('No se pudo generar o subir el PDF. La venta quedó guardada; puedes reintentar sin crear otra.'); return null }
    finally { setBusy(false) }
  }

  async function createInlineCustomer(event) {
    event.preventDefault()
    const result = validateCustomer(newCustomer)
    if (!result.valid) { setValidation(result.message); return }
    setBusy(true)
    try {
      const id = crypto.randomUUID()
      const { data, error } = await client.from('clientes').insert({ id, ...result.value }).select('*').single()
      if (error || !data?.id) { setValidation('No se pudo guardar el nuevo cliente.'); return }
      setCustomers((current) => [...current, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      setSelectedCustomer(data)
      setShowNewCustomer(false)
      setNewCustomer({ nombre: '', celular: '', direccion: '' })
      setValidation('')
    } catch { setValidation('No se pudo guardar el nuevo cliente.') }
    finally { setBusy(false) }
  }

  async function saveSale(abonoValue = 0) {
    if (!lines.length || lines.some((line) => !validateSaleLine(line))) { setValidation('Revisa las cantidades y precios de los productos.'); return }
    if (subtotal > MAX_QUOTE_AMOUNT) { setValidation('El subtotal supera el máximo permitido para una venta.'); return }
    if (!saleDate) { setValidation('Selecciona la fecha de la venta.'); return }
    if (paymentState === 'pagado' && !paymentMethod) { setValidation('Selecciona un método de pago para guardar una venta pagada.'); setAbonoModal(false); return }
    const validationResult = validateAbono(abonoValue, total)
    if (!validationResult.valid) { setValidation(validationResult.message); return }
    if (paymentState === 'deuda' && validationResult.value > 0 && !paymentMethod) { setValidation('Selecciona un método de pago para registrar el abono.'); return }
    setBusy(true)
    setValidation('')
    setPdfError('')
    setStockWarning('')
    const items = lines.map((line) => ({ ...line, cantidad: Number(line.cantidad), precio_unitario: Number(line.precio_unitario), valor: Number(line.cantidad) * Number(line.precio_unitario) }))
    const fullyPaidDebt = paymentState === 'deuda' && total > 0 && validationResult.value >= total
    const payload = {
      cliente_id: selectedCustomer?.id || null,
      cotizacion_id: cotizacionId,
      fecha: saleDate,
      estado_pago: fullyPaidDebt ? 'pagado' : paymentState,
      metodo_pago: paymentState === 'pagado' || validationResult.value > 0 ? paymentMethod : null,
      items,
      subtotal,
      descuento_porcentaje: finalDiscountPercent,
      descuento_valor: discountValue,
      total,
      abono_valor: paymentState === 'deuda' && !fullyPaidDebt ? validationResult.value : 0,
      concepto: concept.trim(),
      nota: note.trim() || null,
    }
    try {
      let sale
      if (editingSale) {
        const restored = await applyStockDelta(editingSale.items, 1)
        if (restored.failures.length) {
          const rollback = await applyStockDelta(restored.appliedItems, -1)
          setValidation(rollback.failures.length ? 'Falló la reversión parcial del inventario; verifica manualmente las existencias. La venta no se actualizó.' : 'No se pudo revertir todo el inventario anterior; se restauró lo que sí cambió y la venta no se actualizó.')
          return
        }
        const applied = await applyStockDelta(items, -1)
        if (applied.failures.length) {
          const rollbackNew = await applyStockDelta(applied.appliedItems, 1)
          const rollbackOld = await applyStockDelta(editingSale.items, -1)
          setValidation(rollbackNew.failures.length || rollbackOld.failures.length ? 'Falló la compensación de inventario; verifica manualmente las existencias. La venta no se actualizó.' : 'No se pudo aplicar todo el inventario nuevo; se restauró el inventario anterior y la venta no se actualizó.')
          return
        }
        let updateResult
        try { updateResult = await client.from('ventas').update({ ...payload, pdf_url: null }).eq('id', editingSale.id).select('*,clientes(id,nombre,celular)').single() }
        catch (error) { updateResult = { error } }
        let data = updateResult?.data
        if (updateResult?.error || !data?.id) {
          const { data: existing, error: lookupError } = await client.from('ventas').select('*').eq('id', editingSale.id).maybeSingle()
          if (lookupError) {
            setMessage('No se pudo confirmar si la venta se actualizó. Verifica la venta y el inventario antes de reintentar.')
            setWizard(false)
            setEditingSale(null)
            await refresh()
            return
          }
          if (!saleMatchesPayload(existing, { ...payload, pdf_url: null })) {
            const rollbackNew = await applyStockDelta(items, 1)
            const rollbackOld = await applyStockDelta(editingSale.items, -1)
            setValidation(rollbackNew.failures.length || rollbackOld.failures.length ? 'No se pudo actualizar la venta y falló la compensación del inventario; verifica las existencias manualmente.' : 'No se pudo actualizar la venta; se restauró el inventario anterior.')
            return
          }
          data = existing
        }
        sale = { ...editingSale, ...data, clientes: selectedCustomer, _previousPdfUrl: editingSale.pdf_url }
      } else {
        const id = insertIdRef.current || crypto.randomUUID()
        const insertPayload = insertPayloadRef.current || { id, ...payload }
        insertIdRef.current = id
        insertPayloadRef.current = insertPayload
        let response
        try { response = await client.from('ventas').insert(insertPayload).select('*').single() }
        catch (error) { response = { error } }
        let data = response?.data
        if (response?.error || !data?.id) {
          const { data: existing, error: lookupError } = await client.from('ventas').select('*').eq('id', id).maybeSingle()
          if (lookupError || !existing?.id) {
            if (!lookupError) insertPayloadRef.current = null
            setValidation('No se pudo guardar la venta. Inténtalo de nuevo.')
            return
          }
          data = existing
        }
        sale = { ...insertPayload, ...data, clientes: selectedCustomer }
        if (stockAppliedRef.current !== id) {
          const { failures } = await applyStockDelta(sale.items || items, -1)
          stockAppliedRef.current = id
          if (failures.length) setStockWarning('La venta quedó guardada, pero no se pudo actualizar todo el inventario. Verifica el stock de los productos afectados.')
        }
        if (cotizacionId) {
          const { error: quoteError } = await client.from('cotizaciones').update({ estado: 'vendida' }).eq('id', cotizacionId)
          if (quoteError) {
            const { data: quote, error: lookupError } = await client.from('cotizaciones').select('estado').eq('id', cotizacionId).maybeSingle()
            if (lookupError || quote?.estado !== 'vendida') setStockWarning('La venta quedó guardada, pero no se pudo actualizar el estado de la cotización. Verifica la cotización antes de reintentar.')
          }
        }
      }
      setCreatedSale(sale)
      setAbonoModal(false)
      setStep(4)
      setSales((current) => [sale, ...current.filter((item) => item.id !== sale.id)])
      await retryPdf(sale)
      if (cotizacionId && !editingSale) setSales((current) => current.map((item) => item.id === sale.id ? sale : item))
      await refresh()
    } catch {
      setValidation('La operación no se completó. Revisa el estado de la venta y del inventario antes de volver a intentar.')
    } finally { setBusy(false) }
  }

  function handleSave() {
    if (paymentState === 'deuda') {
      setAbonoInput(editingSale ? String(editingSale.abono_valor || 0) : '')
      setAbonoModal(true)
      setValidation('')
      return
    }
    saveSale(0)
  }

  async function deleteSale(sale) {
    if (!window.confirm('¿Eliminar esta venta? Esta acción no se puede deshacer.')) return
    setBusy(true)
    setMessage('')
    try {
      const restored = await applyStockDelta(sale.items, 1)
      if (restored.failures.length) {
        const rollback = await applyStockDelta(restored.appliedItems, -1)
        setMessage(rollback.failures.length ? 'Falló la compensación parcial del inventario; verifica las existencias manualmente. La venta no se eliminó.' : 'No se pudo restaurar todo el inventario; se revirtió el cambio parcial y la venta no se eliminó.')
        return
      }
      let deleteResult
      try { deleteResult = await client.from('ventas').delete().eq('id', sale.id) }
      catch (error) { deleteResult = { error } }
      if (deleteResult?.error) {
        const { data: existing, error: lookupError } = await client.from('ventas').select('id').eq('id', sale.id).maybeSingle()
        if (lookupError || existing) {
          const rollback = await applyStockDelta(sale.items, -1)
          setMessage(rollback.failures.length ? 'No se pudo eliminar la venta y falló la compensación del inventario; verifica las existencias manualmente.' : 'No se pudo eliminar la venta; se revirtió la restauración del inventario.')
          return
        }
      }
      setSales((current) => current.filter((item) => item.id !== sale.id))
      let receiptCleanupFailed = false
      const oldPath = saleFilePath(sale.pdf_url)
      if (oldPath) {
        try {
          const { error: fileError } = await client.storage.from('ventas').remove([oldPath])
          receiptCleanupFailed = Boolean(fileError)
        } catch { receiptCleanupFailed = true }
      }
      if (sale.cotizacion_id) {
        const { error: quoteError } = await client.from('cotizaciones').update({ estado: 'creada' }).eq('id', sale.cotizacion_id)
        if (quoteError) {
          const { data: quote, error: lookupError } = await client.from('cotizaciones').select('estado').eq('id', sale.cotizacion_id).maybeSingle()
          if (lookupError || quote?.estado !== 'creada') { setMessage(`La venta se eliminó, pero no se pudo restablecer el estado de la cotización.${receiptCleanupFailed ? ' Tampoco se pudo eliminar el PDF de Storage.' : ''}`); await refresh(); return }
        }
      }
      setMessage(receiptCleanupFailed ? 'La venta se eliminó y el inventario se restauró, pero no se pudo eliminar el PDF de Storage.' : 'Venta eliminada y existencias restauradas.')
      await refresh()
    } catch { setMessage('No se pudo completar la eliminación. Revisa inventario, comprobante y venta antes de reintentar.') }
    finally { setBusy(false) }
  }

  function openShare(sale) { setShareError(''); setShareNotice(''); setShareTarget(sale) }
  async function downloadReceipt(sale) {
    setDownloadError('')
    try {
      const response = await fetch(sale.pdf_url)
      if (!response.ok) throw new Error('PDF download failed')
      const blob = await response.blob()
      const file = new File([blob], `comprobante-${sale.numero_transaccion}.pdf`, { type: 'application/pdf' })
      await shareOrDownloadFile(file, { shareApi: null })
    } catch { setDownloadError('No se pudo descargar el comprobante. Inténtalo de nuevo.') }
  }
  async function shareSaleFile(format) {
    if (!shareTarget || sharingFormat) return
    const sale = shareTarget
    const requestId = ++shareRequestRef.current
    setSharingFormat(format)
    setShareError('')
    try {
      let readySale = sale
      if (!readySale.pdf_url) readySale = await retryPdf(sale)
      if (requestId !== shareRequestRef.current || !readySale?.pdf_url) throw new Error('PDF unavailable')
      const response = await fetch(readySale.pdf_url)
      if (!response.ok) throw new Error('PDF download failed')
      const pdf = await response.blob()
      const isImage = format === 'image'
      const blob = isImage ? await renderQuotePdfAsPng(await pdf.arrayBuffer()) : pdf
      const extension = isImage ? 'png' : 'pdf'
      const file = new File([blob], `comprobante-${readySale.numero_transaccion || 'venta'}.${extension}`, { type: isImage ? 'image/png' : 'application/pdf' })
      const result = await shareOrDownloadFile(file, { title: 'Comprobante de venta Poder Oculto', text: saleShareText(readySale.clientes?.nombre, readySale.total) })
      if (requestId !== shareRequestRef.current) return
      if (result === 'downloaded') setShareNotice('Se descargó el archivo. Adjúntalo manualmente en WhatsApp.')
      setShareTarget(null)
    } catch { if (requestId === shareRequestRef.current) setShareError('No se pudo preparar el archivo para compartir. Inténtalo de nuevo.') }
    finally { if (requestId === shareRequestRef.current) setSharingFormat('') }
  }

  async function closeSuccess() {
    setWizard(false)
    setStep(1)
    setCreatedSale(null)
    setEditingSale(null)
    setLines([])
    setQuantities({})
    setAbonoModal(false)
    insertIdRef.current = null
    insertPayloadRef.current = null
    stockAppliedRef.current = null
    await refresh()
  }

  const visibleProducts = products.filter((product) => product.nombre.toLocaleLowerCase('es').includes(productSearch.trim().toLocaleLowerCase('es')))
  const visibleCustomers = customers.filter((customer) => customer.nombre.toLocaleLowerCase('es').includes(customerSearch.trim().toLocaleLowerCase('es')))
  const visibleSales = useMemo(() => sales.filter((sale) => String(sale.clientes?.nombre || 'Sin cliente').toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es'))), [sales, search])
  const totalIncome = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)

  return <section className="admin-sales" aria-labelledby="sales-title">
    {!wizard && <>
      <div className="admin-sales-toolbar"><div><h2 id="sales-title">Balance</h2><p>Consulta tus ventas, ingresos y comprobantes.</p></div><button className="button button-primary" onClick={() => beginWizard()}>+ Nueva venta</button></div>
      <div className="admin-sales-summary"><span>Ingresos totales</span><strong>{formatPrice(totalIncome)}</strong><small>{visibleSales.length} {visibleSales.length === 1 ? 'venta' : 'ventas'}</small></div>
      <label className="admin-sale-search">Buscar cliente<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre del cliente" /></label>
      {message && <p className="notice" role="status">{message}</p>}
      {shareNotice && <p className="admin-sale-share-notice" role="status">{shareNotice}</p>}
      {loading ? <p>Cargando ventas…</p> : !visibleSales.length ? <p>{search.trim() ? 'No hay ventas que coincidan con la búsqueda.' : 'Aún no hay ventas registradas.'}</p> : <div className="admin-sale-list">{visibleSales.map((sale) => {
        const balance = Math.max(0, Number(sale.total || 0) - Number(sale.abono_valor || 0))
        return <article className="admin-sale-card" key={sale.id}>
          <div className="admin-sale-card-main"><strong>{sale.fecha || sale.created_at?.slice(0, 10)}</strong><span>{sale.clientes?.nombre || 'Sin cliente'}</span><b>{formatPrice(sale.total)}</b><small className={saleEstadoLabel(sale) === 'Pagada' ? 'sale-paid' : 'sale-debt'}>{sale.estado_pago === 'deuda' && balance > 0 ? `Deuda · Saldo pendiente ${formatPrice(balance)}` : saleEstadoLabel(sale)}</small></div>
          <div className="admin-sale-actions">{sale.pdf_url && <a className="button button-dark button-small" href={sale.pdf_url} target="_blank" rel="noreferrer">Ver comprobante</a>}<button className="button button-outline button-small" onClick={() => openShare(sale)}>Compartir</button><button className="button button-outline button-small" onClick={() => beginEdit(sale)}>Editar</button><button className="button button-danger button-small" disabled={busy} onClick={() => deleteSale(sale)}>Eliminar</button></div>
        </article>
      })}</div>}
    </>}

    {wizard && <div ref={wizardRef} className="admin-sale-wizard" role="dialog" aria-modal="true" aria-labelledby="sale-wizard-title">
      <div className="admin-sale-heading"><div><span className="eyebrow">BALANCE · {step < 4 ? `PASO ${step} DE 3` : 'COMPROBANTE'}</span><h2 id="sale-wizard-title">{step === 1 ? 'Seleccionar productos' : step === 2 ? 'Confirmar precios y cantidades' : step === 3 ? (editingSale ? 'Editar venta' : 'Datos de la venta') : '¡Creaste una venta!'}</h2></div>{step < 4 && <button className="button button-outline button-small" disabled={busy} onClick={cancelWizard}>Cancelar</button>}</div>
      {step === 1 && <><label className="admin-sale-search">Buscar producto<input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Nombre del producto" /></label><div className="admin-sale-products">{visibleProducts.map((product) => <article className="admin-sale-product" key={product.id}><img src={product.producto_fotos?.[0]?.url || '/brand/mark.svg'} alt=""/><div><strong>{product.nombre}</strong><span>{formatPrice(product.precio)}</span><small className={Number(product.stock) > 0 ? 'sale-stock-ok' : 'sale-stock-low'}>{product.stock} disponibles</small></div><div className="admin-sale-quantity"><button aria-label={`Disminuir ${product.nombre}`} onClick={() => adjustProduct(product.id, -1)}>−</button><output>{Number(quantities[product.id]) || 0}</output><button aria-label={`Aumentar ${product.nombre}`} onClick={() => adjustProduct(product.id, 1)}>+</button></div></article>)}</div><div className="admin-sale-sticky"><span>{selectedUnitCount} unidades · {formatPrice(selectedSubtotal)}</span><button className="button button-dark" disabled={!selectedUnitCount} onClick={goToLines}>Añadir productos</button></div></>}
      {step === 2 && <><p className="admin-sale-inventory-notice">Al crear la venta se descontarán las unidades seleccionadas de tu inventario.</p><div className="admin-sale-line-list">{lines.map((line) => <article className="admin-sale-line" key={line.producto_id}><img src={line.imagen_url || '/brand/mark.svg'} alt=""/><strong>{line.nombre}</strong><label>Cantidad<input aria-label={`Cantidad ${line.nombre}`} type="number" min="1" step="1" value={line.cantidad} onChange={(event) => changeLine(line.producto_id, 'cantidad', event.target.value === '' ? '' : Number(event.target.value))}/></label><label>Precio unitario<input aria-label={`Precio unitario ${line.nombre}`} type="number" min="0" step="1" value={line.precio_unitario} onChange={(event) => changeLine(line.producto_id, 'precio_unitario', event.target.value === '' ? '' : Number(event.target.value))}/></label><button className="button button-danger button-small" onClick={() => removeLine(line.producto_id)}>Eliminar</button></article>)}</div><div className="admin-sale-sticky"><button className="button button-outline" onClick={() => setStep(1)}>Seleccionar más productos</button><span>{formatPrice(subtotal)}</span><button className="button button-dark" onClick={continueToDetails}>Continuar</button></div></>}
      {step === 3 && <><div className="admin-sale-details">
        <fieldset className="admin-sale-payment-toggle"><legend>Estado de pago</legend><button type="button" className={paymentState === 'pagado' ? 'active paid' : ''} onClick={() => { setPaymentState('pagado'); setValidation('') }}>Pagado</button><button type="button" className={paymentState === 'deuda' ? 'active debt' : ''} onClick={() => { setPaymentState('deuda'); setPaymentMethod('') }}>Deuda</button></fieldset>
        <div className="admin-sale-date"><span>Fecha de la venta: {saleDate}</span><button type="button" className="button button-outline button-small" onClick={() => setShowDateInput((show) => !show)}>Editar</button>{showDateInput && <input aria-label="Fecha de la venta" type="date" value={saleDate} onChange={(event) => setSaleDate(event.target.value)}/>}</div>
        {paymentState === 'pagado' && <fieldset className="admin-sale-methods"><legend>Método de pago *</legend>{PAYMENT_METHODS.map(({ value, label }) => <button type="button" key={value} className={paymentMethod === value ? 'active' : ''} onClick={() => setPaymentMethod(value)}>{label}</button>)}</fieldset>}
        <div className="admin-sale-discount"><label>Descuento %<input aria-label="Descuento porcentaje" type="number" min="0" max="100" step="0.01" value={discountMode === 'percent' ? discountPercent : finalDiscountPercent} onChange={(event) => updateDiscountPercent(event.target.value)}/></label><label>Descuento COP<input aria-label="Descuento valor" type="number" min="0" step="1" value={discountValue} onChange={(event) => updateDiscountValue(event.target.value)}/></label></div>
        <div className="admin-sale-customer"><strong>Cliente (opcional)</strong>{selectedCustomer ? <div className="admin-sale-selected-customer"><span>{selectedCustomer.nombre}</span><button type="button" className="button button-outline button-small" onClick={() => setSelectedCustomer(null)}>Quitar cliente</button></div> : <><input aria-label="Buscar cliente" placeholder="Buscar cliente" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)}/><div className="admin-sale-customer-options">{visibleCustomers.slice(0, 8).map((customer) => <button type="button" key={customer.id} onClick={() => setSelectedCustomer(customer)}>{customer.nombre} · {customer.celular}</button>)}</div><button type="button" className="button button-outline button-small" onClick={() => setShowNewCustomer((show) => !show)}>{showNewCustomer ? 'Cancelar nuevo cliente' : '+ Crear cliente'}</button>{showNewCustomer && <form className="admin-sale-new-customer" onSubmit={createInlineCustomer}><label>Nombre<input required value={newCustomer.nombre} onChange={(event) => setNewCustomer({ ...newCustomer, nombre: event.target.value })}/></label><label>Celular<input required value={newCustomer.celular} onChange={(event) => setNewCustomer({ ...newCustomer, celular: event.target.value })}/></label><label>Dirección<input value={newCustomer.direccion} onChange={(event) => setNewCustomer({ ...newCustomer, direccion: event.target.value })}/></label><button className="button button-dark button-small" disabled={busy}>Guardar cliente</button></form>}</>}</div>
        <button type="button" className="admin-sale-lines-summary" onClick={() => { setQuantities(Object.fromEntries(lines.map((line) => [line.producto_id, Number(line.cantidad)]))); setStep(1) }}>Seleccionar productos · {lines.length} referencias · {lines.reduce((sum, line) => sum + Number(line.cantidad || 0), 0)} unidades · {formatPrice(total)}</button>
        <details className="admin-sale-more-options"><summary>Más opciones</summary><label>Concepto<textarea value={concept} onChange={(event) => { setConcept(event.target.value); setConceptEdited(true) }} maxLength="300"/></label><label>Nota en el comprobante<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength="500"/></label></details>
        <div className="admin-sale-total-row"><span>Total</span><strong>{formatPrice(total)}</strong></div>
      </div><div className="admin-sale-sticky"><span>{lines.reduce((sum, line) => sum + Number(line.cantidad || 0), 0)} unidades · {formatPrice(total)}</span><button className="button button-dark" disabled={busy} onClick={handleSave}>{busy ? 'Guardando…' : 'Guardar'}</button></div></>}
      {validation && <p className="form-status error-text" role="alert">{validation}</p>}
      {stockWarning && <p className="form-status error-text" role="alert">{stockWarning}</p>}
      {step === 4 && createdSale && <div className="admin-sale-success"><div aria-hidden="true">✓</div><h3>¡Creaste una venta!</h3><p>Así se descuentan las unidades de tu inventario.</p><div className="admin-sale-success-stats"><span><strong>{createdSale.items?.length || lines.length}</strong>Productos vendidos</span><span><strong>{(createdSale.items || lines).reduce((sum, line) => sum + Number(line.cantidad || 0), 0)}</strong>Unidades totales</span></div><p>Se registró en tu balance por un valor de <strong>{formatPrice(createdSale.total)}</strong>.</p>{stockWarning && <p role="alert">{stockWarning}</p>}{pdfError && <p role="alert">{pdfError}</p>}{downloadError && <p role="alert">{downloadError}</p>}<button className="button button-dark" disabled={!createdSale.pdf_url || busy} onClick={() => downloadReceipt(createdSale)}>Descargar comprobante</button>{pdfError && <button className="button button-outline" disabled={busy} onClick={() => retryPdf(createdSale)}>Reintentar PDF</button>}<button className="button button-outline" onClick={() => openShare(createdSale)}>Compartir comprobante</button><button className="button button-outline" onClick={closeSuccess}>Cerrar y volver a Balance</button></div>}
    </div>}

    {abonoModal && <div className="admin-sale-modal-overlay"><div ref={partialPaymentRef} className="admin-sale-modal" role="dialog" aria-modal="true" aria-labelledby="partial-payment-title"><div className="admin-sale-modal-heading"><h3 id="partial-payment-title">Abono parcial</h3><button aria-label="Cerrar abono parcial" onClick={() => saveSale(editingSale ? Number(editingSale.abono_valor || 0) : 0)} disabled={busy}>×</button></div><label>Abono (opcional)<input type="number" min="0" step="1" value={abonoInput} onChange={(event) => setAbonoInput(event.target.value)}/></label><p>Valor total venta: <strong>{formatPrice(total)}</strong></p><p>Deuda: <strong>{formatPrice(Math.max(0, total - (Number(abonoInput) || 0)))}</strong></p>{Number(abonoInput) > 0 && <fieldset className="admin-sale-methods"><legend>Método de pago del abono *</legend>{PAYMENT_METHODS.map(({ value, label }) => <button type="button" key={value} className={paymentMethod === value ? 'active' : ''} onClick={() => setPaymentMethod(value)}>{label}</button>)}</fieldset>}{validation && <p role="alert">{validation}</p>}<button className="button button-dark" disabled={busy} onClick={() => saveSale(abonoInput)}>{busy ? 'Guardando…' : 'Registrar abono'}</button></div></div>}

    {shareTarget && <div className="admin-sale-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) { shareRequestRef.current += 1; setShareTarget(null) } }}><div ref={shareDialogRef} className="admin-sale-modal" role="dialog" aria-modal="true" aria-labelledby="sale-share-title"><div className="admin-sale-modal-heading"><h3 id="sale-share-title">Compartir comprobante</h3><button aria-label="Cerrar compartir" onClick={() => { shareRequestRef.current += 1; setShareTarget(null) }}>×</button></div><button className="admin-sale-share-option" disabled={Boolean(sharingFormat)} onClick={() => shareSaleFile('image')}>▧　Compartir como imagen</button><button className="admin-sale-share-option" disabled={Boolean(sharingFormat)} onClick={() => shareSaleFile('pdf')}>▤　Compartir como PDF</button>{sharingFormat && <p role="status">Preparando archivo…</p>}{shareError && <p role="alert">{shareError}</p>}</div></div>}
  </section>
}

export default AdminSalesPanel
