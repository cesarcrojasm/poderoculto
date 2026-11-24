import { jsPDF } from 'jspdf'
import { formatPrice } from './commerce'
import { formatDate } from './cotizaciones'
import { PAYMENT_METHODS, saleEstadoLabel } from './ventas'
import { QUOTE_BUSINESS } from './quotePdf'

export const SALE_BUSINESS = QUOTE_BUSINESS
const METHOD_LABELS = Object.fromEntries(PAYMENT_METHODS.map(({ value, label }) => [value, label]))

function pageIfNeeded(doc, y, margin = 18) {
  if (y > 260) { doc.addPage(); return margin }
  return y
}

function imageToPng(url) {
  if (!url || typeof Image === 'undefined' || !globalThis.CanvasRenderingContext2D) return Promise.resolve(null)
  return new Promise((resolve) => {
    const image = new Image()
    const timer = setTimeout(() => resolve(null), 1800)
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      clearTimeout(timer)
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 140
        canvas.height = 140
        const context = canvas.getContext('2d')
        if (!context) { resolve(null); return }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      } catch { resolve(null) }
    }
    image.onerror = () => { clearTimeout(timer); resolve(null) }
    image.src = url
  })
}

export function getSalePdfContent(venta, { now = new Date() } = {}) {
  const customerName = String(venta.cliente?.nombre || venta.clientes?.nombre || venta.cliente_nombre || '')
  const note = String(venta.nota || '').trim()
  return {
    stamp: formatDate(now, { hour: '2-digit', minute: '2-digit' }),
    business: SALE_BUSINESS,
    customerName,
    seller: SALE_BUSINESS.seller,
    rows: (venta.items || []).map((item) => {
      const description = String(item.descripcion || '').trim()
      return { item, description: description.length > 180 ? `${description.slice(0, 179)}…` : description, quantity: String(item.cantidad), unitPrice: formatPrice(item.precio_unitario), value: formatPrice(item.valor ?? Number(item.cantidad) * Number(item.precio_unitario)) }
    }),
    discountValue: Number(venta.descuento_valor) > 0 ? formatPrice(venta.descuento_valor) : null,
    subtotal: formatPrice(venta.subtotal),
    total: formatPrice(venta.total),
    metodoPago: venta.metodo_pago ? METHOD_LABELS[venta.metodo_pago] || String(venta.metodo_pago) : null,
    estadoLabel: saleEstadoLabel(venta),
    numeroTransaccion: String(venta.numero_transaccion ?? ''),
    notaText: note ? `Nota: ${note}` : '',
  }
}

export async function generateSalePdf(venta, { now = new Date() } = {}) {
  const content = getSalePdfContent(venta, { now })
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 16
  const right = pageWidth - margin
  const logo = await imageToPng('/brand/mark.svg')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(content.stamp, right, 16, { align: 'right' })
  if (logo) doc.addImage(logo, 'PNG', margin, 20, 24, 24)
  else {
    doc.setDrawColor(178, 141, 79)
    doc.circle(margin + 12, 32, 11)
    doc.setFontSize(6)
    doc.text('PODER', margin + 12, 31, { align: 'center' })
    doc.text('OCULTO', margin + 12, 35, { align: 'center' })
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(content.business.name, margin + 30, 27)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Tel. ${content.business.phone}  ·  ${content.business.email}`, margin + 30, 34)
  doc.text(`Identificación: ${content.business.identification}`, margin + 30, 40)
  doc.setDrawColor(178, 141, 79)
  doc.line(margin, 50, right, 50)

  let y = 59
  const metadata = [
    ...(content.customerName ? [['Contacto', content.customerName]] : []),
    ['Fecha', content.stamp],
    ['Vendedor', content.seller],
    ...(content.metodoPago ? [['Método de pago', content.metodoPago]] : []),
    ['Estado', content.estadoLabel],
    ['Número de transacción', content.numeroTransaccion],
  ]
  for (const [label, value] of metadata) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(label, margin, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, margin + 42, y)
    y += 6
  }
  y += 5
  const columns = { product: margin + 2, quantity: 133, unit: 163, value: right }
  const drawTableHeader = (top) => {
    doc.setFillColor(243, 236, 221)
    doc.rect(margin, top - 5, pageWidth - 2 * margin, 9, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('Productos', columns.product, top)
    doc.text('Cantidad', columns.quantity, top, { align: 'center' })
    doc.text('Precio unitario', columns.unit, top, { align: 'right' })
    doc.text('Valor', columns.value, top, { align: 'right' })
    return top + 10
  }
  y = drawTableHeader(y)
  for (const { item, description, quantity, unitPrice, value } of content.rows) {
    const nameLines = doc.splitTextToSize(String(item.nombre || ''), 94)
    const descriptionLines = doc.splitTextToSize(description, 94)
    const rowHeight = Math.max(14, (nameLines.length + descriptionLines.length) * 3.6 + 3)
    if (y + rowHeight > 276) { doc.addPage(); y = drawTableHeader(margin) }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(nameLines, columns.product, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    if (descriptionLines.length) doc.text(descriptionLines, columns.product, y + nameLines.length * 3.6)
    doc.text(quantity, columns.quantity, y, { align: 'center' })
    doc.text(unitPrice, columns.unit, y, { align: 'right' })
    doc.text(value, columns.value, y, { align: 'right' })
    y += rowHeight
    doc.setDrawColor(225, 216, 201)
    doc.line(margin, y, right, y)
    y += 5
  }
  y = pageIfNeeded(doc, y + 2)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Detalle del pago', margin, y)
  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  if (content.discountValue) {
    doc.text('Descuento', right - 53, y)
    doc.text(`-${content.discountValue}`, right, y, { align: 'right' })
    y += 6
  }
  doc.text('Subtotal', right - 53, y)
  doc.text(content.subtotal, right, y, { align: 'right' })
  y += 8
  if (content.notaText) {
    const noteLines = doc.splitTextToSize(content.notaText, pageWidth - 2 * margin)
    if (y + noteLines.length * 4.5 > 276) { doc.addPage(); y = margin }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(noteLines, margin, y)
    y += noteLines.length * 4.5 + 4
  }
  y = pageIfNeeded(doc, y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('Total', right - 53, y)
  doc.text(content.total, right, y, { align: 'right' })
  return doc
}
